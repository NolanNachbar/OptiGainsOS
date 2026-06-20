-- Enable extensions (idempotent)
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- Schedule generate-daily-brief at 6:00am MDT (12:00 UTC) every day.
-- The function skips if a brief already exists, so running it again is safe.
-- SUPABASE_URL and SERVICE_ROLE_KEY must be set as Vault secrets or
-- substituted below before running this migration.
select cron.schedule(
  'generate-daily-brief',
  '0 12 * * *',
  $$
  select net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/generate-daily-brief',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{}'::jsonb
  )
  $$
);
