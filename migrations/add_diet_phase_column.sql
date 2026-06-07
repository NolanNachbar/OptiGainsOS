-- Diet phase (cut/maintain/bulk) as its own field so the engine's phase
-- recommendation can be accepted without clobbering training_phase (the
-- tactical/training focus, e.g. buds_prep). compute_athlete_state prefers
-- diet_phase and falls back to substring-matching training_phase for backward
-- compat. Applied live via MCP 2026-06-07.
alter table user_profiles add column if not exists diet_phase text
  check (diet_phase in ('cut','maintain','bulk'));
