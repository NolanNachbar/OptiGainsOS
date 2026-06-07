-- Security hardening flagged by Supabase advisors: SECURITY DEFINER functions
-- were executable by anon (they inherit EXECUTE from PUBLIC). Lock them down.
-- Applied live via MCP on 2026-06-07; recorded here for version control.

-- delete_user_data: only a logged-in user should be able to wipe their own data.
REVOKE EXECUTE ON FUNCTION public.delete_user_data() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.delete_user_data() TO authenticated;

-- materialize_daily_tasks: only cron / edge functions (service_role) call it.
REVOKE EXECUTE ON FUNCTION public.materialize_daily_tasks(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.materialize_daily_tasks(uuid, date) TO service_role;

-- Advisor: pin a stable search_path on our SECURITY DEFINER function.
ALTER FUNCTION public.materialize_daily_tasks(uuid, date) SET search_path = public, pg_temp;

-- NOTE (not automatable via SQL): enable "Leaked password protection" in
-- Supabase Auth settings (Dashboard > Authentication > Policies). Advisor WARN.
