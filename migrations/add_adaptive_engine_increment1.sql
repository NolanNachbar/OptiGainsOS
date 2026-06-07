-- Adaptive engine increment 1 — schema (ADAPTIVE_ENGINE_DESIGN.md §0) + landmark seed.
-- Applied live via MCP on 2026-06-07; recorded here for version control.

create table if not exists athlete_landmarks (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users not null,
  muscle text not null,
  mev numeric not null, mav numeric not null, mrv numeric not null,
  mrv_mean numeric not null, mrv_var numeric not null,
  n_obs int default 0, mature boolean default false,
  updated_at timestamptz default now(),
  unique (created_by, muscle)
);

create table if not exists athlete_params (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users not null,
  param_key text not null,
  mean numeric not null, variance numeric not null,
  n_obs int default 0, mature boolean default false, meta jsonb,
  updated_at timestamptz default now(),
  unique (created_by, param_key)
);

create table if not exists controlled_tests (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users not null,
  test_type text check (test_type in
    ('recovery_stress','volume_tolerance','running_tolerance','pst_diagnostic')),
  target_key text,
  status text check (status in ('scheduled','active','complete','aborted')) default 'scheduled',
  scheduled_date date, started_at date, baseline jsonb, result jsonb,
  created_at timestamptz default now()
);

create table if not exists weekly_plans (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users not null,
  week_start date not null,
  set_targets jsonb not null, frequency_targets jsonb not null,
  run_plan jsonb not null, two_a_day_days int[], rationale text,
  created_at timestamptz default now(),
  unique (created_by, week_start)
);

alter table user_profiles add column if not exists goal_priorities jsonb;

alter table athlete_landmarks enable row level security;
alter table athlete_params    enable row level security;
alter table controlled_tests  enable row level security;
alter table weekly_plans      enable row level security;
create policy "own landmarks" on athlete_landmarks for all using (auth.uid() = created_by) with check (auth.uid() = created_by);
create policy "own params"    on athlete_params    for all using (auth.uid() = created_by) with check (auth.uid() = created_by);
create policy "own tests"     on controlled_tests  for all using (auth.uid() = created_by) with check (auth.uid() = created_by);
create policy "own plans"     on weekly_plans      for all using (auth.uid() = created_by) with check (auth.uid() = created_by);
create index if not exists idx_landmarks_user on athlete_landmarks(created_by);
create index if not exists idx_params_user on athlete_params(created_by);
create index if not exists idx_tests_user_status on controlled_tests(created_by, status);
create index if not exists idx_plans_user_week on weekly_plans(created_by, week_start desc);

-- Seed athlete_landmarks from the canonical priors (engine.hypertrophy_volume.LANDMARK_PRIORS).
-- Replace the uuid for other users. mrv_var = 9 (prior uncertainty, [ENG]).
insert into athlete_landmarks (created_by, muscle, mev, mav, mrv, mrv_mean, mrv_var) values
 ('169d2f0b-cf5a-44fb-8551-845004725a26','chest',8,14,20,20,9),
 ('169d2f0b-cf5a-44fb-8551-845004725a26','upper_back',10,16,22,22,9),
 ('169d2f0b-cf5a-44fb-8551-845004725a26','lats',10,16,22,22,9),
 ('169d2f0b-cf5a-44fb-8551-845004725a26','quads',8,14,20,20,9),
 ('169d2f0b-cf5a-44fb-8551-845004725a26','hamstrings',6,12,16,16,9),
 ('169d2f0b-cf5a-44fb-8551-845004725a26','glutes',6,12,16,16,9),
 ('169d2f0b-cf5a-44fb-8551-845004725a26','shoulders',6,12,18,18,9),
 ('169d2f0b-cf5a-44fb-8551-845004725a26','triceps',8,14,18,18,9),
 ('169d2f0b-cf5a-44fb-8551-845004725a26','biceps',8,14,20,20,9),
 ('169d2f0b-cf5a-44fb-8551-845004725a26','calves',8,16,24,24,9),
 ('169d2f0b-cf5a-44fb-8551-845004725a26','core',0,12,16,16,9)
on conflict (created_by, muscle) do nothing;
