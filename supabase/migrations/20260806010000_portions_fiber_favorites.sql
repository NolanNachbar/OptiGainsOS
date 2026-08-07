-- Portions, fiber, and favorites.
--
-- serving_grams answered "how much does one serving weigh" for a single serving.
-- A real food has several portions people actually use — a slice, a loaf, a cup —
-- and each has its own weight. food_portions holds that list, and it is also the
-- only honest way to handle cup/tbsp/tsp: those are per-food densities, not the
-- universal water constants the app has been treating them as.

CREATE TABLE IF NOT EXISTS "public"."food_portions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "text" NOT NULL,
    "custom_food_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "grams" numeric NOT NULL,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "food_portions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "food_portions_grams_positive" CHECK ("grams" > 0),
    CONSTRAINT "food_portions_food_fkey" FOREIGN KEY ("custom_food_id")
      REFERENCES "public"."custom_foods"("id") ON DELETE CASCADE
);

ALTER TABLE "public"."food_portions" OWNER TO "postgres";

-- One weight per label per food. Case-insensitive so 'Slice' can't shadow 'slice'.
CREATE UNIQUE INDEX IF NOT EXISTS "food_portions_food_label_key"
  ON "public"."food_portions" ("custom_food_id", lower("label"));

CREATE INDEX IF NOT EXISTS "food_portions_created_by_idx"
  ON "public"."food_portions" ("created_by");

ALTER TABLE "public"."food_portions" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user owns food portions" ON "public"."food_portions";
CREATE POLICY "user owns food portions" ON "public"."food_portions"
  TO "authenticated"
  USING ((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by")
  WITH CHECK ((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by");

GRANT ALL ON TABLE "public"."food_portions" TO "anon";
GRANT ALL ON TABLE "public"."food_portions" TO "authenticated";
GRANT ALL ON TABLE "public"."food_portions" TO "service_role";

COMMENT ON TABLE "public"."food_portions" IS
  'Named portions of a custom food, each with its real weight. Resolved before the generic unit table, so a food-specific cup beats the water-density constant.';

-- Fiber. The one nutrient outside the four macros that changes what gets eaten,
-- and USDA already returns it (nutrient number 291).
ALTER TABLE "public"."food_entries"  ADD COLUMN IF NOT EXISTS "fiber_grams" numeric;
ALTER TABLE "public"."custom_foods"  ADD COLUMN IF NOT EXISTS "fiber_grams" numeric;
ALTER TABLE "public"."user_profiles" ADD COLUMN IF NOT EXISTS "daily_fiber_goal" integer;

COMMENT ON COLUMN "public"."food_entries"."fiber_grams" IS
  'Fiber in this entry. Null = not known for this food, which is not the same as zero.';
COMMENT ON COLUMN "public"."user_profiles"."daily_fiber_goal" IS
  'Explicit daily fiber target. Null falls back to the DRI ratio of 14 g per 1000 kcal.';

-- Favorites, so a food that matters stops falling out of the recents list.
ALTER TABLE "public"."custom_foods"
  ADD COLUMN IF NOT EXISTS "is_favorite" boolean DEFAULT false;
