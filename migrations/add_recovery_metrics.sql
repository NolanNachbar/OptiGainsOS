-- Migration: Add recovery_metrics table for Garmin and Apple Health data
-- Phase 3 roadmap item

CREATE TABLE IF NOT EXISTS recovery_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users NOT NULL,
  date date NOT NULL,
  -- Garmin / Core metrics
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
  -- Tri-specific (from Garmin)
  tss_run numeric,          -- Training Stress Score by sport
  tss_cycling numeric,
  tss_swim numeric,
  -- Apple Health (fallback/specific)
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

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_recovery_metrics_user_date ON recovery_metrics(created_by, date);
CREATE INDEX IF NOT EXISTS idx_recovery_metrics_source ON recovery_metrics(source);

-- RLS Policies
ALTER TABLE recovery_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own recovery metrics"
  ON recovery_metrics FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY "Users can insert their own recovery metrics"
  ON recovery_metrics FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own recovery metrics"
  ON recovery_metrics FOR UPDATE
  USING (auth.uid() = created_by);
