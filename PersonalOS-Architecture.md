---
type: architecture
project: PersonalOS
status: living-document
updated: 2026-06-02
phase: 4-ui-complete
---

# PersonalOS — Architecture Overview

## The Vision
A private, single-user "Human Performance OS" for optimizing physical, mental, and professional growth.

Three distinct layers:
- **Phone App** — capture everything, display everything. No AI runs here.
- **Supabase** — central data hub. All data lands here first.
- **Desktop Agent (this Mac)** — the brain. Pulls from Garmin, runs Claude, writes to Obsidian.

---

## Full Data Flow

```
YOU (Real World)
│
├── 🏋️ Lift / 🏃 Train / 🍽️ Eat / 📚 Study / 💼 Job Hunt
│
▼
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LAYER 1 — CAPTURE  (what you actively do on your phone)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
│
│  📱 Phone App (OptiGains PWA)        ⌚ Garmin Watch (passive)
│  ───────────────────────────         ────────────────────────
│  • Log sets, reps, weight            • Records sleep overnight
│  • Log RPE per set                   • Records HRV, body battery
│  • Morning check-in                  • Records resting HR, stress
│    (energy/mood/soreness)            • Records steps, cardio TSS
│  • Log food + supplements            • Does NOT need to be worn
│  • Capture inbox (quick notes)         during lifting
│  • Log water
│  • Log reading / study
│  • Update job pipeline
│
│  🍎 Apple Health (passive, phone)
│  ─────────────────────────────────
│  • Syncs weight (if Apple Watch)
│  • Sleep duration fallback
│  • Resting HR fallback
│  • Steps fallback
│
▼
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LAYER 2 — STORAGE  (all data lives here)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
│
│  SUPABASE (PostgreSQL + Auth + Storage)
│  ──────────────────────────────────────────────────────
│
│  Written by phone app (via JS client + anon key + RLS):
│  • workout_logs          • food_entries
│  • daily_readiness       • supplement_logs / water_logs
│  • capture_inbox         • reading_log / study_log
│  • job_applications      • networking_log
│  • body_weight_entries   • progress_photos (Storage bucket)
│  • measurements          • skills / todos
│
│  Written by Desktop Agent (via service key, bypasses RLS):
│  • recovery_metrics      ← Garmin scraper pushes here nightly (2am)
│  • recovery_metrics      ← Apple Health webhook pushes here (on sync)
│  • daily_briefs          ← AI brief generator writes here (6am)
│
│  Edge Functions (serverless, always on):
│  • health-webhook        ← receives POST from Apple Health Auto Export
│  • usda-proxy            ← food search API passthrough
│  • strava-token          ← Strava OAuth refresh
│
▼
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LAYER 3 — INTELLIGENCE  (runs on this Mac, ~6am daily)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
│
│  ~/scripts/ — cron jobs on this Mac
│  ──────────────────────────────────
│
│  2:00am — garmin_sync.py
│  │  1. Logs into Garmin Connect (garminconnect library)
│  │  2. Pulls: sleep score, body battery, resting HR,
│  │           HRV, stress, steps for yesterday
│  │  3. Upserts into Supabase recovery_metrics
│  │  (Garmin creds stay local — never touch the cloud)
│  │
│  6:00am — generate_brief.py  [PLANNED]
│  │  1. Reads last 7 days from Supabase:
│  │       recovery_metrics, workout_logs, daily_readiness,
│  │       food_entries, capture_inbox
│  │  2. Reads goal context from Obsidian vault:
│  │       HOME.md, PersonalOS-PRD.md, active project MOCs
│  │  3. Calls Claude API (Haiku, ~$0.003/day)
│  │  4. Writes brief_json to Supabase daily_briefs
│  │  → Phone reads this and displays the coaching cards
│  │
│  11:00pm — personal-os-sync.js  [LIVE]
│     1. Reads from Supabase: workout_logs, food_entries,
│        body_weight_entries, daily_readiness, cardio_sessions
│     2. Writes/appends to ~/Claude/BBrain/50-Daily/YYYY-MM-DD.md
│     3. Preserves any existing vault content in that note
│
▼
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LAYER 4 — SECOND BRAIN  (archive + AI context)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ~/Claude/BBrain/ (Obsidian vault)
  ─────────────────────────────────────────────────────
  What gets written here (by Desktop Agent, one-way):

  50-Daily/YYYY-MM-DD.md
    ← workout log (exercises, sets, weight)
    ← nutrition summary (calories, macros)
    ← body weight
    ← morning check-in (energy, mood, soreness)
    [planned] ← AI brief summary

  10-Projects/Job-Search/pipeline-log.md
    ← [planned] job application status changes appended

  30-Resources/Reading/[Book Title].md
    ← [planned] written when book marked finished in app

  10-Projects/PersonalOS/weekly-summary.md
    ← [planned] overwrites every Sunday

  What the AI brief reads FROM here (generate_brief.py):
    → HOME.md                   (current priorities)
    → PersonalOS-PRD.md         (goals, constraints)
    → 10-Projects/*/MOC files   (active project context)

  Result: the daily brief "knows" what you're building,
  what you're chasing, and what tradeoffs you've made —
  not just your biometrics.
```

---

## What the Phone App Does

The app is purely a **capture + display** interface. It never calls Claude. It never talks to Garmin.

| Tab | What you do | What gets stored |
|---|---|---|
| **Home** | View daily brief, complete morning check-in, see today's workout | Reads `daily_briefs`, writes `daily_readiness` |
| **Train** | Log sets/reps/weight, view program, track PRs | Writes `workout_logs`, reads `programs`/`workout_schedules` |
| **Fuel** | Log food, supplements, water, body weight | Writes `food_entries`, `supplement_logs`, `water_logs`, `body_weight_entries` |
| **Mind** | Capture notes, log reading/study, update skills | Writes `capture_inbox`, `reading_log`, `study_log`, `skills` |
| **Career** | Move job apps through pipeline, log networking | Writes `job_applications`, `networking_log` |
| **Recovery** | View HRV, sleep, body battery charts | Reads `recovery_metrics` (written by Garmin script) |
| **Progress** | View weight trend, log measurements, upload photos | Reads `body_weight_entries`, writes `measurements`/`progress_photos` |

**The app reads `daily_briefs` but never generates them.** The brief is already in Supabase by the time you wake up.

---

## What Claude Code on This Mac Does

Claude Code (this desktop session) has three roles in the system:

**1. Build + maintain the app**
- Edit source code in `/home/nolan/projects/OptiGains/`
- Build new features, fix bugs, write migrations

**2. Run and maintain the Desktop Agent scripts**
- `~/scripts/garmin_sync.py` — Garmin → Supabase (live, cron 2am)
- `~/scripts/personal-os-sync.js` — Supabase → Obsidian (live, cron 11pm)
- `~/scripts/generate_brief.py` — Claude brief generator (planned)
- Claude Code can iterate on these scripts, debug them, and extend them

**3. Interact with the second brain**
- Read your Obsidian vault for context before answering questions
- Write architecture docs, PRDs, roadmaps directly into the vault
- Update project MOCs when decisions are made

Claude Code does **not** run automatically — it only acts when you open a session and give it a task.

---

## Intelligence Logic

### Dynamic Capacity (Live in App)
Calculates recommended session duration before you step into the gym:
- **Baseline:** `max_daily_training_hours` from `user_profiles` (default 2.0h)
- **Modifiers:** HRV trend × ACWR × readiness score (body battery + sleep + subjective energy)
- **Output:** "Suggested for today: X min" banner on Dashboard
- **Code:** `src/utils/recoveryUtils.js → calculateTrainingCapacity()`

### AI Daily Brief (Desktop Agent → Supabase → App)
Generated once per day at 6am. App just reads it.
```json
{
  "performance": "Training recommendation + rationale",
  "endurance":   "Swim/bike/run guidance, race countdown",
  "nutrition":   "Macro note or adjustment",
  "body_comp":   "Weight trend + progress note",
  "learning":    "What to study or read today",
  "career":      "Pipeline action or follow-up",
  "insight":     "One pattern noticed across all data",
  "today_actions": ["Specific thing 1", "Specific thing 2"]
}
```
`today_actions` seeds the `todos` table. You check them off during the day.

### Adaptive Programming (Planned — needs 2–3 weeks of data first)
Once RPE logging (Phase 1) and recovery data (Phase 3) have 2–3 weeks of history:
- Brief will adjust volume/intensity recommendations week to week
- Heavy recovery days → brief prescribes deload or cardio-only
- Ironman phase → brief balances lifting volume against triathlon TSS
- The program itself stays in the app; the brief is the adaptive layer on top

---

## Cron Schedule (This Mac)

| Time | Script | Status |
|---|---|---|
| 2:00am | `garmin_sync.py` | ✅ Live |
| 6:00am | `generate_brief.py` | 🔲 Planned |
| 11:00pm | `personal-os-sync.js` | ✅ Live |

Check logs: `tail -f ~/scripts/sync.log`

---

## Database Schema

### Core Tables
| Table | Written by | Read by |
|---|---|---|
| `workout_logs` | Phone app | App + Desktop Agent (brief context) |
| `food_entries` | Phone app | App + Desktop Agent |
| `daily_readiness` | Phone app | App + Desktop Agent |
| `capture_inbox` | Phone app | Desktop Agent (parses → Obsidian) |
| `recovery_metrics` | Desktop Agent (Garmin script) | App (Recovery page) |
| `daily_briefs` | Desktop Agent (brief generator) | App (Dashboard, BriefHistory) |
| `todos` | App (seeded from brief) + manual | App (Dashboard TodayActions) |
| `job_applications` | Phone app | App (Career tab) |
| `reading_log` | Phone app | App (Mind tab) |
| `study_log` | Phone app | App (Mind tab) |
| `skills` | Phone app | App (Mind tab) + Desktop Agent |
| `supplement_logs` | Phone app | App (Fuel tab) |
| `water_logs` | Phone app | App (Fuel tab) |
| `body_weight_entries` | Phone app | App (Progress tab) |
| `progress_photos` | Phone app | App (Progress tab) |
| `measurements` | Phone app | App (Progress tab) |

### Schema Conventions
- All tables: `created_by uuid REFERENCES auth.users`, RLS enabled
- Policy: `FOR ALL USING (auth.uid() = created_by)`
- Desktop Agent uses service key → bypasses RLS → can write without a user session

---

## Security
- **Garmin credentials** — local `.env` only, never in Supabase or git
- **Service key** — local `.env` only, never in the frontend app
- **Frontend** — anon key only, all reads/writes gated by RLS
- **No public signup** — single account, auth locked

---

*See also: [[PersonalOS-PRD]] · [[PersonalOS-Roadmap]]*
