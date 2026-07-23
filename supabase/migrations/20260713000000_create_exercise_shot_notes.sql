-- Per-exercise content shot notes for the in-workout "Shot list" toggle
-- (Daily-Brief-Vault-Sync-and-Shot-List-Spec.md, feature 2). Keyed on
-- exercise_name rather than an exercise_id FK because the app has no
-- canonical exercises table — exercises are identified by their name string
-- throughout (ExerciseCard, lookupExercise, exercise_preferences), so this
-- matches that convention. Hand-populated by Nolan, not app-inferred.
create table if not exists public.exercise_shot_notes (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  exercise_name text not null,
  shot_note text not null,
  active boolean not null default true
);

alter table public.exercise_shot_notes enable row level security;

create policy "own exercise_shot_notes select"
  on public.exercise_shot_notes
  for select
  to authenticated
  using (auth.uid() = created_by);

create policy "own exercise_shot_notes insert"
  on public.exercise_shot_notes
  for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "own exercise_shot_notes update"
  on public.exercise_shot_notes
  for update
  to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

create policy "own exercise_shot_notes delete"
  on public.exercise_shot_notes
  for delete
  to authenticated
  using (auth.uid() = created_by);

grant all on table public.exercise_shot_notes to anon;
grant all on table public.exercise_shot_notes to authenticated;
grant all on table public.exercise_shot_notes to service_role;

create index if not exists exercise_shot_notes_user_name_idx
  on public.exercise_shot_notes (created_by, lower(exercise_name));
