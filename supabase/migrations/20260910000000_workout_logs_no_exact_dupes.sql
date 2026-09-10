-- Captures a unique index that was created directly against the live database
-- and never tracked here. Read back verbatim from pg_indexes on 2026-09-10.
--
-- It is what stops a second submit of an already-saved workout from writing a
-- real duplicate row, and WorkoutDetail/QuickWorkout now depend on it: both
-- treat 23505 on this index as "already logged" rather than as a failure. Once
-- the constraint lives only in production, a fresh `supabase db reset` yields a
-- database where that branch is unreachable and the duplicate lands for real,
-- so the guard and the constraint have to travel together.
--
-- md5(exercises::text) rather than the jsonb itself: the column is json, which
-- has no equality operator to build a unique index on.
CREATE UNIQUE INDEX IF NOT EXISTS workout_logs_no_exact_dupes
    ON public.workout_logs USING btree (created_by, log_date, md5((exercises)::text));
