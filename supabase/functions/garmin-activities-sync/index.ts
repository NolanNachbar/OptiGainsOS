import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Garmin ACTIVITY sync (runs/rides/swims) → garmin_activities ────────────────
// Companion to garmin-sync (which pulls daily *wellness* into recovery_metrics).
// This one pulls the *activity list* — the data the VDOT/cardio engine reads from
// garmin_activities (compute_athlete_state.py / mpc_prescriber.py). garmin-sync
// never populated that table, so VDOT silently ran on stale/empty data.
//
// Invoked ON-DEMAND when the athlete checks a prescribed cardio session done
// (see src/hooks/useCardioCompletions.js) — no cron. It is idempotent and pulls a
// recent window, so it self-backfills: if the watch hasn't synced this run up to
// Garmin Connect yet, the next "cardio done" tap catches it.
//
// Auth is identical to garmin-sync: a long-lived OAuth1 token cached in
// garmin_tokens is exchanged for a short-lived OAuth2 bearer against
// connectapi.garmin.com (not bot-walled). Re-seed garmin_tokens if it 401s.

const CONNECTAPI = "https://connectapi.garmin.com";
const UA = "GCM-iOS-5.7.2.1";
const CONSUMER_KEY_FALLBACK = "fc3e99d2-118c-44b8-8ae3-03370dde24c0";
const CONSUMER_SECRET_FALLBACK = "E08WAR897WEy2knn7aFBrvegVAf0AFdWBBF";
const ACTIVITY_LIMIT = 20; // recent window — covers a week+ of training, dedup handles overlap

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const USER_ID = Deno.env.get("USER_ID")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── OAuth1 signing (identical to garmin-sync) ─────────────────────────────────

function pe(s: string): string {
  return encodeURIComponent(s).replace(/[!*'()]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

async function hmacSha1B64(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function oauth1Header(method: string, url: string, consumerKey: string, consumerSecret: string, token?: string, tokenSecret?: string): Promise<string> {
  const u = new URL(url);
  const oauth: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: "1.0",
  };
  if (token) oauth.oauth_token = token;
  const params: [string, string][] = [];
  for (const [k, v] of u.searchParams) params.push([k, v]);
  for (const [k, v] of Object.entries(oauth)) params.push([k, v]);
  const paramStr = params
    .map(([k, v]) => [pe(k), pe(v)] as [string, string])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const base = `${method.toUpperCase()}&${pe(u.origin + u.pathname)}&${pe(paramStr)}`;
  oauth.oauth_signature = await hmacSha1B64(`${pe(consumerSecret)}&${pe(tokenSecret || "")}`, base);
  return "OAuth " + Object.entries(oauth).map(([k, v]) => `${pe(k)}="${pe(v)}"`).join(", ");
}

async function getConsumer(): Promise<{ key: string; secret: string }> {
  try {
    const r = await fetch("https://thegarth.s3.amazonaws.com/oauth_consumer.json");
    if (r.ok) {
      const j = await r.json();
      if (j?.consumer_key && j?.consumer_secret) return { key: j.consumer_key, secret: j.consumer_secret };
    }
  } catch { /* fallback */ }
  return { key: CONSUMER_KEY_FALLBACK, secret: CONSUMER_SECRET_FALLBACK };
}

async function exchangeOAuth2(oauth1: { token: string; secret: string }, consumer: { key: string; secret: string }): Promise<{ token: string; expiresIn: number }> {
  const url = `${CONNECTAPI}/oauth-service/oauth/exchange/user/2.0`;
  const auth = await oauth1Header("POST", url, consumer.key, consumer.secret, oauth1.token, oauth1.secret);
  const r = await fetch(url, {
    method: "POST",
    headers: { "User-Agent": UA, "Authorization": auth, "Content-Type": "application/x-www-form-urlencoded" },
    body: "",
  });
  if (r.status === 401) throw new Error("Stored Garmin OAuth1 token is expired/invalid — re-seed garmin_tokens (see garmin-sync setup notes).");
  if (!r.ok) throw new Error(`OAuth2 exchange failed: ${r.status}`);
  const j = await r.json();
  if (!j.access_token) throw new Error("OAuth2 access_token missing.");
  return { token: j.access_token as string, expiresIn: Number(j.expires_in) || 3600 };
}

function bearerHeaders(accessToken: string): Record<string, string> {
  return { "User-Agent": UA, "Authorization": `Bearer ${accessToken}`, "NK": "NT", "Di-Backend": "connectapi.garmin.com" };
}

async function garminLogin(): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("garmin_tokens")
    .select("oauth_token, oauth_token_secret, oauth2_token, oauth2_expires_at")
    .eq("created_by", USER_ID)
    .maybeSingle();
  if (error) throw new Error(`garmin_tokens read failed: ${error.message}`);
  if (!data?.oauth_token) throw new Error("No Garmin OAuth1 token stored — run the one-time seed (see garmin-sync setup notes).");

  // Reuse the cached OAuth2 bearer while it's fresh (2-min safety buffer) so we
  // don't hit Garmin's throttled exchange endpoint on every on-demand sync.
  const now = Date.now();
  const cachedExp = data.oauth2_expires_at ? Date.parse(data.oauth2_expires_at) : 0;
  if (data.oauth2_token && cachedExp > now + 120_000) {
    console.log("reusing cached OAuth2 bearer");
    return bearerHeaders(data.oauth2_token);
  }

  const consumer = await getConsumer();
  try {
    const { token, expiresIn } = await exchangeOAuth2({ token: data.oauth_token, secret: data.oauth_token_secret }, consumer);
    // Persist for reuse; shave 60s off the lifetime as a clock-skew buffer.
    const expiresAt = new Date(now + Math.max(60, expiresIn - 60) * 1000).toISOString();
    await supabase.from("garmin_tokens").update({ oauth2_token: token, oauth2_expires_at: expiresAt }).eq("created_by", USER_ID);
    console.log("exchanged + cached new OAuth2 bearer");
    return bearerHeaders(token);
  } catch (e) {
    // Throttled at the exchange but we still have a cached bearer? Use it — it may
    // be a hair past the buffer but is very likely still valid for data calls.
    if ((e as Error).message.includes("429") && data.oauth2_token) {
      console.log("exchange 429 — falling back to stale cached bearer");
      return bearerHeaders(data.oauth2_token);
    }
    throw e;
  }
}

// ── Activity list → garmin_activities rows ────────────────────────────────────

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapActivity(a: Record<string, unknown>): Record<string, unknown> | null {
  const activityId = num(a.activityId);
  if (activityId == null) return null;

  // startTimeLocal: "2026-06-05 07:30:00" → take the date portion.
  const startLocal = (a.startTimeLocal as string) || (a.startTimeGMT as string) || "";
  const activityDate = startLocal.slice(0, 10) || null;
  if (!activityDate) return null;

  const typeKey = (a.activityType as Record<string, unknown> | undefined)?.typeKey as string | undefined;
  const speedMps = num(a.averageSpeed); // m/s
  const pace = speedMps && speedMps > 0 ? Math.round((1000 / speedMps) * 100) / 100 : null; // sec/km

  return {
    created_by: USER_ID,
    activity_id: activityId,
    activity_date: activityDate,
    activity_type: typeKey ?? "unknown",
    name: (a.activityName as string) ?? null,
    duration_seconds: num(a.duration) != null ? Math.round(num(a.duration)!) : null,
    distance_meters: num(a.distance),
    avg_hr: num(a.averageHR) != null ? Math.round(num(a.averageHR)!) : null,
    max_hr: num(a.maxHR) != null ? Math.round(num(a.maxHR)!) : null,
    calories: num(a.calories) != null ? Math.round(num(a.calories)!) : null,
    avg_pace_sec_per_km: pace,
    avg_speed_mps: speedMps,
    training_load: num(a.activityTrainingLoad),
    aerobic_effect: num(a.aerobicTrainingEffect),
    raw: a,
  };
}

async function syncActivities(): Promise<{ fetched: number; inserted: number }> {
  const headers = await garminLogin();
  console.log("garminLogin OK — fetching activity list");
  const list = await fetch(
    `${CONNECTAPI}/activitylist-service/activities/search/activities?start=0&limit=${ACTIVITY_LIMIT}`,
    { headers },
  );
  console.log(`activity list HTTP ${list.status}`);
  if (!list.ok) {
    const body = await list.text().catch(() => "");
    throw new Error(`activity list fetch failed: ${list.status} ${body.slice(0, 200)}`);
  }
  const activities = (await list.json()) as Array<Record<string, unknown>>;
  console.log(`activity list returned ${Array.isArray(activities) ? activities.length : "non-array"}`);
  if (!Array.isArray(activities) || activities.length === 0) return { fetched: 0, inserted: 0 };

  const rows = activities.map(mapActivity).filter((r): r is Record<string, unknown> => r !== null);
  const ids = rows.map((r) => r.activity_id as number);

  // Dedup against what we already have (no DB unique constraint required).
  const { data: existing, error: selErr } = await supabase
    .from("garmin_activities")
    .select("activity_id")
    .eq("created_by", USER_ID)
    .in("activity_id", ids);
  if (selErr) throw new Error(`existing-id lookup failed: ${selErr.message}`);
  const have = new Set((existing || []).map((r) => Number(r.activity_id)));

  const toInsert = rows.filter((r) => !have.has(Number(r.activity_id)));
  console.log(`mapped ${rows.length} rows, ${have.size} already present, inserting ${toInsert.length}`);
  if (toInsert.length) {
    const { error: insErr } = await supabase.from("garmin_activities").insert(toInsert);
    if (insErr) throw new Error(`insert failed: ${insErr.message} | sample=${JSON.stringify(toInsert[0]).slice(0, 300)}`);
  }
  return { fetched: rows.length, inserted: toInsert.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const result = await syncActivities();
    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("garmin-activities-sync error:", (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
