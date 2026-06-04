-- ============================================================
-- Migration 001: Adaptive Engine Tables
-- ============================================================
-- Run this in the Supabase SQL editor (or via psql with service role).
--
-- Creates two tables:
--   engine_params        — persistent daily state for the Banister Kalman
--                          filter, RLS learner, cellular ODE model, VDOT
--                          engine, and guardrail. One row per day.
--
--   training_prescription — MPC prescriber output. One row per day.
--                           The daily brief and app Train tab read from here.
-- ============================================================


-- ── engine_params ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engine_params (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by     uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  date           date        NOT NULL,

  -- Banister Kalman filter state: {x: [F,f], P: [[..],[..]], tau_fit, tau_fat, c_fit, c_fat}
  kalman_state   jsonb,

  -- RLS parameter learner state: {theta, P_theta, lambda_forget, update_count, weekly_buffer}
  rls_params     jsonb,

  -- mTORC1/AMPK cellular ODE state: {ampk, mtorc1, alpha2, gamma_i, mtorc1_integral, ...}
  cellular_state jsonb,

  -- VDOT engine state: {vdot, base_mileage, vdot_history}
  vdot_state     jsonb,

  -- SystemGuardrail state: {filtered, state_history, alpha}
  guardrail_state jsonb,

  computed_at    timestamptz DEFAULT now(),

  UNIQUE (created_by, date)
);

ALTER TABLE engine_params ENABLE ROW LEVEL SECURITY;

CREATE POLICY "engine_params_own" ON engine_params
  FOR ALL USING (auth.uid() = created_by);

-- Index for fast latest-row lookups (used every cron run)
CREATE INDEX IF NOT EXISTS engine_params_by_date
  ON engine_params (created_by, date DESC);


-- ── training_prescription ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS training_prescription (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by           uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  date                 date        NOT NULL,

  -- MPC output
  session_type         text,       -- 'strength' | 'cardio' | 'calisthenics' | 'mixed' | 'rest' | 'deload'
  mpc_action           text,       -- selected action key
  mpc_intensity        numeric(4,2),
  mpc_action_scores    jsonb,      -- score map for all candidate actions (debug/transparency)
  w_pst                numeric(4,3),  -- PST weight used in reward function this day
  w_str                numeric(4,3),  -- strength weight

  -- Full session detail
  prescription         jsonb,      -- complete session: strength_block, calisthenics_block, run_block, etc.
  rationale            text,       -- human-readable explanation from session generator

  -- State snapshot at prescription time
  banister_state       jsonb,      -- {fitness, fatigue, tsb_banister, confidence}
  interference         jsonb,      -- {ampk, mtorc1, interference_level}
  overreach            jsonb,      -- {fatigue_state, overreaching, hrv_z_3d, rhr_z_3d}
  acwr                 numeric(5,3),
  interference_warning text,       -- null if interference is LOW

  computed_at          timestamptz DEFAULT now(),

  UNIQUE (created_by, date)
);

ALTER TABLE training_prescription ENABLE ROW LEVEL SECURITY;

CREATE POLICY "training_prescription_own" ON training_prescription
  FOR ALL USING (auth.uid() = created_by);

CREATE INDEX IF NOT EXISTS training_prescription_by_date
  ON training_prescription (created_by, date DESC);


-- ── athlete_state update ──────────────────────────────────────────────────────
-- Add a banister column to athlete_state if it doesn't already exist.
-- This stores the Kalman state summary for the brief to read.
-- (athlete_state table is assumed to exist from the FlexAppeal base schema.)

ALTER TABLE athlete_state
  ADD COLUMN IF NOT EXISTS banister jsonb;

ALTER TABLE athlete_state
  ADD COLUMN IF NOT EXISTS cellular jsonb;

ALTER TABLE athlete_state
  ADD COLUMN IF NOT EXISTS vdot_zones jsonb;

ALTER TABLE athlete_state
  ADD COLUMN IF NOT EXISTS nutrition_modulation jsonb;

ALTER TABLE athlete_state
  ADD COLUMN IF NOT EXISTS overreach_signal jsonb;
