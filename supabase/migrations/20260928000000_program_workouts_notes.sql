-- Program Builder saves each day's "Workout notes" as program_workouts.notes and
-- ProgramDetail shows them, but the column never existed. PostgREST rejects the
-- whole insert (PGRST204 "Could not find the 'notes' column"), so creating any
-- program failed with "Failed to create program". Found on 2026-09-28 by the
-- iphone-sim walkthrough of the builder.
ALTER TABLE public.program_workouts ADD COLUMN IF NOT EXISTS notes text;

-- Let PostgREST see the new column without waiting for its schema cache.
NOTIFY pgrst, 'reload schema';
