-- custom_foods.source: where a saved food's numbers came from.
--
-- Every single-food log auto-saves to My Foods, and AI estimates / label scans
-- were indistinguishable from foods the athlete typed in. 'ai_estimate' and
-- 'label_scan' are estimates; the UI badges them quietly. NULL = unknown (all
-- rows saved before this column), treated as a plain food.
--
-- The app tolerates this column being absent, so applying it is not a deploy
-- prerequisite.

ALTER TABLE "public"."custom_foods"
  ADD COLUMN IF NOT EXISTS "source" text;

COMMENT ON COLUMN "public"."custom_foods"."source" IS
  'Origin of the saved numbers: ai_estimate | label_scan | usda | barcode | manual. NULL = unknown.';
