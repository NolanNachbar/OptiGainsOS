-- Persists "prescribed cardio session checked off for the day", replacing a
-- localStorage-only flag that never synced across devices and was invisible to
-- the engine. One row = one completed cardio session on a given date.
-- Applied to remote via Supabase MCP on 2026-06-05; committed for reproducibility.
create table if not exists public.cardio_completions (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  cardio_date date not null,
  name text not null,
  completed_at timestamptz not null default now(),
  unique (created_by, cardio_date, name)
);

alter table public.cardio_completions enable row level security;

create policy "user owns cardio_completions"
  on public.cardio_completions
  for all
  to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

create index if not exists cardio_completions_user_date_idx
  on public.cardio_completions (created_by, cardio_date);
