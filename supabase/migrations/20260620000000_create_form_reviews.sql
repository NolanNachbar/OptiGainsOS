-- Persists Coach office-hours form critiques so past reviews survive a reload.
-- One row = one AI critique of an uploaded lift clip. Mirrors physique_entries'
-- ownership/RLS conventions: owner-scoped on auth.uid() = created_by. The clip
-- lives in the private 'physique' storage bucket under a form/ prefix; clip_path
-- is the path within that bucket (signed on read, same as physique photos).
create table if not exists public.form_reviews (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  exercise text,
  focus_note text,
  clip_path text not null,
  result jsonb,
  rating int,
  confidence numeric
);

alter table public.form_reviews enable row level security;

-- Owner-only access, keyed on auth.uid() = created_by (mirrors "own physique
-- entries"). Split into per-command policies for clarity.
create policy "own form_reviews select"
  on public.form_reviews
  for select
  to authenticated
  using (auth.uid() = created_by);

create policy "own form_reviews insert"
  on public.form_reviews
  for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "own form_reviews update"
  on public.form_reviews
  for update
  to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

create policy "own form_reviews delete"
  on public.form_reviews
  for delete
  to authenticated
  using (auth.uid() = created_by);

grant all on table public.form_reviews to anon;
grant all on table public.form_reviews to authenticated;
grant all on table public.form_reviews to service_role;

create index if not exists form_reviews_user_created_idx
  on public.form_reviews (created_by, created_at desc);
