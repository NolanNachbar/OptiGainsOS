// replan-day — fire an engine workflow on demand.
//
// Two events: "replan-day" rewrites today's prescription (the default, and what
// the equipment toggle uses); "regenerate-week" reflows the week after a
// programmed day is overridden by hand.
//
// The equipment filter (scripts/engine/equipment_profiles.py) lives in the Python
// engine, which only runs on the 10:00 UTC cron. So flipping equipment_profile to
// "casper" at noon wrote the column and changed nothing on screen: the morning's
// full-gym session, cables and machines included, stayed up until the next day's
// cron. The filter was never broken — nothing re-ran it.
//
// This posts a repository_dispatch to .github/workflows/replan-day.yml, which runs
// validate + mpc_prescriber and rewrites today's training_prescription row. Round
// trip is roughly 60-90 seconds, so the caller must show a pending state and
// invalidate the prescription query when the new row lands (see
// src/hooks/useUserQueries.js).
//
// Env (Supabase function secrets):
//   GITHUB_DISPATCH_TOKEN  fine-grained PAT, "Actions: read and write" on the repo
//   GITHUB_REPO            owner/name, defaults to NolanNachbar/OptiGainsOS
//
// Why a PAT rather than the client calling GitHub itself: the token must never
// reach the browser, and Supabase secrets are the only place this app already
// keeps server-side credentials.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GITHUB_TOKEN = Deno.env.get("GITHUB_DISPATCH_TOKEN") ?? "";
const GITHUB_REPO = Deno.env.get("GITHUB_REPO") ?? "NolanNachbar/OptiGainsOS";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (!GITHUB_TOKEN) {
    return json({ error: "GITHUB_DISPATCH_TOKEN is not set on this function" }, 500);
  }

  // The reason is echoed into the workflow run so a surprise prescription change
  // is traceable to what triggered it. The prescriber reads current state from the
  // database; nothing in the payload steers it.
  // event_type picks which workflow to fire. Whitelisted rather than passed
  // through: the token can start any workflow in the repo, so the browser must
  // not get to name one. Overriding a programmed day asks for the WEEK to reflow,
  // not just today, which is why "regenerate-week" exists alongside the default.
  const EVENTS = new Set(["replan-day", "regenerate-week"]);
  let reason = "manual";
  let eventType = "replan-day";
  try {
    const body = await req.json();
    if (typeof body?.reason === "string") reason = body.reason.slice(0, 100);
    if (typeof body?.event_type === "string" && EVENTS.has(body.event_type)) {
      eventType = body.event_type;
    }
  } catch {
    // no body is fine
  }

  const resp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ event_type: eventType, client_payload: { reason } }),
  });

  // GitHub answers 204 with an empty body on success.
  if (resp.status !== 204) {
    const detail = await resp.text();
    console.error(`dispatch failed: HTTP ${resp.status} — ${detail}`);
    return json({ error: "dispatch failed", status: resp.status, detail }, 502);
  }

  console.log(`dispatched ${eventType} (reason: ${reason})`);
  return json({ ok: true, reason, event_type: eventType });
});
