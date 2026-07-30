-- Manual per-day food floor (e.g. force >=250g Cottage Cheese for a Creami
-- day) layered on top of the cost-optimizer. Independent of `action`
-- (ease/push/manual) -- same per-date row, one more optional column.
ALTER TABLE "public"."nutrition_overrides"
  ADD COLUMN IF NOT EXISTS "food_mins" jsonb;
