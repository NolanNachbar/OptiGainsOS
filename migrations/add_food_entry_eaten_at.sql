-- eaten_at: when the food was actually eaten, distinct from `date` (the log
-- day) and created_at (when the row was inserted). Lets the engine tell
-- "logged in real time" from "logged at the end of the day, backdated to a
-- meal-type default clock time" (src/pages/FoodTracker.jsx's Eating now /
-- Logging earlier toggle). Nullable — legacy rows fall back to a meal-type
-- default bucket on read, no backfill needed.
alter table food_entries add column if not exists eaten_at timestamptz;
