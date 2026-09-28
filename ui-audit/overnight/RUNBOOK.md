# Overnight audit runbook (2026-09-27 → 28)

The orchestrator (main Claude session) follows this file. Subagents get the
prompt templates below. **Resume rule:** after any crash, compaction or usage
stop, read `state.json` and continue from the recorded area/round/step. Never
redo a step whose output file already exists.

## Goal
The app works as well as possible on Nolan's iPhone 13 Pro Max home-screen app.
1. Find + fix bugs: crashes, blank screens, broken flows, console/HTTP errors,
   lost data, bad edge-case handling, bad engine output.
2. Small within-screen UX moves: most used up, rare down, buried features
   surfaced, fewer taps.

Out of scope: visual restyle (fonts/colors/dock look), new features (→ wish
list), engine/science spec changes, AUDIT_2026-07-30.md "held back" items,
anything in KNOWN_NON_ISSUES.md.

## Ground rules (every agent)
- Branch `overnight-audit-2026-09-27` in /home/nolan/projects/OptiGains. Never
  push, merge, deploy, or switch branches. Commit each fix separately, plain
  message, **no Co-Authored-By / "Generated with" lines**.
- App: Vite on http://localhost:5173 (already running; don't start another).
  Data: the hosted Supabase as the test athlete via `?bypass_auth=true`. Writing
  test-account rows is allowed. **Never** use SUPABASE_SERVICE_ROLE_KEY or
  USER_ID from .env, never touch Nolan's real rows, never run schema migrations
  on hosted (write the migration file + list it in the report instead).
- Drive the app ONLY through `ui-audit/overnight/drive.mjs` (iPhone layer:
  keyboards, pickers, safe areas, iOS viewport quirks). Scripts go in
  `ui-audit/overnight/areas/<area>/scripts/`. Playwright clock API
  (`page.clock`) for time cases, `context.setOffline` for network, `page.reload`
  for interruptions.
- Screenshots: save via `snap()`, and only Read them after
  `convert x.png -resize x520 x-s.png`. Prefer DOM text/`controls()` to images.
- Usage frequency: `ui-audit/overnight/usage.json` (Nolan's real row counts:
  total / last 90 days). Don't query hosted usage yourself.
- Write every result to disk as you go (JSON/MD under `areas/<area>/`).

## Areas (in order)
| id | routes | notes |
|---|---|---|
| train-logger | /train, /workout-detail, /quick-workout, /create-workout | DRY RUN area |
| train-programs | /program-builder, /program/:id, /weekly-schedule, /train?tab=library | program save needs migration 20260928000000 on hosted (not applied): expect PGRST204 `notes` until then, note it, don't re-report |
| fuel | /fuel, /food-tracker (meals, week plan, recipes, templates) | highest real usage |
| body | /fuel?tab=body (weigh-in, supplements, water), /physique, /recovery | |
| today | /today, /coach, /mind, /athlete-state, /brief-history (todos live here?) | todos = 2nd highest usage |
| analyze | /insights, progress tab, /career | |
| profile-auth | /profile, /login, /forgot-password, /reset-password | don't change the test account's password or email |

Per area: rounds until **two clean rounds in a row** (no new confirmed crash /
data-loss / bad-engine / broken-flow bug) or **3 rounds max**. UX pass once per
area, after its first round.

## Steps per round (orchestrator)
State file `state.json`: `{ area, round, step, cleanStreak, done: [areas], log: [...] }`.
Update it after every step.

1. **map** (round 1 only) — 1 agent, `sonnet`. Output `areas/<a>/map.md`.
2. **cases** — 1 agent, `sonnet`. Output `areas/<a>/cases-r<N>.json`
   (12–18 cases; round ≥2 must not repeat earlier cases and should dig where
   earlier rounds found bugs).
3. **attack** — 2–3 agents in parallel, `sonnet`, each a slice of cases.
   Output `areas/<a>/findings-r<N>-<k>.json`.
4. **verify** — 1 agent, `opus` (fall back to `sonnet` if opus is unavailable).
   Re-runs each finding's repro script itself, reads the code, rejects
   non-bugs. Output `areas/<a>/verified-r<N>.json`.
5. **fix** — 1 agent, `sonnet`, serially (fixers share the working tree).
   Fix confirmed bugs, one commit each, each with a regression test in
   `e2e/<area>-<slug>.spec.mjs`. Output `areas/<a>/fixed-r<N>.json`.
6. **review** — 1 agent, `opus`. Reviews each fix commit's diff + runs
   `npm run test:e2e` and `npm run build`. A bad fix is reverted with
   `git revert` (not reset) and moved to unfixed. Output `areas/<a>/review-r<N>.json`.
7. **ux** (after round 1) — 1 agent `sonnet` makes the moves, then the review
   step (6) covers them too. Output `areas/<a>/ux.json`.
Round is clean if verify confirmed 0 bugs of severity crash/data-loss/broken-flow/engine.

The orchestrator itself only reads the small JSON outputs and decides the
next step; bulk reading and driving stays in subagents.

## Finding schema (attack/verify/fix)
```json
{ "id": "train-logger-r1-03", "title": "...", "severity": "crash|data-loss|broken-flow|engine|error-msg|no-undo|ios|minor",
  "route": "/workout-detail", "steps": "...", "expected": "...", "actual": "...",
  "repro": "ui-audit/overnight/areas/train-logger/scripts/r1-03.mjs",
  "evidence": "console/http/DB/screenshot paths", "suspectFile": "src/..." }
```
verify adds `"verdict": "confirmed|rejected|cannot-repro", "why": "..."`.
fix adds `"commit": "<sha>", "test": "e2e/...spec.mjs", "status": "fixed|unfixed", "note": "..."`.

## Judge rules
Entered data is never lost (reload, background, offline, double tap). No crash
or blank screen. Errors say what happened and how to fix it. Mistakes can be
undone (deleted set, wrong entry). Weird input doesn't give nonsense engine
output (run the Python engine locally where relevant). iPhone-layer warnings
(field hidden by keyboard, wrong keypad) count as `ios` bugs.

## Persona situations to generate cases from
Mid-set sweaty thumbs (double taps, 1710 for 171, wrong set deleted, Done
early) · interrupted (lock/background, reload mid-workout, offline at gym) ·
time (past midnight, finished next day, timezone travel, DST, backfill) ·
off-script (2 weeks off, skipped/swapped session, all swapped, abandoned
halfway) · extreme data (0 reps, 1000 lb, 40 sets, huge notes, food with no
macros). Also real anomalies seen before: abandoned sessions with 53 unlogged
sets, duplicate rows.

## Wish list
Every agent appends to `areas/<a>/wishes.json`: moments it had to do mental
math, guess what to enter, leave the app, had nowhere to record something, or
repeated steps. `{ "idea", "moment", "howOften" }`. Ideas only, never built.
Seed: suggest a start weight when swapping to a dumbbell variant (learned from
logs); tag a set as tempo/controlled vs all-out so tempo sets don't read as
strength loss.

## Morning report `OVERNIGHT_REPORT_2026-09-28.md` (repo root)
Bugs fixed (one line each: commit + test) · UX moves (what/where/why +
before/after screenshot paths) · proposals needing Nolan's call (structural UX,
real data, spec, hosted migrations) · unfixed/unconfirmed findings · wish list by
area · run stats (areas, rounds, skipped/failed, anything cut for usage).
Write it incrementally: update it at the end of every area, so a stop mid-night
still leaves a useful report.
