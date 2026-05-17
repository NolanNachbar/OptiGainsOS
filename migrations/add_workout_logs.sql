-- Migration: Add workout_logs table and weight_unit to user_profiles
-- Run this in Supabase SQL Editor

-- 1. Add weight_unit column to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS weight_unit TEXT DEFAULT 'lbs';

-- 2. Create workout_logs table
CREATE TABLE IF NOT EXISTS workout_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by TEXT NOT NULL,
  workout_schedule_id UUID REFERENCES workout_schedules(id),
  workout_id UUID REFERENCES workouts(id),
  log_date DATE NOT NULL,
  exercises JSONB NOT NULL,  -- Array of logged exercise data
  duration_seconds INTEGER,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Enable Row Level Security
ALTER TABLE workout_logs ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policy (allow all for now - tighten later)
DROP POLICY IF EXISTS "Enable all for workout_logs" ON workout_logs;
CREATE POLICY "Enable all for workout_logs" ON workout_logs FOR ALL USING (true);

-- 5. Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_workout_logs_created_by ON workout_logs(created_by);
CREATE INDEX IF NOT EXISTS idx_workout_logs_log_date ON workout_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_workout_logs_workout_id ON workout_logs(workout_id);
