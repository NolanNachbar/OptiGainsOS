-- Optional tag on a food entry — used to mark weekly-plan items with their
-- workout-timing window ("pre" / "post") so the log can badge pre/post-workout
-- meals (Nolan lifts early morning). Nullable, additive.
alter table public.food_entries
  add column if not exists tag text;
