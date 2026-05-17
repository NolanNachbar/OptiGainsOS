-- Drop existing policies first  
 DROP POLICY IF EXISTS "Enable all for user_profiles" ON user_profiles;  
 DROP POLICY IF EXISTS "Enable all for workouts" ON workouts;  
 DROP POLICY IF EXISTS "Enable all for workout_schedules" ON workout_schedules;  
 DROP POLICY IF EXISTS "Enable all for food_entries" ON food_entries;  
 DROP POLICY IF EXISTS "Enable all for workout_reactions" ON workout_reactions;

-- Drop tables in correct order (children first due to foreign keys)  
 DROP TABLE IF EXISTS workout_reactions;  
 DROP TABLE IF EXISTS workout_schedules;  
 DROP TABLE IF EXISTS food_entries;  
 DROP TABLE IF EXISTS user_profiles;  
 DROP TABLE IF EXISTS workouts;

-- User Profiles
CREATE TABLE user_profiles (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
created_by TEXT NOT NULL,
fitness_level TEXT,
primary_goal TEXT,
days_per_week INTEGER,
daily_calorie_goal INTEGER,
daily_protein_goal INTEGER,
daily_carbs_goal INTEGER,
daily_fats_goal INTEGER,
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workouts
CREATE TABLE workouts (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
created_by TEXT NOT NULL,
title TEXT NOT NULL,
description TEXT,
difficulty TEXT,
duration_minutes INTEGER,
target_muscles JSONB,
exercises JSONB,
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workout Schedules
CREATE TABLE workout_schedules (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
created_by TEXT NOT NULL,
workout_id UUID REFERENCES workouts(id),
scheduled_date DATE NOT NULL,
time_of_day TEXT,
completed BOOLEAN DEFAULT FALSE,
completed_at TIMESTAMP WITH TIME ZONE,
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Food Entries
CREATE TABLE food_entries (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
created_by TEXT NOT NULL,
date DATE NOT NULL,
meal_type TEXT,
food_name TEXT NOT NULL,
serving_size TEXT,
calories INTEGER,
protein_grams DECIMAL,
carbs_grams DECIMAL,
fats_grams DECIMAL,
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workout Reactions — authoritative schema is defined later in this file (with UNIQUE + CHECK constraints)

-- Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_reactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow all for now - tighten later)
CREATE POLICY "Enable all for user_profiles" ON user_profiles FOR ALL USING (true);
CREATE POLICY "Enable all for workouts" ON workouts FOR ALL USING (true);
CREATE POLICY "Enable all for workout_schedules" ON workout_schedules FOR ALL USING (true);
CREATE POLICY "Enable all for food_entries" ON food_entries FOR ALL USING (true);
CREATE POLICY "Enable all for workout_reactions" ON workout_reactions FOR ALL USING (true);

    -- Add missing columns to user_profiles table

ALTER TABLE user_profiles
ADD COLUMN available_equipment JSONB DEFAULT '[]',
ADD COLUMN workout_duration_preference TEXT,
ADD COLUMN injuries_limitations TEXT;

-- Add missing columns to user_profiles table
ALTER TABLE user_profiles
ADD COLUMN available_equipment JSONB DEFAULT '[]',
ADD COLUMN workout_duration_preference TEXT,
ADD COLUMN injuries_limitations TEXT;

    CREATE OR REPLACE FUNCTION delete_user()

RETURNS void  
 LANGUAGE sql  
 SECURITY DEFINER  
 SET search_path = public  
 AS $$  
 DELETE FROM auth.users WHERE id = auth.uid();

$$
;

  -- Add missing columns to workouts table
ALTER TABLE workouts
ADD COLUMN type TEXT DEFAULT 'strength',
ADD COLUMN equipment_needed JSONB DEFAULT '[]',
ADD COLUMN is_custom BOOLEAN DEFAULT true,
ADD COLUMN target_goals JSONB DEFAULT '[]';

  ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS weight_unit TEXT DEFAULT 'lbs';

-- Create workout_logs table
CREATE TABLE IF NOT EXISTS workout_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by TEXT NOT NULL,
  workout_schedule_id UUID REFERENCES workout_schedules(id),
  workout_id UUID REFERENCES workouts(id),
  log_date DATE NOT NULL,
  exercises JSONB NOT NULL,
  duration_seconds INTEGER,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE workout_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "Enable all for workout_logs" ON workout_logs FOR ALL USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_workout_logs_created_by ON workout_logs(created_by);
CREATE INDEX IF NOT EXISTS idx_workout_logs_log_date ON workout_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_workout_logs_workout_id ON workout_logs(workout_id);

  -- Body Weight Tracking
CREATE TABLE body_weight_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by TEXT NOT NULL,
  weight DECIMAL NOT NULL,
  recorded_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

  -- Enable Row Level Security
ALTER TABLE body_weight_entries ENABLE ROW LEVEL SECURITY;

  -- RLS Policy
CREATE POLICY "Enable all for body_weight_entries" ON body_weight_entries FOR ALL USING (true);

  -- Indexes for performance
CREATE INDEX idx_body_weight_created_by ON body_weight_entries(created_by);
CREATE INDEX idx_body_weight_recorded_date ON body_weight_entries(recorded_date);

    CREATE TABLE IF NOT EXISTS "workout_reactions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workout_id" UUID NOT NULL REFERENCES "workouts"("id") ON DELETE CASCADE,
  "reaction" VARCHAR(10) CHECK ("reaction" IN ('like', 'dislike')),
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP DEFAULT NOW(),
  UNIQUE("workout_id", "created_by")
);

  CREATE INDEX IF NOT EXISTS "idx_workout_reaction_user" ON "workout_reactions"("created_by");
CREATE INDEX IF NOT EXISTS "idx_workout_reaction_workout" ON "workout_reactions"("workout_id");

  ALTER TABLE workout_reactions ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Users can view own reactions" ON workout_reactions;
CREATE POLICY "Users can view own reactions"
ON workout_reactions FOR SELECT
USING (created_by = auth.uid()::text);

  DROP POLICY IF EXISTS "Users can insert own reactions" ON workout_reactions;
CREATE POLICY "Users can insert own reactions"
ON workout_reactions FOR INSERT
WITH CHECK (created_by = auth.uid()::text);

  DROP POLICY IF EXISTS "Users can update own reactions" ON workout_reactions;
CREATE POLICY "Users can update own reactions"
ON workout_reactions FOR UPDATE
USING (created_by = auth.uid()::text);

  DROP POLICY IF EXISTS "Users can delete own reactions" ON workout_reactions;
CREATE POLICY "Users can delete own reactions"
ON workout_reactions FOR DELETE
USING (created_by = auth.uid()::text);


CREATE TABLE meal_plans (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 created_by TEXT NOT NULL,
 date DATE NOT NULL,
 meal_type TEXT NOT NULL,
 items JSONB NOT NULL DEFAULT '[]',
 created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE meal_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for meal_plans" ON meal_plans FOR ALL USING (true);
CREATE INDEX idx_meal_plans_date ON meal_plans(created_by, date);

  ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS coaching_preferences JSONB DEFAULT '{}';

   CREATE TABLE meal_templates (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 created_by TEXT NOT NULL,
 name TEXT NOT NULL,
 template_type TEXT NOT NULL, -- 'meal' or 'day'
 meal_type TEXT,              -- for meal templates: breakfast/lunch/dinner/snack
 items JSONB NOT NULL DEFAULT '[]',
 is_favorite BOOLEAN DEFAULT false,
 created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE meal_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for meal_templates" ON meal_templates FOR ALL USING (true);

  CREATE TABLE recipes (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 created_by TEXT NOT NULL,
 name TEXT NOT NULL,
 description TEXT,
 servings INTEGER NOT NULL DEFAULT 1,
 ingredients JSONB NOT NULL DEFAULT '[]',
 total_calories NUMERIC DEFAULT 0,
 total_protein NUMERIC DEFAULT 0,
 total_carbs NUMERIC DEFAULT 0,
 total_fats NUMERIC DEFAULT 0,
 created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for recipes" ON recipes FOR ALL USING (true);

  ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS height_cm NUMERIC;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS sex TEXT; -- 'male', 'female'
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS activity_level TEXT; -- 'sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extremely_active'
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS height_unit TEXT DEFAULT 'in'; -- 'in' or 'cm'
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS tdee_override NUMERIC; -- manual override if user wants to set TDEE directly

 -- Add check-in day preference to user_profiles
ALTER TABLE user_profiles
ADD COLUMN checkin_day INTEGER DEFAULT 0; -- 0=Sunday, 1=Monday, ..., 6=Saturday

-- Diet Phases (tracks cut/bulk/maintain phases with configurable rates)
CREATE TABLE diet_phases (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
created_by TEXT NOT NULL,
phase_type TEXT NOT NULL CHECK (phase_type IN ('cut', 'bulk', 'maintain')),
weekly_rate DECIMAL DEFAULT 0,
start_date DATE NOT NULL DEFAULT CURRENT_DATE,
end_date DATE,
target_weight DECIMAL,
starting_weight DECIMAL,
starting_calories INTEGER,
notes TEXT,
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE diet_phases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for diet_phases" ON diet_phases FOR ALL USING (true);

CREATE INDEX idx_diet_phases_created_by ON diet_phases(created_by);
CREATE INDEX idx_diet_phases_active ON diet_phases(created_by, end_date) WHERE end_date IS NULL;

-- Weekly Check-ins (auto-adjusting macro recommendations)
CREATE TABLE weekly_checkins (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
created_by TEXT NOT NULL,
diet_phase_id UUID REFERENCES diet_phases(id),
checkin_date DATE NOT NULL,
week_number INTEGER,
raw_weight DECIMAL,
trend_weight DECIMAL,
weight_change_trend DECIMAL,
actual_weekly_rate DECIMAL,
goal_weekly_rate DECIMAL,
rate_deviation DECIMAL,
previous_calories INTEGER,
new_calories INTEGER,
calorie_adjustment INTEGER,
previous_protein INTEGER,
new_protein INTEGER,
previous_carbs INTEGER,
new_carbs INTEGER,
previous_fats INTEGER,
new_fats INTEGER,
tdee_used INTEGER,
tdee_method TEXT,
logging_consistency INTEGER,
avg_daily_calories INTEGER,
status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
reasoning TEXT,
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE weekly_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for weekly_checkins" ON weekly_checkins FOR ALL USING (true);

CREATE INDEX idx_weekly_checkins_created_by ON weekly_checkins(created_by);
CREATE INDEX idx_weekly_checkins_phase ON weekly_checkins(diet_phase_id);

  -- Admin grants managed directly in Supabase dashboard, not in source control.

   CREATE TABLE custom_foods (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 created_by TEXT NOT NULL,
 food_name TEXT NOT NULL,
 serving_size DECIMAL DEFAULT 1,
 serving_unit TEXT DEFAULT 'serving',
 calories INTEGER DEFAULT 0,
 protein_grams DECIMAL DEFAULT 0,
 carbs_grams DECIMAL DEFAULT 0,
 fats_grams DECIMAL DEFAULT 0,
 created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

 ALTER TABLE custom_foods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for custom_foods" ON custom_foods FOR ALL USING (true);
CREATE INDEX idx_custom_foods_created_by ON custom_foods(created_by);
$$
