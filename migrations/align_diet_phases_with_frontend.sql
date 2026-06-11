-- The frontend contract (useDailyTargets, DietPhaseCard, WeeklyPlanCard) reads
-- phase_type / weekly_rate / target_weight / starting_weight / starting_calories,
-- but the table was created with only `phase`. The cut-rule clamps (protein
-- 1.3 g/lb etc.) never fired because activePhase.phase_type was undefined, and
-- the UI's "start new phase" insert would be rejected outright.
-- Engine readers select * and use only date columns, so the rename is safe.
-- Applied live via MCP 2026-06-11.
alter table public.diet_phases rename column phase to phase_type;
alter table public.diet_phases drop constraint diet_phases_phase_check;
alter table public.diet_phases add constraint diet_phases_phase_type_check
  check (phase_type in ('bulk','cut','maintain','reverse'));
alter table public.diet_phases
  add column if not exists weekly_rate numeric,
  add column if not exists target_weight numeric,
  add column if not exists starting_weight numeric,
  add column if not exists starting_calories numeric;
