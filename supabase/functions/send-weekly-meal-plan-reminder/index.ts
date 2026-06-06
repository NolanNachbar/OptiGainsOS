import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push";

// Sunday push: "your engine-optimal week is ready — review & approve". Scheduled
// via pg_cron. The plan is built + approved client-side in the Weekly Plan card;
// this brings it to you on Sunday, personalised with the engine's recovery-gated
// calorie target. Degrades gracefully if VAPID secrets / subscriptions aren't set.

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
    return json({ sent: 0, skipped: "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set as function secrets" });
  }
  webpush.setVapidDetails("mailto:nolan@dewittdroneservices.com", VAPID_PUBLIC, VAPID_PRIVATE);

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth");
  if (!subs || subs.length === 0) {
    return json({ sent: 0, note: "no push_subscriptions — enable notifications in the app first" });
  }

  // Personalise with the engine's latest recovery-gated calorie target.
  const today = new Date().toISOString().slice(0, 10);
  const { data: state } = await supabase
    .from("athlete_state").select("nutrition").lte("date", today)
    .order("date", { ascending: false }).limit(1).maybeSingle();
  const rec = (state?.nutrition as Record<string, unknown> | undefined)?.recommended_intake as
    | { calorie_target?: number; deficit_ratio?: number } | undefined;
  const target = rec?.calorie_target;
  const deficitPct = rec?.deficit_ratio != null ? Math.round(rec.deficit_ratio * 100) : null;
  const body = target
    ? `Engine-optimal week ready: ~${Math.round(target).toLocaleString()} kcal/day` +
      (deficitPct != null && deficitPct > 0 ? ` (${deficitPct}% deficit, recovery-gated)` : "") +
      ". Review & approve to pre-fill your log."
    : "Your weekly meal plan is ready — review & approve to pre-fill your log.";
  const payload = JSON.stringify({ title: "This Week's Plan 🍽️", body, url: "/fuel" });

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      )
    ),
  );
  const ok = results.filter((r) => r.status === "fulfilled").length;
  return json({ sent: ok, attempted: subs.length });
});
