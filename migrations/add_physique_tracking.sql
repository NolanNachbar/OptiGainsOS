-- Physique photo/video tracking + AI bodyfat estimation.
-- Applied live via MCP on 2026-06-07; recorded here for version control.

-- Private storage bucket for physique media.
insert into storage.buckets (id, name, public)
values ('physique', 'physique', false)
on conflict (id) do nothing;

-- Storage RLS: a user can only touch files under their own uid folder
-- (uploads go to '<uid>/<timestamp>.<ext>').
drop policy if exists "own physique media" on storage.objects;
create policy "own physique media" on storage.objects for all
  to authenticated
  using      (bucket_id = 'physique' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'physique' and auth.uid()::text = (storage.foldername(name))[1]);

-- Entries table: one row per uploaded photo/video + its analysis.
create table if not exists physique_entries (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users not null,
  photo_path text not null,                 -- storage path within the 'physique' bucket
  media_type text check (media_type in ('photo','video')) default 'photo',
  taken_at date default current_date,
  weight_lb numeric,                        -- optional, for context at time of photo
  bodyfat_estimate numeric,                 -- AI estimate (%); trend matters more than absolute
  confidence text,                          -- low | medium | high
  analysis jsonb,                           -- full structured assessment
  notes text,
  created_at timestamptz default now()
);

alter table physique_entries enable row level security;
drop policy if exists "own physique entries" on physique_entries;
create policy "own physique entries" on physique_entries for all
  using (auth.uid() = created_by) with check (auth.uid() = created_by);

create index if not exists idx_physique_entries_user on physique_entries(created_by, taken_at desc);
