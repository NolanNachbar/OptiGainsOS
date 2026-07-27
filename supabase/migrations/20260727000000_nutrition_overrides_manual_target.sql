-- Manual target override (MacroFactor-style): lets the athlete type in their own
-- calorie/protein target for a day instead of the engine's recovery-gated
-- recommendation. Reuses nutrition_overrides (already the per-date escape-valve
-- table for ease/push) rather than a new table -- same RLS, same unique
-- (created_by, date) key, one more `action` value: 'manual'.
ALTER TABLE "public"."nutrition_overrides"
  ADD COLUMN IF NOT EXISTS "manual_calorie_target" integer,
  ADD COLUMN IF NOT EXISTS "manual_protein_g" integer;
