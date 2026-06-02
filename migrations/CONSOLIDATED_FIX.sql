-- CONSOLIDATED MIGRATION: RUN THIS IN SUPABASE SQL EDITOR
-- This script adds all missing tables and fixes schema mismatches.

-- 1. Recovery Metrics
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

-- 2. Capture Inbox (Second Brain Streaming)
CREATE TABLE IF NOT EXISTS capture_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users NOT NULL,
  content text NOT NULL,
  domain text CHECK (domain IN ('mind','career','training','nutrition','general')),
  processed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 3. Exercise Reactions
CREATE TABLE IF NOT EXISTS exercise_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users NOT NULL,
  exercise_name text NOT NULL,
  reaction text, -- 'like' or 'dislike'
  created_at timestamptz DEFAULT now()
);

-- 4. Daily Briefs (AI)
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

-- 5. RLS Policies (Enable for all)
ALTER TABLE recovery_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE capture_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_briefs ENABLE ROW LEVEL SECURITY;

-- 6. Simple All-Access Policies for Nolan (Single User)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Nolan all access recovery') THEN
        CREATE POLICY "Nolan all access recovery" ON recovery_metrics FOR ALL USING (auth.uid() = created_by);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Nolan all access capture') THEN
        CREATE POLICY "Nolan all access capture" ON capture_inbox FOR ALL USING (auth.uid() = created_by);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Nolan all access reactions') THEN
        CREATE POLICY "Nolan all access reactions" ON exercise_reactions FOR ALL USING (auth.uid() = created_by);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Nolan all access briefs') THEN
        CREATE POLICY "Nolan all access briefs" ON daily_briefs FOR ALL USING (auth.uid() = created_by);
    END IF;
END $$;

-- 7. Ensure program_enrollments uses created_by instead of user_id if needed
-- (Uncomment the line below if you continue getting 400 errors on program_enrollments)
-- ALTER TABLE program_enrollments RENAME COLUMN user_id TO created_by;
