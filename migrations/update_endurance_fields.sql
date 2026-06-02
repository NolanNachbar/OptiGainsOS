-- Migration: Update endurance fields to match dynamic capacity model
-- Phase 3d roadmap update

ALTER TABLE user_profiles 
  DROP COLUMN IF EXISTS ironman_target_hours,
  ADD COLUMN IF NOT EXISTS max_daily_training_hours NUMERIC DEFAULT 2.0,
  ADD COLUMN IF NOT EXISTS primary_sport_focus TEXT DEFAULT 'concurrent',
  ADD COLUMN IF NOT EXISTS race_date DATE;
