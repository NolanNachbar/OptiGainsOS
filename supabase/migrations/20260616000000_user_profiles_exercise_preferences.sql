-- Per-athlete exercise preferences read by the session generator
-- (scripts/engine/session_generator.py). Shape:
--   {"blocked": ["Box Squat", "Trap Bar Deadlift"],
--    "preferred": ["Paused Squat", "Romanian Deadlift", ...]}
-- Blocked lifts are never programmed (filtered from the knapsack pool AND the
-- bench/deadlift/squat assistance rotations); preferred lifts get a selection
-- bonus so they win their slot. Honored by BOTH the daily prescriber and the
-- weekly generator, so the dashboard card and weekly schedule agree.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS exercise_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Seed the athlete's current preferences (single-user app). Only fills empty
-- rows so a later in-app edit is never overwritten on re-apply.
UPDATE user_profiles
SET exercise_preferences = jsonb_build_object(
      'blocked',   jsonb_build_array('Box Squat', 'Trap Bar Deadlift'),
      'preferred', jsonb_build_array('Paused Squat', 'Romanian Deadlift',
                                     'Leg Extension', 'Hamstring Curl', 'Zercher Squat')
    )
WHERE exercise_preferences IS NULL
   OR exercise_preferences = '{}'::jsonb;
