---
type: PRD
project: PersonalOS
status: draft
created: 2026-06-02
---

# PersonalOS — Product Requirements Document

**What:** A private, personal web app (PWA) hosted on GitHub Pages that serves as a unified interface for optimizing every major domain of Nolan's life — physical performance, nutrition, recovery, learning, and career. Built as a fork of FlexAppeal (React + Vite + Supabase), deployed behind Supabase auth, accessible from any device including phone.

**Who it's for:** Nolan Nachbar, exclusively. Not a commercial product. No multi-tenancy needed. No gym B2B layer.

**Why it exists:** The FlexAppeal codebase already solves ~60% of the problem (workout logging, nutrition, Strava, ML recommendations). PersonalOS extends it into a full life operating system — pulling in recovery data from Garmin/Apple Health, surfacing a daily AI brief, connecting to the second brain (Obsidian vault), and adding career/learning tracking alongside the fitness stack.

---

## Core Philosophy

- **Capture everything on the phone.** Every log, note, meal, workout, supplement — entered on mobile, stored in Supabase.
- **AI runs once daily, costs almost nothing.** Claude Haiku + prompt caching. Daily brief generated at 6am, stored in DB, displayed as a read-only card. No per-interaction AI calls.
- **Second brain is the long-term memory.** Supabase is the real-time data layer. Obsidian is the archive. A nightly sync job writes structured logs from Supabase into the Obsidian vault as markdown.
- **Everything feeds the AI context.** Every domain (training, nutrition, sleep, learning, career) contributes to one shared context window so recommendations are truly holistic.
- **No feature bloat.** Every feature must answer: does this help Nolan get bigger/stronger, smarter, or closer to a high-paying job?

---

## Domain Architecture

### 1. Physical — Training
**Goal:** Get bigger and stronger. Track progressive overload over months and years.

**Data in:**
- Manual workout logs (sets, reps, weight) — existing FlexAppeal feature
- Pre-workout soreness check-in (1–5 per muscle group, free-text notes)
- Post-workout notes (what felt good/bad, injuries, pump)
- RPE per set (rate of perceived exertion, 1–10)

**Data out:**
- Program schedule pulled from existing Vektor program builder
- Progressive overload tracking (is each lift trending up?)
- Volume load per muscle group per week (existing heatmap)
- AI training recommendation for the day based on recovery status

**Existing FlexAppeal features to keep:** Program builder, workout logging, muscle heatmap, PR tracking, schedule.

**New features needed:** Pre/post workout notes, RPE per set, soreness check-in UI.

---

### 2. Physical — Recovery
**Goal:** Know when to push and when to back off. Avoid overtraining.

**Data in:**
- Garmin Connect API: sleep score, HRV status, body battery, training load (acute + chronic), VO2 max trend, resting HR, stress score
- Apple Health (via Health Auto Export webhook): sleep duration, resting HR, HRV, weight
- Manual: subjective energy (1–10), mood (1–10), logged in morning check-in

**Data out:**
- Recovery score (composite of Garmin body battery + subjective energy + sleep score)
- "Push / Maintain / Recover" daily recommendation
- HRV trend chart (7-day rolling)
- Training load chart (acute:chronic ratio — injury risk indicator)

**Integration notes:**
- Garmin Connect API: OAuth 2.0, developer account required. Pulls nightly via Supabase Edge Function.
- Apple Health: Health Auto Export app (iOS) configured to POST to a Supabase Edge Function webhook on a schedule. No native code needed.

---

### 3. Physical — Nutrition
**Goal:** Eat to support training goals (bulk / cut / maintain). Optimize supplement timing.

**Data in:**
- Food log (existing FlexAppeal feature — USDA + Open Food Facts barcode)
- Supplement log: what, dose, time (new — simple form, predefined list + custom)
- Water intake (manual log, optional)
- Diet phase: bulk / cut / maintain (existing)

**Data out:**
- Daily macro summary vs. targets
- Calorie surplus/deficit trend vs. body weight trend
- Supplement schedule reminders (push notification)
- AI notes on nutrition gaps or timing suggestions (part of daily brief)

**Existing FlexAppeal features to keep:** Food tracker, TDEE calculation, macro targets, diet phase, body weight logging.

**New features needed:** Supplement tracker, water log (optional), supplement reminder notifications.

---

### 4. Mind — Learning & Reading
**Goal:** Get smarter. Build skills relevant to target career. Track what's being consumed.

**Data in:**
- Reading log: book/article title, author, category (technical / business / philosophy / other), status (reading / finished / paused), rating, notes
- Study log: topic, duration (minutes), medium (video / book / project / course), notes
- Skills tracker: skill name, current level (1–5 self-assessed), last practiced date

**Data out:**
- Weekly learning hours by category
- Books finished this year
- Skills not practiced in >14 days (flagged in daily brief)
- Reading list / queue

**Second brain sync:** Finished books + notes get written to `BBrain/30-Resources/Reading/` as `.md` files. Study sessions get appended to the relevant daily note in `BBrain/50-Daily/`.

---

### 5. Career
**Goal:** Land a high-paying job. Track pipeline, skill building, and networking.

**Data in:**
- Job applications: company, role, date applied, status (applied / screening / interview / offer / rejected), notes
- Networking log: person, company, interaction type, date, follow-up needed
- Skill gap log: skills needed for target roles, progress toward each
- Interview prep log: topic practiced, date, notes

**Data out:**
- Application pipeline kanban (applied → screening → interview → offer)
- Applications sent this week / this month
- Follow-ups overdue (networking touchpoints > 7 days with no update)
- Skills not practiced recently (flagged in daily brief)
- AI weekly career brief: what to focus on this week based on pipeline state + skill gaps

**Second brain sync:** Job application status changes get written to `BBrain/10-Projects/Job-Search/` pipeline log.

---

### 6. Daily Operating System
**Goal:** Start every day with clarity on what to focus on. End every day with a log of what happened.

**Morning Check-in (takes < 2 min on phone):**
- Subjective energy (1–10)
- Subjective mood (1–10)
- Soreness check (quick muscle group picker, 0–3 scale)
- One free-text field: "anything notable going in to today"
- Pulls from Garmin/Apple Health overnight data

**Evening Log (optional, takes < 1 min):**
- Free-text "wins / notes from today"
- Did you follow the training plan? (yes / partial / no)
- Did you hit macros? (yes / close / no)

**Daily Brief (AI-generated, 6am, ~$0.003 per day):**
Displayed as a card on the Dashboard. Generated once, read many times. Sections:
1. **Recovery status** — based on HRV, sleep, body battery, subjective energy
2. **Training recommendation** — push / maintain / recover + specific note
3. **Nutrition focus** — anything to watch today based on recent trend
4. **Career/learning focus** — one thing to prioritize based on pipeline + skill gaps
5. **One insight** — a pattern Claude noticed across all the data (e.g., "Your lifts are consistently worse on days when sleep < 6.5hrs")

---

## Technical Architecture

### Stack
- **Frontend:** React + Vite + TailwindCSS + shadcn/ui (fork of FlexAppeal)
- **Backend:** Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **AI:** Claude Haiku 4.5 via Anthropic API, prompt caching enabled
- **Deployment:** GitHub Pages (static frontend) + Supabase (all backend)
- **Auth:** Supabase Auth (email/password) — single user, no public signup

### New Database Tables (additions to existing FlexAppeal schema)
```
supplement_logs       — id, user_id, supplement_name, dose, unit, taken_at, notes
supplement_types      — id, user_id, name, default_dose, unit, timing_note
water_logs            — id, user_id, amount_ml, logged_at
recovery_metrics      — id, user_id, date, hrv, sleep_score, body_battery, resting_hr, vo2max, training_load, source
subjective_checkins   — id, user_id, date, type (morning/evening), energy, mood, notes, workout_adherence, macro_adherence
soreness_logs         — id, user_id, date, muscle_group, soreness_level (0-3), notes
reading_log           — id, user_id, title, author, category, status, rating, started_at, finished_at, notes
study_log             — id, user_id, topic, duration_min, medium, notes, logged_at
skills                — id, user_id, name, category, level (1-5), last_practiced_at, notes
job_applications      — id, user_id, company, role, date_applied, status, notes, next_action, next_action_date
networking_log        — id, user_id, person_name, company, interaction_type, date, notes, follow_up_date
daily_briefs          — id, user_id, date, brief_json, generated_at, model_used, input_tokens, output_tokens
```

### Supabase Edge Functions (new)
```
garmin-sync           — runs nightly 2am, pulls Garmin Connect API, writes to recovery_metrics
health-webhook        — receives POST from Health Auto Export app, writes to recovery_metrics
generate-daily-brief  — runs 6am daily, assembles context, calls Claude Haiku, writes to daily_briefs
obsidian-sync         — called on-demand or nightly, writes structured logs to Obsidian vault via Git commit
```

### AI Context Assembly (for daily brief)
The `generate-daily-brief` function builds a compact context from:
- User profile: height, weight, goals, target role, current program
- Last 7 days: recovery metrics, soreness logs, workout logs, nutrition summary
- Last 30 days: weight trend, training load trend, job application activity
- Skills not practiced in >14 days
- Follow-ups overdue
- Morning check-in from today (if already submitted)

Prompt caching: the static profile + goals section is cached. Only the dynamic recent-data section is fresh each call.

Estimated cost: ~$0.003/day = ~$1/month.

### Second Brain Sync
- A Node.js script running on the local Mac (cron job or Supabase webhook trigger) pulls from Supabase and writes `.md` files into the Obsidian vault
- Scope: daily logs, finished books, job status changes, weekly summaries
- One-way: Supabase → Obsidian (Obsidian is the archive, not the source of truth for the app)

### GitHub Pages Deployment
- `npm run build:pages` → deploys static assets
- All API calls go to Supabase (no server needed)
- Auth via Supabase JWT stored in localStorage
- Supabase RLS policies ensure only the authenticated user can read/write their data

---

## Pages / Navigation (Mobile-First)

### Bottom Nav (5 tabs)
1. **Home** — Daily brief card, morning check-in, today's workout, quick log buttons
2. **Train** — Program schedule, log workout, PR tracker, training load chart
3. **Fuel** — Food log, supplement log, macro summary, water log
4. **Mind** — Reading log, study log, skills tracker
5. **Career** — Application pipeline, networking log, skill gaps

### Additional Pages (accessed from within tabs)
- Workout detail / exercise log
- Recovery detail (HRV chart, sleep chart, training load chart)
- Daily brief history
- Profile / settings (goals, Garmin OAuth, body stats)
- Obsidian sync status

---

## Design Principles
- Dark mode only (matches FlexAppeal: Cyber Charcoal #121212 + Volt Neon Green #CCFF00)
- Mobile-first — every interaction designed for one thumb on a phone
- Speed — logging a meal or a set should take < 15 seconds
- No clutter — each screen has one primary action
- Data visualization where it adds signal (charts for trends, not for decoration)

---

## Out of Scope (explicitly)
- Multi-user support
- Social features (FlexAppeal has these; PersonalOS strips them)
- Public profiles
- Gym white-labeling
- Anything requiring a persistent server (everything is Supabase Edge Functions or static)

---

## Open Questions (for mockup phase)
1. Home tab layout — daily brief card full-width vs. alongside quick stats?
2. Morning check-in — modal on app open vs. dedicated section on Home tab?
3. Soreness log — full body diagram picker vs. simple muscle group dropdown?
4. Mind tab — reading and study on same tab, or split?
5. Career tab — kanban board vs. list view for application pipeline?

---

## Success Metrics (personal)
- Logged workouts: >4x/week
- Daily brief reviewed: >5x/week
- Morning check-in completed: >5x/week
- Body weight trending toward goal
- Applications in pipeline: >3 active at any time
- Job landed: yes/no

---
