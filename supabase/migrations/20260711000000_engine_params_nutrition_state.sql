-- Learned nutrition params for the adaptive TDEE loop.
--
-- engine.tdee.learned_intake_bias() is a slow nudge (gain 0.2) toward the intake bias that
-- reconciles the LOGGED food intake with the intake the trend weight IMPLIES. A nudge only
-- converges if its previous value is carried across runs; without somewhere to persist it,
-- compute_athlete_state re-seeded it at 1.0 every day and the learner could never learn.
--
-- Sits alongside kalman_state / rls_params / cellular_state / vdot_state / guardrail_state,
-- which are persisted for exactly the same reason.
--
-- Shape: {"intake_bias": 1.10, "log_coverage_7d": 0.714, "days_logged_7d": 5,
--         "maintenance_kcal": 2680}

alter table public.engine_params
  add column if not exists nutrition_state jsonb;

comment on column public.engine_params.nutrition_state is
  'Learned nutrition params: intake_bias (bounded [1.0, 1.5] under-report correction), '
  'log_coverage_7d, days_logged_7d, maintenance_kcal. Carried across daily runs so the '
  'bias learner converges.';
