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
  const today = new Date().toISOString().split("T")[0];

  // Find all active enrollments
  const { data: enrollments } = await supabase
    .from("program_enrollments")
    .select("user_id, start_date, cycle_length, current_cycle, current_day_index, program:programs(name)")
    .eq("status", "active");

  if (!enrollments?.length) return new Response("ok");

  const usersWithWorkoutToday = new Set<string>();

  for (const enrollment of enrollments) {
    const { start_date, cycle_length, current_cycle, user_id } = enrollment;
    if (!start_date || !cycle_length) continue;

    const start = new Date(start_date);
    const cycleStartOffset = (current_cycle - 1) * cycle_length;

    // Check each day in the current cycle
    for (let dayIndex = 1; dayIndex <= cycle_length; dayIndex++) {
      const d = new Date(start);
      d.setDate(d.getDate() + cycleStartOffset + dayIndex - 1);
      if (d.toISOString().split("T")[0] === today) {
        usersWithWorkoutToday.add(user_id);
        break;
      }
    }
  }

  if (!usersWithWorkoutToday.size) return new Response("ok");

  // Get push subscriptions for those users
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("user_id", [...usersWithWorkoutToday]);

  const payload = JSON.stringify({
    title: "Workout Day 💪",
    body: "You have a workout scheduled today. Let's get it done!",
    url: "/schedule",
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
