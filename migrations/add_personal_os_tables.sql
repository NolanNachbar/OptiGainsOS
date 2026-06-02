-- Migration: Add tables for Mind, Career, and Nutrition extensions
-- Aligns with PersonalOS-PRD.md

-- 1. Mind / Learning
CREATE TABLE IF NOT EXISTS reading_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users NOT NULL,
  title text NOT NULL,
  author text,
  category text CHECK (category IN ('technical','business','philosophy','other')),
  status text CHECK (status IN ('reading','finished','paused','want-to-read')),
  rating int CHECK (rating BETWEEN 1 AND 5),
  started_at date,
  finished_at date,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS study_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users NOT NULL,
  topic text NOT NULL,
  duration_min int NOT NULL,
  medium text CHECK (medium IN ('video','book','project','course','article')),
  notes text,
  logged_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users NOT NULL,
  name text NOT NULL,
  category text,
  level int CHECK (level BETWEEN 1 AND 5),
  last_practiced_at date,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- 2. Career
CREATE TABLE IF NOT EXISTS job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users NOT NULL,
  company text NOT NULL,
  role text NOT NULL,
  date_applied date,
  status text CHECK (status IN ('applied','screening','interview','offer','rejected')),
  notes text,
  next_action text,
  next_action_date date,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS networking_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users NOT NULL,
  person_name text NOT NULL,
  company text,
  interaction_type text,
  date date NOT NULL,
  notes text,
  follow_up_date date,
  created_at timestamptz DEFAULT now()
);

-- 3. Nutrition Extensions
CREATE TABLE IF NOT EXISTS supplement_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users NOT NULL,
  name text NOT NULL,
  default_dose numeric,
  unit text,
  timing_note text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplement_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users NOT NULL,
  supplement_type_id uuid REFERENCES supplement_types,
  supplement_name text NOT NULL,
  dose numeric,
  unit text,
  taken_at timestamptz DEFAULT now(),
  notes text
);

CREATE TABLE IF NOT EXISTS water_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users NOT NULL,
  amount_ml int NOT NULL,
  logged_at timestamptz DEFAULT now()
);

-- 4. Daily Brief (AI)
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

-- RLS Policies
ALTER TABLE reading_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE networking_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplement_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplement_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE water_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_briefs ENABLE ROW LEVEL SECURITY;

-- Simple policies for single-user PersonalOS
CREATE POLICY "Users can manage their own mind data" ON reading_log FOR ALL USING (auth.uid() = created_by);
CREATE POLICY "Users can manage their own study data" ON study_log FOR ALL USING (auth.uid() = created_by);
CREATE POLICY "Users can manage their own skills data" ON skills FOR ALL USING (auth.uid() = created_by);
CREATE POLICY "Users can manage their own career data" ON job_applications FOR ALL USING (auth.uid() = created_by);
CREATE POLICY "Users can manage their own networking data" ON networking_log FOR ALL USING (auth.uid() = created_by);
CREATE POLICY "Users can manage their own supplement types" ON supplement_types FOR ALL USING (auth.uid() = created_by);
CREATE POLICY "Users can manage their own supplement logs" ON supplement_logs FOR ALL USING (auth.uid() = created_by);
CREATE POLICY "Users can manage their own water logs" ON water_logs FOR ALL USING (auth.uid() = created_by);
CREATE POLICY "Users can manage their own daily briefs" ON daily_briefs FOR ALL USING (auth.uid() = created_by);
