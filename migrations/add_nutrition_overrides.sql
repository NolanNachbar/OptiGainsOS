-- Manual recovery escape valve: a per-day flag the user sets ("ease today") when
-- a cut day genuinely wrecks them. compute reads today's row and eases the
-- deficit ~35% for the day. One row per day (upsert on conflict). Applied live
-- via MCP 2026-06-07.
create table if not exists nutrition_overrides (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users not null default auth.uid(),
  date date not null default current_date,
  action text not null,                 -- 'ease' (fuel a rough day) | 'push' (hold the full deficit, overruling the auto-ease)
  note text,
  created_at timestamptz default now(),
  unique (created_by, date)
);
alter table nutrition_overrides enable row level security;
drop policy if exists "own overrides" on nutrition_overrides;
create policy "own overrides" on nutrition_overrides for all
  using (auth.uid() = created_by) with check (auth.uid() = created_by);
