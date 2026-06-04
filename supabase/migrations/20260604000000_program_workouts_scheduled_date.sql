-- Allow program_workouts rows to be pinned to a specific calendar date.
-- MPC-generated workouts are written with scheduled_date set; base templates have NULL.
-- The frontend prefers the date-specific row over the base template when one exists.

ALTER TABLE program_workouts ADD COLUMN IF NOT EXISTS scheduled_date date;

CREATE UNIQUE INDEX IF NOT EXISTS program_workouts_program_scheduled_date_idx
  ON program_workouts(program_id, scheduled_date)
  WHERE scheduled_date IS NOT NULL;
