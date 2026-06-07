-- Second-brain goals/areas synced from the vault (20-Areas/goals.yaml via
-- sync_vault_plan.py) → read by generate-daily-brief so the career/learning/
-- training lines reflect his actual goals. Applied live via MCP 2026-06-07.
create table if not exists athlete_goals (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users not null,
  source_key text not null,
  domain text,                     -- training | tactical | career | skill | life
  goal text not null,
  target text,
  status text default 'active',
  priority int default 0,
  notes text,
  active boolean default true,
  updated_at timestamptz default now(),
  unique (created_by, source_key)
);
alter table athlete_goals enable row level security;
drop policy if exists "own goals" on athlete_goals;
create policy "own goals" on athlete_goals for all
  using (auth.uid() = created_by) with check (auth.uid() = created_by);
create index if not exists idx_goals_user_active on athlete_goals(created_by, active);
