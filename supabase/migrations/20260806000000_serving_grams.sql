-- Record what a serving actually weighs.
--
-- Until now a food saved with serving_unit = 'serving' stored no mass anywhere,
-- so the app could never answer "how big is a serving?" for homemade or custom
-- foods. It papered over that by assuming 100 g, which is how a 62 g slice of
-- homemade sourdough logged as 100 g of macros.
--
-- Null means genuinely unknown, and nothing may substitute a default for it.

-- custom_foods.serving_grams: weight in grams of ONE serving/piece of the food.
-- Only meaningful when serving_unit is serving-like; for a food stored per 100 g
-- there is no defined serving, so it stays null.
ALTER TABLE "public"."custom_foods"
  ADD COLUMN IF NOT EXISTS "serving_grams" numeric;

-- food_entries.serving_grams: total grams of food in THIS entry, resolved at log
-- time. Makes logged history unambiguous even if the food's definition changes
-- later, and lets the log show the real weight next to "1 serving".
ALTER TABLE "public"."food_entries"
  ADD COLUMN IF NOT EXISTS "serving_grams" numeric;

COMMENT ON COLUMN "public"."custom_foods"."serving_grams" IS
  'Weight in grams of one serving/piece of this food. Null = unknown; never default it.';
COMMENT ON COLUMN "public"."food_entries"."serving_grams" IS
  'Total grams logged in this entry. Null = unknown (serving-like unit with no recorded weight).';

-- Backfill only where the mass is already stated rather than inferred: an entry
-- logged in g or ml carries its own weight in serving_size. Serving-like entries
-- stay null; their weight was never captured and must not be invented.
UPDATE "public"."food_entries"
   SET "serving_grams" = "serving_size"
 WHERE "serving_grams" IS NULL
   AND lower("serving_unit") IN ('g', 'ml')
   AND "serving_size" > 0;
