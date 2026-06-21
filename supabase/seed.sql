-- Local test seed. Runs on `supabase db reset`. NOT for prod.
-- One believable athlete + history so charts/dashboards render and logging
-- flows have real data to act on. Dev auto-login (AuthContext) signs in as this
-- user, so RLS + auth.uid() behave exactly like prod.
-- User id is fixed: 11111111-1111-1111-1111-111111111111

-- The dump migration leaves search_path empty on this session; restore it so the
-- unqualified table names below resolve.
set search_path = public, extensions, auth;

-- ── Auth user (email/password login against the local stack) ──────────────────
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated', 'athlete@local.test',
  extensions.crypt('localpassword123', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
) on conflict (id) do nothing;

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"athlete@local.test"}',
  'email', now(), now(), now()
) on conflict do nothing;

-- ── Profile ───────────────────────────────────────────────────────────────────
insert into public.user_profiles (
  id, created_by, display_name, username, weight_unit, primary_goal, days_per_week,
  daily_calorie_goal, daily_protein_goal, daily_carbs_goal, daily_fats_goal,
  current_weight, timezone, show_rir, adaptive_training, diet_phase
) values (
  gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Nolan (Local)', 'localathlete',
  'lbs', '"muscle_gain"'::jsonb, 4, 2800, 185, 250, 70, 185.2, 'America/Denver', true, true, 'cut'
);

-- ── 30-day body weight trend (cut: heavier in the past) ──────────────────────
insert into public.body_weight_entries (created_by, weight, recorded_date)
select '11111111-1111-1111-1111-111111111111',
       round((185.2 + g*0.085 + sin(g*1.7)*0.55)::numeric, 1),
       timezone('America/Denver', now())::date - g
from generate_series(0, 29) g;

-- ── 30-day recovery (HRV/RHR/sleep/body battery) for the trend charts ────────
insert into public.recovery_metrics (created_by, date, hrv, resting_hr, sleep_score, body_battery, source)
select '11111111-1111-1111-1111-111111111111', timezone('America/Denver', now())::date - g,
       round((84 - g*0.3 + sin(g*1.3)*6)::numeric, 1),
       round(47 + sin(g*0.9)*2)::int,
       round(86 - abs(sin(g*0.7))*14)::int,
       round(70 + sin(g*0.5)*15)::int,
       'manual'
from generate_series(0, 29) g;

-- ── Today's readiness check-in ────────────────────────────────────────────────
insert into public.daily_readiness (created_by, date, energy, mood, soreness, sleep_score)
values ('11111111-1111-1111-1111-111111111111', timezone('America/Denver', now())::date, 4, 4, 2, 86);

-- ── Today's food log ──────────────────────────────────────────────────────────
insert into public.food_entries (created_by, date, meal_type, food_name, calories, protein_grams, carbs_grams, fats_grams) values
  ('11111111-1111-1111-1111-111111111111', timezone('America/Denver', now())::date, 'breakfast', 'Oats, Whey & Blueberries', 612, 42, 74, 16),
  ('11111111-1111-1111-1111-111111111111', timezone('America/Denver', now())::date, 'lunch',     'Chicken, Jasmine Rice & Broccoli', 838, 58, 92, 24),
  ('11111111-1111-1111-1111-111111111111', timezone('America/Denver', now())::date, 'snack',     'Greek Yogurt & Granola', 322, 31, 33, 8),
  ('11111111-1111-1111-1111-111111111111', timezone('America/Denver', now())::date, 'dinner',    'Salmon, Potatoes & Asparagus', 704, 49, 61, 27);

-- ── A reusable workout template ──────────────────────────────────────────────
insert into public.workouts (created_by, title, description, focus, duration_minutes, exercises) values
  ('11111111-1111-1111-1111-111111111111', 'Upper Push A', 'Chest/shoulders/triceps', 'strength', 50,
   '[{"name":"Incline Barbell Press","sets":4,"reps":"8"},{"name":"Overhead Press","sets":3,"reps":"8"},{"name":"Cable Lateral Raise","sets":3,"reps":"15"}]'::jsonb);

-- ── 10 historical workout logs (alternating upper/lower) ─────────────────────
insert into public.workout_logs (created_by, log_date, exercises, duration_seconds)
select '11111111-1111-1111-1111-111111111111', timezone('America/Denver', now())::date - (g*2 + 1),
  case when g % 2 = 0
    then '[{"name":"Incline Barbell Press","sets":[{"weight":165,"reps":8},{"weight":165,"reps":8},{"weight":165,"reps":7},{"weight":165,"reps":7}]},{"name":"Weighted Pull-Up","sets":[{"weight":45,"reps":6},{"weight":45,"reps":6},{"weight":45,"reps":5}]}]'::jsonb
    else '[{"name":"Back Squat","sets":[{"weight":285,"reps":5},{"weight":285,"reps":5},{"weight":285,"reps":5}]},{"name":"Romanian Deadlift","sets":[{"weight":245,"reps":8},{"weight":245,"reps":8}]}]'::jsonb
  end,
  3300 + (g % 3) * 420
from generate_series(0, 9) g;

-- ── Today's athlete_state (dashboard cards read these jsonb blobs) ────────────
insert into public.athlete_state (created_by, date, recovery, fatigue, nutrition, strength, hypertrophy, banister)
values ('11111111-1111-1111-1111-111111111111', timezone('America/Denver', now())::date,
  -- data_available gates the Recovery card/tile; compute_athlete_state.py sets it,
  -- so the seed must too or all three recovery surfaces render empty.
  -- push_readiness drives the RecoverySection badge; without it the badge falls
  -- back to "Unknown" while the SummaryStrip tile shows 78/100 — the contradiction
  -- in the audit. body_battery/energy back the lower grid (else they render "—").
  '{"data_available":true,"score":78,"push_readiness":"high","hrv":84,"sleep_score":86,"resting_hr":47,"hrv_trend":"rising","body_battery":70,"energy":4}'::jsonb,
  '{"tsb":4.2,"acwr":1.12,"ctl":62,"atl":58,"interpretation":"productive_training"}'::jsonb,
  '{"avg_calories_7d":2764,"avg_protein_7d":182,"calorie_target":2800,"protein_target":185,"weight_trend_lbs_per_week":-0.6,"phase":"cut"}'::jsonb,
  -- StrengthSection only renders per-lift OBJECTS keyed by the engine's lift names
  -- (current_e1rm/target/stall_risk/…). The old flat {bench_1rm:…} scalars were
  -- ignored and the card showed "No strength data yet".
  '{"Bench (paused comp)":{"current_e1rm":245,"target":275,"stall_risk":0.2,"eta_days":21,"progression_rate_lbs_per_week":2.5,"sessions":18,"progression_command":"INCREASE_LOAD"},"Squat (comp)":{"current_e1rm":335,"target":365,"stall_risk":0.35,"eta_days":35,"progression_rate_lbs_per_week":3.0,"sessions":16,"progression_command":"HOLD"},"Deadlift (conventional comp)":{"current_e1rm":405,"target":455,"stall_risk":0.5,"eta_days":49,"progression_rate_lbs_per_week":5.0,"sessions":14,"progression_command":"HOLD"}}'::jsonb,
  '{"weekly_volume_lbs":148200,"hard_sets":64,"frequency":4}'::jsonb,
  '{"fitness":62.4,"fatigue":58.1,"tsb":4.2}'::jsonb);

-- ── Today's daily brief ───────────────────────────────────────────────────────
insert into public.daily_briefs (created_by, date, brief_json, model_used)
values ('11111111-1111-1111-1111-111111111111', timezone('America/Denver', now())::date,
  '{"insight":"HRV has risen three days straight while intake fell. The cut is landing without a recovery cost, so spend it on the upper-push session today.","performance":"Pressing volume is up 9% week-over-week at equal RIR. Keep the 4x8 incline at 165 and add 5 lb next exposure if bar speed holds.","nutrition":"2,764 / 2,800 kcal on average, protein at 1.0 g/lb. Front-load carbs pre-session.","body_comp":"-0.6 lb/wk trend weight, right in the target band."}'::jsonb,
  'claude-haiku-4-5');

-- ── Prior-day briefs so Insights "Recent Briefs" has history to show ──────────
insert into public.daily_briefs (created_by, date, brief_json, model_used)
values
  ('11111111-1111-1111-1111-111111111111', timezone('America/Denver', now())::date - 1,
   '{"insight":"HRV held flat after yesterday''s pull session. Recovery is keeping pace with the load.","performance":"+10 lb on the deadlift top set at the same bar speed as last week. Progression is real, not grind.","nutrition":"2,810 kcal and 1.0 g/lb protein. On target.","body_comp":"Trend weight steady. No whoosh yet, which is expected mid-cut."}'::jsonb,
   'claude-haiku-4-5'),
  ('11111111-1111-1111-1111-111111111111', timezone('America/Denver', now())::date - 2,
   '{"insight":"Sleep score dipped to 79. Keep intensity in check on accessories today.","performance":"Incline press stalled at 165x8 for the second exposure. Hold load, chase the rep.","nutrition":"Carbs landed low at 210g. Front-load tomorrow pre-session.","body_comp":"-0.7 lb/wk trend weight, slightly ahead of the target band."}'::jsonb,
   'claude-haiku-4-5'),
  ('11111111-1111-1111-1111-111111111111', timezone('America/Denver', now())::date - 3,
   '{"insight":"The three-day HRV rise begins here. Last week''s deload paid off.","performance":"Squat e1RM ticked to 335. Bar speed strong, green to push next week.","nutrition":"2,790 kcal, protein 1.1 g/lb. Clean adherence.","body_comp":"-0.5 lb on the week, right on plan."}'::jsonb,
   'claude-haiku-4-5');
