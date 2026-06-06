import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Garmin sync via cached OAuth1 token (token-cache pattern) ──────────────────
// Garmin's SSO host (sso.garmin.com) bot-blocks datacenter IPs with 403, so we
// cannot log in headlessly from Supabase. Instead we seed a long-lived OAuth1
// token ONCE from a residential IP (via garth — see README/setup), store it in
// `garmin_tokens`, and here we only refresh the short-lived OAuth2 bearer from
// it. The OAuth2 exchange + all data calls hit connectapi.garmin.com (the API
// host), which is NOT bot-walled — so the 403 never applies on the daily path.
//
// One-time seed (run on your machine, residential IP):
//   pip install garth
//   python -c "import garth; garth.login('EMAIL','PASSWORD'); t=garth.client.oauth1_token; print(t.oauth_token); print(t.oauth_token_secret)"
// then upsert the two values into garmin_tokens for your user id.
// The OAuth1 token lasts ~1 year; re-seed when sync starts 401-ing.

const CONNECTAPI = "https://connectapi.garmin.com";
const UA = "GCM-iOS-5.7.2.1";
const CONSUMER_KEY_FALLBACK = "fc3e99d2-118c-44b8-8ae3-03370dde24c0";
const CONSUMER_SECRET_FALLBACK = "E08WAR897WEy2knn7aFBrvegVAf0AFdWBBF";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const USER_ID = Deno.env.get("USER_ID")!;

// ── OAuth1 signing ────────────────────────────────────────────────────────────

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

async function getOAuth2(oauth1: { token: string; secret: string }, consumer: { key: string; secret: string }): Promise<string> {
  const url = `${CONNECTAPI}/oauth-service/oauth/exchange/user/2.0`;
  const auth = await oauth1Header("POST", url, consumer.key, consumer.secret, oauth1.token, oauth1.secret);
  const r = await fetch(url, {
    method: "POST",
    headers: { "User-Agent": UA, "Authorization": auth, "Content-Type": "application/x-www-form-urlencoded" },
    body: "",
  });
  if (r.status === 401) throw new Error("Stored Garmin OAuth1 token is expired/invalid — re-seed garmin_tokens (see setup notes).");
  if (!r.ok) throw new Error(`OAuth2 exchange failed: ${r.status}`);
  const j = await r.json();
  if (!j.access_token) throw new Error("OAuth2 access_token missing.");
  return j.access_token as string;
}

async function garminLogin(): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("garmin_tokens")
    .select("oauth_token, oauth_token_secret")
    .eq("created_by", USER_ID)
    .maybeSingle();
  if (error) throw new Error(`garmin_tokens read failed: ${error.message}`);
  if (!data?.oauth_token) throw new Error("No Garmin OAuth1 token stored — run the one-time seed (see setup notes).");

  const consumer = await getConsumer();
  const accessToken = await getOAuth2({ token: data.oauth_token, secret: data.oauth_token_secret }, consumer);
  return { "User-Agent": UA, "Authorization": `Bearer ${accessToken}`, "NK": "NT", "Di-Backend": "connectapi.garmin.com" };
}

// ── API calls ─────────────────────────────────────────────────────────────────

async function garminGet(path: string, headers: Record<string, string>): Promise<unknown> {
  const resp = await fetch(`${CONNECTAPI}${path}`, { headers });
  if (!resp.ok) return null;
  try { return await resp.json(); } catch { return null; }
}

function safe(obj: unknown, ...keys: string[]): unknown {
  let cur = obj;
  for (const k of keys) {
    if (!cur || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur ?? null;
}

async function getDisplayName(headers: Record<string, string>): Promise<string> {
  const j = await garminGet(`/userprofile-service/socialProfile`, headers);
  return (j && (j as Record<string, unknown>).displayName as string) || "";
}

async function pullDay(headers: Record<string, string>, ds: string, displayName: string): Promise<Record<string, unknown>> {
  const row: Record<string, unknown> = { created_by: USER_ID, date: ds, source: "garmin" };
  const sleepPath = displayName
    ? `/wellness-service/wellness/dailySleepData/${displayName}?date=${ds}&nonSleepBufferMinutes=60`
    : `/wellness-service/wellness/dailySleepData/user?date=${ds}`;

  const [sleep, hrv, hr, bb, stress, status, steps, maxmet] = await Promise.allSettled([
    garminGet(sleepPath, headers),
    garminGet(`/hrv-service/hrv/${ds}`, headers),
    garminGet(`/wellness-service/wellness/dailyHeartRate?date=${ds}`, headers),
    garminGet(`/wellness-service/wellness/bodyBattery/reports/daily?startDate=${ds}&endDate=${ds}`, headers),
    garminGet(`/wellness-service/wellness/dailyStress/${ds}`, headers),
    garminGet(`/training-info-service/trainingInfo/status/daily/${ds}`, headers),
    garminGet(`/wellness-service/wellness/dailySummaryChart?date=${ds}`, headers),
    garminGet(`/metrics-service/metrics/maxmet/daily/${ds}/${ds}`, headers),
  ]);

  if (sleep.status === "fulfilled" && sleep.value) {
    const d = sleep.value as Record<string, unknown>;
    const dto = safe(d, "dailySleepDTO") as Record<string, unknown> | null;
    const scoreObj = safe(dto, "sleepScores", "overall") as Record<string, unknown> | null;
    row.sleep_score = safe(scoreObj, "value");
    const dur = safe(dto, "sleepTimeSeconds") as number | null;
    row.sleep_duration_min = dur ? Math.round(dur / 60) : null;
  }
  if (hrv.status === "fulfilled" && hrv.value) row.hrv = safe(hrv.value as Record<string, unknown>, "hrvSummary", "lastNightAvg");
  if (hr.status === "fulfilled" && hr.value) row.resting_hr = safe(hr.value as Record<string, unknown>, "restingHeartRate");
  if (bb.status === "fulfilled" && bb.value) {
    // reports/daily → [{ bodyBatteryValuesArray: [[ts, status, level], ...], charged, ... }]
    const day = (Array.isArray(bb.value) ? bb.value[0] : bb.value) as Record<string, unknown> | undefined;
    const series = (day?.bodyBatteryValuesArray || day?.bodyBatteryValuesList) as unknown[] | undefined;
    if (Array.isArray(series) && series.length) {
      let maxLevel: number | null = null;
      for (const e of series) {
        const lvl = Array.isArray(e) ? Number(e[2] ?? e[1]) : Number((e as Record<string, unknown>)?.level);
        if (Number.isFinite(lvl)) maxLevel = maxLevel == null ? lvl : Math.max(maxLevel, lvl);
      }
      row.body_battery = maxLevel;
    } else if (day && typeof day.charged === "number") {
      row.body_battery = day.charged;
    }
  }
  if (stress.status === "fulfilled" && stress.value) row.stress_score = safe(stress.value as Record<string, unknown>, "avgStressLevel");
  if (status.status === "fulfilled" && status.value) {
    const s = status.value as Record<string, unknown>;
    row.training_load_acute = safe(s, "acuteLoad") ?? safe(s, "latestTrainingLoad");
    row.training_load_chronic = safe(s, "chronicLoad");
  }
  if (maxmet.status === "fulfilled" && maxmet.value) {
    // maxmet/daily → [{ generic: { vo2MaxValue, vo2MaxPreciseValue } }]
    const m = (Array.isArray(maxmet.value) ? maxmet.value[0] : maxmet.value) as Record<string, unknown> | undefined;
    const g = (m?.generic || m) as Record<string, unknown> | undefined;
    row.vo2max_run = (g?.vo2MaxPreciseValue ?? g?.vo2MaxValue ?? null) as number | null;
  }
  if (steps.status === "fulfilled" && steps.value) {
    const arr = steps.value as Array<Record<string, unknown>>;
    if (Array.isArray(arr)) row.steps = arr.reduce((sum, s) => sum + (Number(s.steps) || 0), 0);
  }
  return row;
}

async function upsertRecovery(row: Record<string, unknown>) {
  const clean = Object.fromEntries(Object.entries(row).filter(([, v]) => v != null));
  const { error } = await supabase.from("recovery_metrics").upsert(clean, { onConflict: "created_by,date,source" });
  if (error) console.error("Upsert error:", error.message);
}

Deno.serve(async () => {
  try {
    const headers = await garminLogin();
    const displayName = await getDisplayName(headers);
    const dates: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
    const populated: Record<string, boolean> = {};
    for (const ds of dates) {
      const row = await pullDay(headers, ds, displayName);
      await upsertRecovery(row);
      populated[ds] = Object.keys(row).length > 3;
    }
    return new Response(JSON.stringify({ success: true, dates, populated, displayName: displayName ? "ok" : "missing" }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
