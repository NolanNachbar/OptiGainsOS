-- The workout library's folder feature (CreateWorkout folder field, Workouts
-- folder filter/rename, WorkoutCard badge) writes/reads workouts.folder, but
-- the column was never created. Nullable organizational field. Additive + safe.
alter table public.workouts
  add column if not exists folder text;
