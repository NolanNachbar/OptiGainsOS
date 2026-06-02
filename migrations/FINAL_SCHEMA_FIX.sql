-- FINAL SCHEMA FIX: standardizing on 'created_by' and ensuring tables exist.
-- Run this in Supabase SQL Editor.

-- 1. FIX: Rename columns in existing tables if they use user_id instead of created_by
DO $$ 
BEGIN
    -- Fix program_enrollments
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='program_enrollments' AND column_name='user_id') THEN
        ALTER TABLE program_enrollments RENAME COLUMN user_id TO created_by;
    END IF;

    -- Fix workout_sessions
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='workout_sessions' AND column_name='user_id') THEN
        ALTER TABLE workout_sessions RENAME COLUMN user_id TO created_by;
    END IF;
    
    -- Fix push_subscriptions (if it exists)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='push_subscriptions') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='push_subscriptions' AND column_name='user_id') THEN
            ALTER TABLE push_subscriptions RENAME COLUMN user_id TO created_by;
        END IF;
    END IF;
END $$;

-- 2. ENSURE: Tables exist with standardized 'created_by'

-- Recovery Metrics
CREATE TABLE IF NOT EXISTS recovery_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users NOT NULL,
  date date NOT NULL,
  hrv numeric,
  sleep_score int,
  sleep_duration_min int,
  body_battery int,
  resting_hr int,
  vo2max_run numeric,
  vo2max_cycling numeric,
  training_load_acute numeric,
  training_load_chronic numeric,
  stress_score int,
  steps int,
  active_calories int,
  tss_run numeric,
  tss_cycling numeric,
  tss_swim numeric,
  ah_hrv numeric,
  ah_sleep_min int,
  ah_resting_hr int,
  ah_weight numeric,
  ah_active_energy_kcal numeric,
  ah_steps int,
  source text CHECK (source IN ('garmin','apple_health','manual')),
  raw_payload jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(created_by, date, source)
);

-- Capture Inbox (Second Brain Streaming)
CREATE TABLE IF NOT EXISTS capture_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users NOT NULL,
  content text NOT NULL,
  domain text CHECK (domain IN ('mind','career','training','nutrition','general')),
  processed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Exercise Reactions (Fixes 404 in Workouts)
CREATE TABLE IF NOT EXISTS exercise_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users NOT NULL,
  exercise_name text NOT NULL,
  reaction text, 
  created_at timestamptz DEFAULT now()
);

-- Daily Briefs (AI)
CREATE TABLE IF NOT EXISTS daily_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users NOT NULL,
  date date NOT NULL UNIQUE,
  brief_json jsonb NOT NULL,
  generated_at timestamptz DEFAULT now(),
  model_used text,
  input_tokens int,
  output_tokens int,
  cache_read_tokens int
);

-- 3. POLICIES: Update RLS to use created_by

-- Enable RLS on all new tables
ALTER TABLE recovery_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE capture_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_briefs ENABLE ROW LEVEL SECURITY;

-- Nolan access policies
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Nolan all access recovery" ON recovery_metrics;
    CREATE POLICY "Nolan all access recovery" ON recovery_metrics FOR ALL USING (auth.uid() = created_by);

    DROP POLICY IF EXISTS "Nolan all access capture" ON capture_inbox;
    CREATE POLICY "Nolan all access capture" ON capture_inbox FOR ALL USING (auth.uid() = created_by);

    DROP POLICY IF EXISTS "Nolan all access reactions" ON exercise_reactions;
    CREATE POLICY "Nolan all access reactions" ON exercise_reactions FOR ALL USING (auth.uid() = created_by);

    DROP POLICY IF EXISTS "Nolan all access briefs" ON daily_briefs;
    CREATE POLICY "Nolan all access briefs" ON daily_briefs FOR ALL USING (auth.uid() = created_by);
END $$;
