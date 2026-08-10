-- Equipment/location profile for exercise selection (e.g. no-gym Casper trips).
-- Distinct from the existing `available_equipment` jsonb column, which has no
-- write path anywhere in the app and is not read by mpc_prescriber.py or
-- generate_weekly_program.py — leave it alone, don't rewire it here.
-- 'full_gym' is unrestricted (current default behavior, unchanged). Both the
-- weekly (Sunday MILP) and daily (MPC) generators read this column, so a
-- profile switch takes effect same-day and the weekly template itself
-- generates limited-equipment when the switch lands before the weekly run.
-- Whitelists per profile live in scripts/engine/equipment_profiles.py, not
-- in the database — this column is just the athlete's current selection.
-- Applied live via MCP 2026-08-10.
alter table user_profiles add column if not exists equipment_profile text
  default 'full_gym'
  check (equipment_profile in ('full_gym','casper'));
