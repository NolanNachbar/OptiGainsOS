-- Migration: Add endurance fields to user_profiles
-- Phase 3d roadmap item

ALTER TABLE user_profiles 
  ADD COLUMN IF NOT EXISTS ironman_target_hours NUMERIC DEFAULT 10.0,
  ADD COLUMN IF NOT EXISTS primary_sport_focus TEXT DEFAULT 'concurrent',
  ADD COLUMN IF NOT EXISTS race_date DATE;
