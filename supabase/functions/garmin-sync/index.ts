import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GARMIN_SSO_URL = "https://sso.garmin.com/sso/signin";
const GARMIN_API_URL = "https://connect.garmin.com";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const USER_ID = Deno.env.get("USER_ID")!;
const GARMIN_EMAIL = Deno.env.get("GARMIN_EMAIL")!;
const GARMIN_PASSWORD = Deno.env.get("GARMIN_PASSWORD")!;

// ── Garmin auth ───────────────────────────────────────────────────────────────

async function garminLogin(): Promise<{ cookies: string; headers: Record<string, string> }> {
  const params = new URLSearchParams({
    service: "https://connect.garmin.com/modern/",
    webhost: "https://connect.garmin.com",
    source: "https://connect.garmin.com/signin/",
    redirectAfterAccountLoginUrl: "https://connect.garmin.com/modern/",
    redirectAfterAccountCreationUrl: "https://connect.garmin.com/modern/",
    gauthHost: "https://sso.garmin.com/sso",
    locale: "en_US",
    id: "gauth-widget",
    cssUrl: "https://static.garmincdn.com/com.garmin.connect/ui/css/gauth-custom-v1.2-min.css",
    clientId: "GarminConnect",
    rememberMeShown: "true",
    rememberMeChecked: "false",
    createAccountShown: "true",
    openCreateAccount: "false",
    displayNameShown: "false",
    consumeServiceTicket: "false",
    initialFocus: "true",
    embedWidget: "false",
    generateExtraServiceTicket: "true",
    generateTwoExtraServiceTickets: "false",
    generateNoServiceTicket: "false",
    globalOptInShown: "true",
    globalOptInChecked: "false",
    mobile: "false",
    connectLegalTerms: "true",
    showTermsOfUse: "false",
    showPrivacyPolicy: "false",
    showConnectLegalAge: "false",
    locationPromptShown: "true",
    showPassword: "true",
    useCustomHeader: "false",
    mfaRequired: "false",
    performMFACheck: "false",
    rememberMyBrowserShown: "false",
    rememberMyBrowserChecked: "false",
  });

  // Step 1: get CSRF token
  const signinResp = await fetch(`${GARMIN_SSO_URL}?${params}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const signinText = await signinResp.text();
  const csrfMatch = signinText.match(/name="_csrf"\s+value="([^"]+)"/);
  if (!csrfMatch) throw new Error("Could not find CSRF token");
  const csrf = csrfMatch[1];
  const signinCookies = signinResp.headers.get("set-cookie") || "";

  // Step 2: POST credentials
  const loginBody = new URLSearchParams({
    username: GARMIN_EMAIL,
    password: GARMIN_PASSWORD,
    embed: "false",
    _csrf: csrf,
  });

  const loginResp = await fetch(`${GARMIN_SSO_URL}?${params}`, {
    method: "POST",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": signinCookies,
      "Referer": `${GARMIN_SSO_URL}?${params}`,
    },
    body: loginBody.toString(),
    redirect: "manual",
  });

  const loginCookies = loginResp.headers.get("set-cookie") || "";
  const allCookies = [signinCookies, loginCookies].filter(Boolean).join("; ");

  // Step 3: follow redirects to get connect session cookies
  const modernResp = await fetch("https://connect.garmin.com/modern/", {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Cookie": allCookies,
    },
    redirect: "follow",
  });

  const modernCookies = modernResp.headers.get("set-cookie") || "";
  const finalCookies = [allCookies, modernCookies].filter(Boolean).join("; ");

  const authHeaders = {
    "User-Agent": "Mozilla/5.0",
    "Cookie": finalCookies,
    "NK": "NT",
    "X-app-ver": "4.69.1.0",
    "X-lang": "en-US",
    "Di-Backend": "connectapi.garmin.com",
  };

  return { cookies: finalCookies, headers: authHeaders };
}

async function garminGet(path: string, headers: Record<string, string>): Promise<unknown> {
  const resp = await fetch(`${GARMIN_API_URL}${path}`, { headers });
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

// ── pull metrics ──────────────────────────────────────────────────────────────

async function pullDay(headers: Record<string, string>, ds: string): Promise<Record<string, unknown>> {
  const row: Record<string, unknown> = {
    created_by: USER_ID,
    date: ds,
    source: "garmin",
  };

  const [sleep, hrv, hr, bb, stress, status, steps] = await Promise.allSettled([
    garminGet(`/proxy/wellness-service/wellness/dailySleepData/user?date=${ds}`, headers),
    garminGet(`/proxy/hrv-service/hrv/${ds}`, headers),
    garminGet(`/proxy/wellness-service/wellness/dailyHeartRate?date=${ds}`, headers),
    garminGet(`/proxy/wellness-service/wellness/bodyBattery/range/${ds}/${ds}`, headers),
    garminGet(`/proxy/wellness-service/wellness/dailyStress/${ds}`, headers),
    garminGet(`/proxy/training-info-service/trainingInfo/status/daily/${ds}`, headers),
    garminGet(`/proxy/wellness-service/wellness/dailySummaryChart?date=${ds}`, headers),
  ]);

  if (sleep.status === "fulfilled" && sleep.value) {
    const d = sleep.value as Record<string, unknown>;
    const dto = safe(d, "dailySleepDTO") as Record<string, unknown> | null;
    const scoreObj = safe(dto, "sleepScores", "overall") as Record<string, unknown> | null;
    row.sleep_score = safe(scoreObj, "value");
    const dur = safe(dto, "sleepTimeSeconds") as number | null;
    row.sleep_duration_min = dur ? Math.round(dur / 60) : null;
  }

  if (hrv.status === "fulfilled" && hrv.value) {
    row.hrv = safe(hrv.value as Record<string, unknown>, "hrvSummary", "lastNight");
  }

  if (hr.status === "fulfilled" && hr.value) {
    row.resting_hr = safe(hr.value as Record<string, unknown>, "restingHeartRate");
  }

  if (bb.status === "fulfilled" && bb.value) {
    const arr = bb.value as Array<Record<string, unknown>>;
    if (Array.isArray(arr) && arr.length > 0) {
      row.body_battery = arr[0].charged;
    }
  }

  if (stress.status === "fulfilled" && stress.value) {
    row.stress_score = safe(stress.value as Record<string, unknown>, "avgStressLevel");
  }

  if (status.status === "fulfilled" && status.value) {
    const s = status.value as Record<string, unknown>;
    row.training_load_acute = safe(s, "acuteLoad") ?? safe(s, "latestTrainingLoad");
    row.training_load_chronic = safe(s, "chronicLoad");
    const vo2obj = safe(s, "mostRecentVO2Max") as Record<string, unknown> | null;
    row.vo2max_run = typeof vo2obj === "object" && vo2obj
      ? (vo2obj.vo2MaxPreciseValue ?? vo2obj.vo2MaxValue)
      : safe(s, "vo2MaxValue");
  }

  if (steps.status === "fulfilled" && steps.value) {
    const arr = steps.value as Array<Record<string, unknown>>;
    if (Array.isArray(arr)) {
      row.steps = arr.reduce((sum, s) => sum + (Number(s.steps) || 0), 0);
    }
  }

  return row;
}

// ── upsert ────────────────────────────────────────────────────────────────────

async function upsertRecovery(row: Record<string, unknown>) {
  const clean = Object.fromEntries(Object.entries(row).filter(([, v]) => v != null));
  const { error } = await supabase
    .from("recovery_metrics")
    .upsert(clean, { onConflict: "created_by,date,source" });
  if (error) console.error("Upsert error:", error.message);
  else console.log("Upserted recovery_metrics for", clean.date);
}

// ── handler ───────────────────────────────────────────────────────────────────

Deno.serve(async () => {
  try {
    console.log("Garmin sync starting...");
    const { headers } = await garminLogin();
    console.log("Garmin login successful");

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const ds = yesterday.toISOString().slice(0, 10);

    const row = await pullDay(headers, ds);
    await upsertRecovery(row);

    return new Response(JSON.stringify({ success: true, date: ds }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Garmin sync failed:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
