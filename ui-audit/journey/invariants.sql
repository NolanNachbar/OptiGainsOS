-- Daily-loop invariants on Nolan's real account. READ-ONLY.
-- Run via the Supabase MCP execute_sql (never the .env service key).
-- Every row: check, ok, detail. Any ok = false is a P0 blocker for a push.
-- These are the things the 2026-09-30 miss proved the visual probe can't see:
-- an unfinished session pinning the engine on yesterday's day, Today not
-- showing today's workout, and training days with no weigh-in.
with u as (
  select '169d2f0b-cf5a-44fb-8551-845004725a26'::text as uid,
         coalesce((select timezone from user_profiles
                   where created_by::text = '169d2f0b-cf5a-44fb-8551-845004725a26'
                   order by created_at desc limit 1), 'America/Denver') as tz
), t as (
  select uid, tz, (now() at time zone tz)::date as today from u
), enr as (
  select e.* from program_enrollments e, t
  where e.created_by::text = t.uid and e.status = 'active'
  order by e.started_at desc limit 1
), sched as (
  select pw.* from program_workouts pw, enr, t
  where pw.program_id = enr.program_id and pw.scheduled_date = t.today
), open_sessions as (
  select s.*, (s.start_time at time zone t.tz)::date as local_date,
         extract(epoch from now() - s.start_time) / 3600 as age_h,
         extract(epoch from now() - s.updated_at) / 3600 as silent_h,
         (select count(*) from jsonb_array_elements(coalesce(s.exercises, '[]')) ex,
                 jsonb_array_elements(coalesce(ex->'sets', '[]')) st
          where (st->>'completed')::boolean) as done_sets
  from workout_sessions s, t
  where s.created_by::text = t.uid and s.status = 'in_progress'
), last_log as (
  select l.* from workout_logs l, t
  where l.created_by::text = t.uid and l.log_date < t.today
  order by l.log_date desc, l.created_at desc limit 1
), names as (
  select 'sched' as k, lower(ex->>'name') n from sched, jsonb_array_elements(sched.exercises) ex
  union all
  select 'last', lower(ex->>'name') from last_log, jsonb_array_elements(last_log.exercises) ex
)
select * from (
  -- 1. Nothing unfinished within the auto-log window survives an app open.
  --    Fails only once he has opened the app since (a workout_log or weigh-in
  --    was written after the session went quiet), so a session that is
  --    simply waiting for the next open isn't a false alarm.
  select 'no quiet session survived an app open (3h-48h)' as check,
         count(*) = 0 as ok,
         string_agg(local_date || ' (' || done_sets || ' sets, quiet ' || round(silent_h) || 'h)', '; ') as detail
  from open_sessions o, t
  where o.silent_h >= 3 and o.age_h < 48
    and exists (select 1 from workout_logs l where l.created_by::text = t.uid and l.created_at > o.updated_at + interval '3 hours')

  union all
  -- 2. Nothing older than 48h left with sets (needs Log/Discard on Today).
  select 'no unfinished session older than 48h holding sets',
         count(*) = 0,
         string_agg(local_date || ' (' || done_sets || ' sets)', '; ' order by local_date)
  from open_sessions where age_h >= 48 and done_sets > 0

  union all
  -- 3. Today has a scheduled program row with a real title (Today renders it).
  select 'today has a titled program workout (or the plan is a rest day)',
         (select count(*) from enr) = 0
           or exists (select 1 from sched where coalesce(title, '') <> ''),
         coalesce((select string_agg(coalesce(title, '<no title>'), ', ') from sched), 'no row for today')

  union all
  -- 4. The plan moved on: today's workout is not the same session as the
  --    last one logged (>= 80% exercise overlap = engine pinned on a day).
  select 'today''s workout is not a repeat of the last logged one',
         coalesce((select count(*) filter (where k = 'sched' and n in (select n from names where k = 'last'))::float
                   / nullif(count(*) filter (where k = 'sched'), 0) from names), 0) < 0.8,
         (select coalesce(max(title), '') from sched) || ' vs last log ' ||
           coalesce((select log_date::text from last_log), 'none')

  union all
  -- 5. Today's program workout isn't the same as an unfinished session from
  --    an earlier day (the exact 09-30 symptom: Lower A again).
  select 'today''s workout is not stuck behind an unfinished session',
         not exists (
           select 1 from open_sessions o, sched
           where o.local_date < (select today from t) and o.done_sets > 0
             and (select count(*) from jsonb_array_elements(sched.exercises) a
                  where lower(a->>'name') in (select lower(b->>'name') from jsonb_array_elements(o.exercises) b))::float
                 / nullif(jsonb_array_length(sched.exercises), 0) >= 0.8),
         (select string_agg(local_date::text, ', ') from open_sessions where local_date < (select today from t) and done_sets > 0)

  union all
  -- 6. Every training day in the last 14 days has a weigh-in.
  select 'every training day in the last 14 days has a weigh-in',
         count(*) = 0,
         string_agg(d::text, ', ' order by d)
  from (select distinct l.log_date d from workout_logs l, t
        where l.created_by::text = t.uid and l.log_date between t.today - 14 and t.today - 1
          and not exists (select 1 from body_weight_entries b
                          where b.created_by::text = t.uid and b.recorded_date = l.log_date)) x

  union all
  -- 7. Every completed session has a log on its local date.
  select 'every completed session in 30d has a workout_log',
         count(*) = 0,
         string_agg(d::text, ', ' order by d)
  from (select (s.start_time at time zone t.tz)::date d from workout_sessions s, t
        where s.created_by::text = t.uid and s.status = 'completed'
          and s.start_time > now() - interval '30 days'
          and not exists (select 1 from workout_logs l where l.created_by::text = t.uid
                          and l.log_date = (s.start_time at time zone t.tz)::date)) x

  union all
  -- 8. No duplicate logs (same date, same exercises).
  select 'no duplicate workout_logs',
         count(*) = 0,
         string_agg(log_date::text, ', ')
  from (select log_date from workout_logs, t where created_by::text = t.uid
        group by log_date, md5(exercises::text) having count(*) > 1) x

  union all
  -- 9. The schedule is written at least 7 days ahead.
  select 'schedule covers the next 7 days',
         (select count(*) from enr) = 0
           or (select count(distinct pw.scheduled_date) from program_workouts pw, enr, t
               where pw.program_id = enr.program_id
                 and pw.scheduled_date between t.today and t.today + 6) >= 4,
         (select count(distinct pw.scheduled_date) || ' training days in the next 7'
          from program_workouts pw, enr, t
          where pw.program_id = enr.program_id and pw.scheduled_date between t.today and t.today + 6)
) r;
