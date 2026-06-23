// send-physique-reminder — weekly nudge to shoot progress photos. Mirrors
// send-weekly-checkin-reminder: pushes to every stored subscription. Scheduled
// Sunday morning via pg_cron (see migrations/schedule_physique_reminder.sql).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

webpush.setVapidDetails(
  "mailto:nolan@dewittdroneservices.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!
);

Deno.serve(async () => {
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth");

  const payload = JSON.stringify({
    title: "Physique photos",
    body: "Time for this week's progress shots. Tap to run the guided session through all 6 poses.",
    url: "/physique",
  });

  await Promise.allSettled(
    (subs ?? []).map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    )
  );

  return new Response("ok");
});
