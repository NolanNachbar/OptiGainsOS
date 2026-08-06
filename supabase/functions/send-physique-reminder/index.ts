// Weekly push: "time for physique photos."
// Fired by pg_cron Sunday 14:00 UTC.
//
// Rewritten 2026-08-06. The old version called webpush.setVapidDetails() at module
// top level with non-null assertions on the VAPID env vars, returned a bare "ok",
// and swallowed every per-subscription error inside Promise.allSettled — so a run
// that sent zero notifications was indistinguishable from a run that worked, and
// cron logged "succeeded" either way. This mirrors send-daily-brief-push: guard the
// secrets, set VAPID inside the handler, and return a real send count plus the
// actual failure reasons.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY");

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async () => {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.error("physique-reminder: VAPID keys not set as function secrets");
    return json({ sent: 0, skipped: "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set as function secrets" });
  }
  webpush.setVapidDetails("mailto:nolan@dewittdroneservices.com", VAPID_PUBLIC, VAPID_PRIVATE);

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth");
  if (error) {
    console.error("physique-reminder: subscription query failed", error.message);
    return json({ sent: 0, error: error.message }, 500);
  }
  if (!subs || subs.length === 0) {
    console.error("physique-reminder: no push_subscriptions rows");
    return json({ sent: 0, note: "no push_subscriptions — enable notifications in the app first" });
  }

  const payload = JSON.stringify({
    title: "Physique photos",
    body: "Time for this week's progress shots. Tap to run the guided session through all 6 poses.",
    url: "physique",
  });

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      )
    ),
  );
  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failures = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => String(r.reason?.statusCode ?? "") + " " + String(r.reason?.body ?? r.reason?.message ?? r.reason));
  if (failures.length) console.error("physique-reminder: send failures", failures);

  return json({ sent, attempted: subs.length, failures });
});
