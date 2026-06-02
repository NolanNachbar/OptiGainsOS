---
type: Roadmap
project: OptiGainsOS
status: active
created: 2026-06-02
updated: 2026-06-02
---

# OptiGainsOS — Build Roadmap

## Goals
**Primary:** Maximize muscle growth and strength.
**Secondary:** Build toward sub-10hr Ironman fitness.
When these conflict, lifting recovery wins. The system surfaces the tradeoff explicitly but defaults to protecting strength gains.

## Status Overview

| Phase | Theme | Status |
|---|---|---|
| 0 | Codebase Cleanup | ✅ Done |
| 1 | Foundation | ✅ Done |
| 2 | Training Core | 🔲 Next |
| 3 | Data Pipes — Garmin + Apple Health | 🔲 |
| 4 | AI Daily Brief | ⏸ On hold — needs Anthropic API key |
| 4.5 | Adaptive Programming | ⏸ On hold — needs Phase 3 data + API key |
| 5 | Nutrition — Supplements + Fueling | 🔲 |
| 6 | Progress Tracking — Photos + Measurements | 🔲 |
| 7 | Mind + Career tabs | 🔲 |
| 8 | Second Brain Sync | 🔄 In progress (cron script being built) |
| 9 | Polish | 🔲 |

---

## ✅ Phase 0 — Codebase Cleanup
All commercial/social/multi-tenant code stripped from FlexAppeal fork. Build passes clean.

---

## ✅ Phase 1 — Foundation
- New Supabase project: `fizdftijlbcnjmemrvao`
- Auth working, signup disabled
- 18 tables created with RLS, data imported (3 workouts, weight, food history)
- 5-tab nav: Home / Train / Fuel / Mind / Career
- Endurance fields added to `user_profiles`: `race_date` (optional), `ironman_target_hours` (default 10.0), `primary_sport_focus` (default 'concurrent')

**Still needed:**
- [ ] `/profile` setup — height, weight, goals, macros → creates `user_profiles` row Dashboard needs
- [ ] GitHub Pages deployment (low priority, do when ready to go mobile)

---

## 🔲 Phase 2 — Training Core
**Goal:** Every workout has context going in and out. Morning takes < 2 min.

### DB tables
```sql
CREATE TABLE soreness_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  date date NOT NULL,
  muscle_group text NOT NULL,
  soreness_level int CHECK (soreness_level BETWEEN 0 AND 3),
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE subjective_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  date date NOT NULL,
  type text CHECK (type IN ('morning','evening')),
  energy int CHECK (energy BETWEEN 1 AND 10),
  mood int CHECK (mood BETWEEN 1 AND 10),
  notes text,
  workout_adherence text CHECK (workout_adherence IN ('yes','partial','no')),
  macro_adherence text CHECK (macro_adherence IN ('yes','close','no')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date, type)
);
```

### Features
- [ ] **Morning check-in card** (`src/components/dashboard/MorningCheckin.jsx`)
  - Energy 1–10, mood 1–10, free text
  - Muscle group soreness picker (8 groups, 0→3 tap)
  - < 90 seconds on mobile
- [ ] **RPE per set** — number field on each set in `src/components/workouts/ExerciseCard.jsx`
- [ ] **Pre-workout note** — text field before first set
- [ ] **Post-workout note** — text field on "finish workout" confirmation
- [ ] **Dashboard soreness card** — today's soreness summary, prompt if not logged

---

## 🔲 Phase 3 — Data Pipes
**Goal:** Garmin and Apple Health flowing in overnight. Steps auto-derive activity level. Race phase drives AI context.

### DB table
```sql
CREATE TABLE recovery_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  date date NOT NULL,
  -- Garmin
  hrv numeric,
  sleep_score int,
  sleep_duration_min int,
  body_battery int,
  resting_hr int,
  vo2max_run numeric,
  vo2max_cycling numeric,
  training_load_acute numeric,
  training_load_chronic numeric,
  stress_score int,
  steps int,
  active_calories int,
  -- Tri-specific (from Garmin)
  tss_run numeric,          -- Training Stress Score by sport
  tss_cycling numeric,
  tss_swim numeric,
  -- Apple Health (fallback)
  ah_hrv numeric,
  ah_sleep_min int,
  ah_resting_hr int,
  ah_weight numeric,
  source text CHECK (source IN ('garmin','apple_health','manual')),
  raw_payload jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date, source)
);
```

### 3a — Apple Health (do first)
- [ ] Buy **Health Auto Export** on iPhone (~$5)
- [ ] Configure exports: HRV, sleep, resting HR, weight, active energy → Supabase webhook
- [ ] Write `supabase/functions/health-webhook/index.ts`

### 3b — Garmin Connect API
- [ ] Register at Garmin Health API portal — start now, approval takes 2–5 days
- [ ] OAuth 2.0 flow → store tokens in `user_profiles` (`garmin_access_token`, `garmin_refresh_token`, `garmin_expires_at`)
- [ ] Write `supabase/functions/garmin-sync/index.ts` — nightly cron 2am
  - Pulls: sleep, body battery, HRV, training load, VO2 max, stress, steps, active calories
  - **Pulls by activity type:** swim/bike/run TSS separately for Ironman tracking
  - Upserts into `recovery_metrics`
- [ ] Settings page: Garmin connect button + status

### 3c — Auto Activity Level from Steps
7-day rolling average of Garmin steps → maps to TDEE multiplier automatically:
```
< 5,000 steps     → sedentary        (×1.2)
5,000–7,499       → lightly_active   (×1.375)
7,500–9,999       → moderately_active (×1.55)
10,000–12,499     → very_active      (×1.725)
≥ 12,500          → extremely_active (×1.9)
```
- [ ] `getActivityLevelFromSteps(avgSteps)` in `src/utils/coachingUtils.js`
- [ ] `getBestTDEE()` prefers Garmin-derived level, falls back to profile setting
- [ ] Dashboard: "Activity level auto-set: 8,432 avg steps → Moderately Active"

### 3d — Endurance Goal Context
No race date — goal is "sub-10hr Ironman fitness + maximum size/strength simultaneously." The system tracks fitness markers toward that target rather than a countdown.

- [ ] Profile page: `ironman_target_hours` field (default 10.0), `primary_sport_focus` (concurrent)
- [ ] `src/utils/enduranceUtils.js` — compute Ironman fitness markers from Garmin data:
  - Estimated finish time from current run VO2 max, cycling FTP proxy, swim pace
  - Gap to sub-10hr target by discipline
- [ ] Concurrent training conflict flag: when weekly training load is very high across both modalities, AI brief surfaces the tradeoff explicitly ("strength gains will be slower this week — that's the cost of the volume you're carrying")
- [ ] No periodization phases (no race date) — system stays in open-ended base building until a race date is set

### 3e — Readiness Score + Recovery Page
- [ ] `src/utils/recoveryUtils.js` — composite readiness: `(body_battery × 0.4) + (sleep_score × 0.4) + (subjective_energy × 0.2)` → 0–100
- [ ] Dashboard readiness ring
- [ ] `src/pages/RecoveryDetail.jsx` — HRV 7-day, body battery, acute:chronic load, step trend, TSS by sport

---

## ⏸ Phase 4 — AI Daily Brief (On Hold)
**Blocked on:** Anthropic API key. Without one, the automated daily brief can't run on a schedule.

When an API key is available, the brief runs as a Supabase Edge Function at 6am via cron, calls Claude Haiku with prompt caching, costs ~$1/month.

The app works fully without Phase 4 — all data tracking, logging, and Second Brain sync are independent of the AI brief.

### DB table
```sql
CREATE TABLE daily_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  date date NOT NULL UNIQUE,
  brief_json jsonb NOT NULL,
  generated_at timestamptz DEFAULT now(),
  model_used text,
  input_tokens int,
  output_tokens int,
  cache_read_tokens int
);

CREATE TABLE todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  date date NOT NULL,
  text text NOT NULL,
  domain text CHECK (domain IN ('training','nutrition','career','mind','recovery','admin')),
  source text CHECK (source IN ('ai_generated','manual')),
  completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
```

### Brief structure — "Coaching Team" format
Each section labeled by the "coach" responsible:

| Coach | Looks at |
|---|---|
| Performance Coach | Volume, intensity, PRs, soreness, recovery score |
| Endurance Coach | TSS by sport, training load, VO2 max trend, gap to sub-10hr target |
| Nutrition Coach | Macros vs. targets, calorie trend, supplements |
| Body Comp Analyst | Weight trend, measurement direction |
| Learning Coach | Reading, study hours, skills not practiced > 14 days |
| Career Coach | Pipeline, follow-ups overdue, skill gaps |

### Edge Function
- [ ] Write `supabase/functions/generate-daily-brief/index.ts` — runs 6am via cron
  - Cached block: profile + goals + current program + race context (phase, weeks to race)
  - Fresh block: last 7 days recovery, soreness, workout logs, tri TSS by sport, nutrition, weight trend, job pipeline, skills
  - Calls `claude-haiku-4-5` with prompt caching
  - JSON keys: `performance`, `endurance`, `nutrition`, `body_comp`, `learning`, `career`, `insight`, `today_actions`
  - `today_actions` = auto-generated checkable list from domain state (overdue follow-ups, missed supplements, scheduled workout, etc.)
  - Hard cap: input > 8,000 tokens → trim oldest data first

### Frontend
- [ ] `src/components/dashboard/DailyBriefCard.jsx` — coaching team sections, collapsible, cost in footer
- [ ] `src/components/dashboard/TodayActions.jsx` — checkable action list from brief + manual one-off tasks
- [ ] `src/pages/BriefHistory.jsx` — scroll past briefs
- [ ] Settings: monthly token spend → estimated cost

---

## 🔲 Phase 4.5 — Adaptive Programming
**Prerequisite:** Needs Phase 2 (RPE/soreness data) + Phase 3 (recovery metrics) running for at least 2–3 weeks first.

**Model:** Rolling weekly AI-proposed training plan based on actual performance + recovery, replacing fixed program enrollment.

### How it works
1. **Monday morning** — AI proposes next week's workouts based on:
   - Last week's RPE, soreness, and volume
   - Current recovery metrics (HRV trend, body battery)
   - Race phase (base = volume, build = intensity, peak = sharpening, taper = reduction)
   - Lifting goals (progressive overload targets per exercise)
2. **You approve/adjust** — quick card: "Here's your week, tweak if needed"
3. **Post-workout feedback** — RPE + notes feed back. Over months, the system learns your response patterns.
4. **A/B experiment mode** — AI proposes experiments (e.g. "run 4×6 on bench for 6 weeks vs. 3×10"), tracks them, reports results.

### DB tables
```sql
CREATE TABLE weekly_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  week_start date NOT NULL UNIQUE,
  proposed_plan jsonb NOT NULL,    -- AI's proposed workouts
  approved_plan jsonb,             -- after your adjustments
  approved_at timestamptz,
  rationale text,                  -- AI's reasoning
  created_at timestamptz DEFAULT now()
);

CREATE TABLE training_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  hypothesis text NOT NULL,
  variable text NOT NULL,          -- e.g. "bench rep scheme"
  condition_a text NOT NULL,       -- e.g. "4×6 @ 85%"
  condition_b text NOT NULL,       -- e.g. "3×10 @ 70%"
  duration_weeks int NOT NULL,
  started_at date,
  ended_at date,
  outcome text,
  notes text,
  created_at timestamptz DEFAULT now()
);
```

### Edge Function
- [ ] `supabase/functions/generate-weekly-plan/index.ts` — runs Sunday 8pm
  - Reads: last 4 weeks of workout logs + RPE, recovery trends, race phase, current PRs
  - Calls Claude Haiku (or Sonnet if complexity warrants)
  - Writes to `weekly_plans`, notifies user

---

## 🔲 Phase 5 — Nutrition (Supplements + Fueling)
**Goal:** Full picture of inputs — food + supps + water + fueling for long sessions.

### DB tables
```sql
CREATE TABLE supplement_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  name text NOT NULL,
  default_dose numeric,
  unit text,
  timing_note text
);

CREATE TABLE supplement_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  supplement_type_id uuid REFERENCES supplement_types,
  supplement_name text NOT NULL,
  dose numeric, unit text,
  taken_at timestamptz DEFAULT now(),
  notes text
);

CREATE TABLE water_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  amount_ml int NOT NULL,
  logged_at timestamptz DEFAULT now()
);
```

### Features
- [ ] `src/pages/Supplements.jsx` — list supplements, one-tap log with default dose
- [ ] Water card on Fuel tab — `+250ml` buttons, daily total vs. 3000ml target
- [ ] Fuel tab summary: macros + water % + supplement checkboxes at a glance
- [ ] **Fueling Planner** — for training days > 90 min (detected from Garmin or schedule):
  - AI brief nutrition section auto-generates pre/during/post fueling plan
  - Based on session type (long run vs. brick vs. lifting), duration, and calorie targets
  - Example output: "Pre: oats + banana. During: 60g carbs/hr (gels or Maurten). Post: 50g protein + 150g carbs within 30 min"

---

## 🔲 Phase 6 — Progress Tracking
**Goal:** Objective, honest view of body composition direction over time.

### DB table
```sql
CREATE TABLE measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  date date NOT NULL,
  chest_cm numeric, waist_cm numeric, hips_cm numeric,
  left_arm_cm numeric, right_arm_cm numeric,
  left_quad_cm numeric, right_quad_cm numeric,
  neck_cm numeric,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE progress_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  date date NOT NULL,
  storage_path text NOT NULL,      -- Supabase Storage, private bucket
  angle text CHECK (angle IN ('front','side','back')),
  ai_analysis jsonb,               -- Claude Vision output
  created_at timestamptz DEFAULT now()
);
```

### Features
- [ ] **Weight trend** — 7-day rolling average overlaid on daily readings, trajectory vs. goal
- [ ] **Measurement log** — tape measurements every 2–4 weeks (chest, waist, arms, quads, neck). Simple form, trend view.
- [ ] **Progress photos** — weekly photo upload → Supabase Storage (private bucket, your data only)
  - Claude Sonnet Vision analysis: muscle group changes, body comp direction ("trending leaner / same / softer")
  - Presented as direction, never fake BF% numbers
  - Side-by-side comparison: week 1 vs. week 4 vs. current
  - **Cost note:** Sonnet vision ~$0.01–0.03/photo, ~$0.15/month for weekly photos — acceptable

---

## 🔲 Phase 7 — Mind + Career
**Goal:** Track learning and job search. Nothing falls off the radar.

### DB tables
```sql
CREATE TABLE reading_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  title text NOT NULL, author text,
  category text CHECK (category IN ('technical','business','philosophy','other')),
  status text CHECK (status IN ('reading','finished','paused','want-to-read')),
  rating int CHECK (rating BETWEEN 1 AND 5),
  started_at date, finished_at date,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE study_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  topic text NOT NULL,
  duration_min int NOT NULL,
  medium text CHECK (medium IN ('video','book','project','course','article')),
  notes text,
  logged_at timestamptz DEFAULT now()
);

CREATE TABLE skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  name text NOT NULL, category text,
  level int CHECK (level BETWEEN 1 AND 5),
  last_practiced_at date, notes text
);

CREATE TABLE job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  company text NOT NULL, role text NOT NULL,
  date_applied date,
  status text CHECK (status IN ('applied','screening','interview','offer','rejected')),
  notes text, next_action text, next_action_date date,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE networking_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  person_name text NOT NULL, company text, interaction_type text,
  date date NOT NULL, notes text, follow_up_date date,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE monthly_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  month date NOT NULL UNIQUE,   -- first of month
  what_worked text,
  what_didnt text,
  next_month_goals text,
  ai_summary text,              -- Claude synthesis of month's data
  created_at timestamptz DEFAULT now()
);
```

### Mind tab
- [ ] Reading log: add/edit, status toggle, rating, notes. "Currently reading" pinned at top.
- [ ] Study log: quick entry. Weekly hours by category (bar chart).
- [ ] Skills tracker: self-rated 1–5, flag stale (> 14 days).

### Career tab
- [ ] Application pipeline: kanban Applied → Screening → Interview → Offer/Rejected
- [ ] Networking log: sorted by `follow_up_date`, overdue in red
- [ ] Summary: "X applications this week · Y follow-ups overdue"

### Monthly Self-Assessment
- [ ] Prompt surfaces on 1st of each month on Home tab
- [ ] 3 fields: what worked, what didn't, goals for next month
- [ ] Claude reads the month's data and adds a synthesis paragraph
- [ ] Writes to `monthly_reviews` — feeds into AI brief context

---

## 🔄 Phase 8 — Second Brain Sync (In Progress)
Cron script running on Mac, Supabase → `~/Claude/BBrain` vault.

**BBrain git status:** Local repo only, no remote configured. To enable push:
```bash
cd ~/Claude/BBrain && git remote add origin <your-private-github-repo-url>
```
Or drop the push step and commit locally for history only.

**Script reads these tables now:**
- `workout_logs` → daily workout summaries
- `food_entries` → daily nutrition totals
- `body_weight_entries` → weight trend
- `subjective_checkins` → energy/mood (once Phase 2 is built)

**Script writes:**
- `BBrain/50-Daily/YYYY-MM-DD.md` — structured daily log
- `BBrain/10-Projects/OptiGainsOS/weekly-summary.md` — overwrites each Sunday

**Extend later as new tables come online:**
- `reading_log` → `BBrain/30-Resources/Reading/[Title].md` when finished
- `job_applications` → `BBrain/10-Projects/Job-Search/pipeline-log.md` on status changes
- `training_experiments` → `BBrain/10-Projects/OptiGainsOS/experiments/`

---

## 🔲 Phase 9 — Polish
1. [ ] GitHub Pages deployment
2. [ ] Push notifications — 7am morning check-in reminder, supplement reminders
3. [ ] Offline support — service worker for workout logging
4. [ ] App icon — replace Vektor logo in `public/`
5. [ ] Charts: weight rolling avg + goal line, HRV trend, TSS by sport, calories vs. weight
6. [ ] CSV export for any dataset

---

## Key Risks

| Risk | Mitigation |
|---|---|
| Garmin API approval takes days | Register now; build Apple Health (3a) first |
| Garmin steps not in Connect API tier | Fallback: Apple Health active energy |
| Adaptive programming needs weeks of data | Don't skip to 4.5 early — wait for real data |
| Claude Vision (photos) costs more than Haiku | Weekly cadence keeps it ~$0.15/month |
| Ironman + lifting conflict not surfaced clearly | AI brief endurance coach section must be explicit about tradeoffs |

---

## What's Working Right Now (2026-06-02)
- Login ✅
- 5-tab nav ✅
- Workout logging ✅ (3 workouts imported)
- Food tracker ✅
- Program builder ✅
- Schedule ✅
- Body weight ✅
- Race calendar fields in DB ✅
- Mind / Career — placeholder screens
- **Dashboard** — needs `/profile` setup first (creates user_profiles row)
