-- Weekly physique-photo reminder — Sunday morning push, scheduled entirely in
-- Supabase (pg_cron + pg_net) so it never depends on a device being on.
--
-- BEFORE RUNNING:
--   1. Deploy the edge function: send-physique-reminder.
--   2. Replace <PROJECT_REF> and <SERVICE_ROLE_KEY> below.
--      (Store the service key with Vault in production rather than inlining it.)
--
-- TIMEZONE: pg_cron runs in UTC. Wyoming = Mountain Time (UTC-6 MDT in summer,
-- UTC-7 MST in winter). 14:00 UTC = 08:00 MDT. In November shift back one hour
-- (15:00 UTC) for 08:00 MST.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Sunday 14:00 UTC = 08:00 MDT
SELECT cron.schedule('physique-weekly-reminder', '0 14 * * 0', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/send-physique-reminder',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb
  );
$$);

-- To inspect or remove later:
--   SELECT * FROM cron.job;
--   SELECT cron.unschedule('physique-weekly-reminder');
