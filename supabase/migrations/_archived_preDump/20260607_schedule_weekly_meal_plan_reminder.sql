-- Sunday meal-plan push reminder. Fires Sunday 15:00 UTC (~8-9am Mountain) so
-- there's time to review the engine-optimal week + shopping list and approve.
-- Mirrors the generate-daily-brief pg_cron pattern.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

select cron.schedule(
  'send-weekly-meal-plan-reminder',
  '0 15 * * 0',
  $$
  select net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/send-weekly-meal-plan-reminder',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{}'::jsonb
  )
  $$
);
