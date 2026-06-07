-- Companion to add_task_system.sql — schedules the daily loop ENTIRELY in
-- Supabase (pg_cron + pg_net), so nothing depends on your laptop being on.
--
-- BEFORE RUNNING:
--   1. Apply add_task_system.sql first.
--   2. Deploy edge functions: generate-daily-brief, send-daily-brief-push,
--      send-reminder-push.
--   3. Replace <PROJECT_REF>, <USER_ID>, and <SERVICE_ROLE_KEY> below.
--      (Store the service key with Vault in production rather than inlining it.)
--
-- TIMEZONE: pg_cron runs in UTC. Wyoming = Mountain Time, which is UTC-6 in
-- summer (MDT) and UTC-7 in winter (MST). The schedules below assume MDT.
-- In November, shift each hour back by 1, OR have the functions check the
-- local hour before acting.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── Morning, Step A — build today's list from the plan (pure SQL) ──
-- 11:00 UTC = 05:00 MDT
SELECT cron.schedule('materialize-daily-tasks', '0 11 * * *', $$
  SELECT materialize_daily_tasks('<USER_ID>'::uuid);
$$);

-- ── Morning, Step B — generate the AI brief (reads today's daily_tasks) ──
-- 11:05 UTC = 05:05 MDT
SELECT cron.schedule('generate-brief', '5 11 * * *', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/generate-daily-brief',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb
  );
$$);

-- ── Morning, Step C — push "brief ready + today's N things" ──
-- 11:08 UTC = 05:08 MDT
SELECT cron.schedule('notify-brief', '8 11 * * *', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/send-daily-brief-push',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb
  );
$$);

-- ── Duolingo-style "you forgot" nudges — only fire if something's pending ──
-- 20:00 UTC = 14:00 MDT (midday)
SELECT cron.schedule('nudge-midday', '0 20 * * *', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/send-reminder-push',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb
  );
$$);

-- 02:00 UTC = 20:00 MDT (evening, next UTC day)
SELECT cron.schedule('nudge-evening', '0 2 * * *', $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/send-reminder-push',
    headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb
  );
$$);

-- To inspect or remove later:
--   SELECT * FROM cron.job;
--   SELECT cron.unschedule('nudge-midday');
