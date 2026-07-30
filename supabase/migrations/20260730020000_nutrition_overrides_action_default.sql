-- action is NOT NULL with no default. The food_mins-only upsert (force a food
-- for a day with no ease/push/manual override yet) doesn't set action, so it
-- was failing on any date without an existing row. "none" is a no-op value --
-- every read path already only branches on action = 'manual' (and 'ease'/'push'
-- elsewhere), so a default of "none" is inert everywhere but here.
ALTER TABLE "public"."nutrition_overrides"
  ALTER COLUMN "action" SET DEFAULT 'none';
