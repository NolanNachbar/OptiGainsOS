// Duolingo-style "you forgot" nudge. Fired by pg_cron midday + evening.
// Sends a push ONLY if something is still pending today — silent otherwise, so
// you never get nagged on a finished day. Degrades gracefully if VAPID secrets /
// subscriptions aren't set.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const USER_ID = Deno.env.get("USER_ID")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY");

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async () => {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return json({ sent: 0, skipped: "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set as function secrets" });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: tasks } = await supabase
    .from("daily_tasks")
    .select("title")
    .eq("created_by", USER_ID)
    .eq("date", today)
    .eq("status", "pending")
    .order("sort_order", { ascending: true });

  const open = tasks ?? [];
  if (open.length === 0) {
    return json({ sent: 0, note: "nothing pending — staying quiet" });
  }

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth");
  if (!subs || subs.length === 0) {
    return json({ sent: 0, note: "no push_subscriptions — enable notifications in the app first" });
  }
  webpush.setVapidDetails("mailto:nolan@dewittdroneservices.com", VAPID_PUBLIC, VAPID_PRIVATE);

  const preview = open.slice(0, 3).map((t) => t.title).join(", ");
  const body = `Still open: ${preview}${open.length > 3 ? `, +${open.length - 3} more` : ""}`;
  const payload = JSON.stringify({ title: "Don't break the streak 🔥", body, url: "/" });

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      )
    ),
  );
  const ok = results.filter((r) => r.status === "fulfilled").length;
  return json({ sent: ok, attempted: subs.length, pending: open.length });
});
