-- Manual override of a programmed day.
--
-- Swapping a programmed workout for one out of the library only sticks if the
-- weekly generator leaves that date alone afterwards. It already skips "touched"
-- dates (a started session or a logged workout), but an override happens before
-- either exists, so the very regeneration the override triggers would overwrite
-- the choice. `locked` is that same skip signal, set by hand.
--
-- override_source records where the replacement came from (the library workout's
-- id, or 'custom') so the row is self-explaining.
alter table public.program_workouts
  add column if not exists locked boolean not null default false,
  add column if not exists override_source text;

comment on column public.program_workouts.locked is
  'Manually overridden; generate_weekly_program.py must not rewrite this date.';
comment on column public.program_workouts.override_source is
  'Origin of a manual override: a workouts.id, or ''custom''.';
