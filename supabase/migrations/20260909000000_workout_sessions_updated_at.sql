-- A last-activity clock for workout_sessions.
--
-- Auto-finishing a stale workout needs to know when the athlete last logged a
-- set. Nothing recorded that: sets carry no timestamp (reps/weight/rir/rpe and
-- nothing else) and the session row's start_time / started_at / created_at all
-- mark the beginning. Age-since-start is the wrong clock — a real session can
-- run six hours with sets logged throughout, and finishing it three hours in
-- would split the back half into a second workout.
--
-- saveProgress() UPDATEs this row on every set change (the auto-save effect in
-- WorkoutDetail.jsx and QuickWorkout.jsx watches the exercise array), so a
-- BEFORE UPDATE trigger on updated_at tracks genuine training activity.

ALTER TABLE "public"."workout_sessions"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamptz;

-- Backfill to the session's own start, never now(). With a default of now()
-- every historical row would read as touched-this-instant and the auto-finish
-- sweep would skip exactly the stranded sessions it exists to catch.
UPDATE "public"."workout_sessions"
   SET "updated_at" = COALESCE("start_time", "started_at", "created_at")
 WHERE "updated_at" IS NULL;

ALTER TABLE "public"."workout_sessions"
  ALTER COLUMN "updated_at" SET DEFAULT now();

DROP TRIGGER IF EXISTS "trg_workout_sessions_updated" ON "public"."workout_sessions";
CREATE TRIGGER "trg_workout_sessions_updated"
  BEFORE UPDATE ON "public"."workout_sessions"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
