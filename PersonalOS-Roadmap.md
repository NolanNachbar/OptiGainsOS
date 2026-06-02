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
| 2 | Training Core | ✅ Done |
| 3 | Data Pipes — Garmin + Apple Health | ✅ Done (Apple Health + auto-capacity; Garmin local script TBD) |
| 4 | AI Daily Brief | ✅ Done (DB + UI complete; Desktop Agent generates briefs) |
| 4.5 | Adaptive Programming | ⏸ On hold — needs 2–3 weeks of Phase 3 data first |
| 5 | Nutrition — Supplements + Fueling | ✅ Done (supplement stack, one-tap log, water tracker) |
| 6 | Progress Tracking — Photos + Measurements | ✅ Done (weight chart, tape measurements, progress photos in Supabase Storage) |
| 7 | Mind + Career tabs | ✅ Done (Reading, Study, Skills, Pipeline kanban, Networking) |
| 8 | Second Brain Sync | 🔄 In progress (cron script being built) |
| 9 | Polish | 🔲 |

> **CRITICAL before using app:** Run `migrations/SUPABASE_FIX.sql` in Supabase SQL Editor, then `npx supabase secrets set HEALTH_WEBHOOK_SECRET=your_secret`.

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

## ✅ Phase 2 — Training Core
**Goal:** Every workout has context going in and out. Morning takes < 2 min.

- [x] **Morning check-in card** (`src/components/dashboard/MorningCheckin.jsx`)
- [x] **RPE per set** — number field on each set in `src/components/workouts/ExerciseCard.jsx`
- [x] **Pre-workout note** — text field before first set
- [x] **Post-workout note** — text field on "finish workout" confirmation
- [x] **Dashboard soreness card** — today's soreness summary, prompt if not logged

---

## 🔲 Phase 3 — Data Pipes & Dynamic Capacity
**Goal:** Garmin and Apple Health flowing in. System derives training capacity from health data. Desktop agent parses streams into Obsidian.

### 3a — Apple Health (Free Sync)
- [x] Documentation for Apple Shortcuts sync (`docs/AppleHealthShortcut.md`)
- [x] Created `recovery_metrics` table
- [x] Wrote `supabase/functions/health-webhook/index.ts`
- [x] Dashboard: "Auto-set: [Activity Level]" in Nutrition card

### 3b — Garmin Connect (Local Sync)
- [ ] Implement local Python/Node script for Desktop Agent
- [ ] Use `garminconnect` scraping logic (avoids official API approval)
- [ ] Script pulls: sleep, body battery, HRV, training load, steps
- [ ] Script pushes to Supabase `recovery_metrics`

### 3c — Auto Activity Level from Steps
- [x] `getActivityLevelFromSteps(avgSteps)` in `src/utils/coachingUtils.js`
- [x] `getBestTDEE()` prefers step-derived level

### 3d — Dynamic Capacity Model
- [x] Profile page: `max_daily_training_hours` (constraint) + `primary_sport_focus`
- [ ] `src/utils/recoveryUtils.js` — compute recommended workout duration based on:
  - Last 7 days recovery metrics (HRV trend)
  - Acute:Chronic Workload Ratio (ACWR)
  - Max hours constraint from profile
- [ ] Dashboard: "Suggested for today: [X] min workout" based on capacity

### 3e — Readiness Score + Recovery Page
- [x] `src/utils/recoveryUtils.js` — composite readiness scoring logic
- [x] Dashboard readiness ring integration
- [x] `src/pages/RecoveryDetail.jsx` — charts for HRV, Steps, Sleep, and ACWR

---

## 🔲 Phase 4 — AI Daily Brief & Capture Stream
**Goal:** High-speed capture on phone, daily AI synthesis.

- [x] `capture_inbox` table for streaming notes to Second Brain
- [x] **Mind tab:** Learning log capture UI (Second Brain stream)
- [x] **Career tab:** Pipeline capture UI (Second Brain stream)
- [ ] **AI Daily Brief:** Edge function calls Claude Haiku to synthesize:
  - Yesterday's logs + morning metrics → Today's training/focus plan
  - Career pipeline status → Next action recommendation

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

## ✅ Phase 9 — Polish
1. [x] GitHub Pages deployment — `npm run build:pages`, base set to `/OptiGains/`
2. [x] Push notifications — `NotificationSettings` component, VAPID-ready (needs `VITE_VAPID_PUBLIC_KEY` env var). Run `npx web-push generate-vapid-keys` to get keys.
3. [x] Offline support — service worker updated with app shell caching + network-first navigation
4. [x] App icon — `optigains-icon.svg` (volt green bolt), `manifest.json` rebranded to OptiGainsOS
5. [x] Weight chart — EWMA trend line already in `WeightProgressChart`
6. [x] CSV export — 8 datasets: lifting, food, weight, recovery, supplements, reading, job applications, measurements

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

## What's Working Right Now (2026-06-02, post-Phase-3)
- Login ✅
- 5-tab nav ✅
- Workout logging + RPE ✅
- Morning check-in (energy/mood/soreness) ✅
- Pre/post workout notes ✅
- Dashboard soreness summary card ✅
- Food tracker ✅
- Program builder / Schedule ✅
- Body weight ✅
- Apple Health webhook (`supabase/functions/health-webhook`) ✅
- Auto-activity level from steps ✅
- Dynamic capacity model (suggested session duration) ✅
- Recovery Detail page (HRV/Steps/Sleep/ACWR charts) ✅
- Capture Inbox table ✅
- Mind tab — Learning Log capture ✅
- Career tab — Pipeline Log capture ✅
- Home quick note ✅
- **App shows 400/404 until `migrations/SUPABASE_FIX.sql` is run**
- **Dashboard full render** — needs `/profile` setup first (creates user_profiles row)
