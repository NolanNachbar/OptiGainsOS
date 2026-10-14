# Design notes — not built, needs decisions (2026-10-13)

These three were flagged "design before building." No code has been written.

## 1. Offline logging queue
**Risk:** touches session persistence, the one area with a hard constraint
(`optigains-workout-active` must never be cleared by age/timeouts/queries).

Proposed shape:
- Queue only the *final save* (`workout_logs`/`workout_sessions` writes), never the
  in-progress session. In-progress state already lives in local storage and restores
  silently; the queue must not own or mutate it.
- Each queued item: client-generated idempotency key (reuse `photo_path`-style
  stable ids), payload, `created_at`, attempt count. Stored in IndexedDB, not
  localStorage (size, structured clone).
- Replay on `online` + app focus; server-side dedupe via the existing
  `workout_logs_no_exact_dupes` constraint (migration 20260910000000) so a replay
  after a lost response is a no-op.
- UI: a quiet "N workouts waiting to sync" row; never blocks starting the next
  workout; never discards on failure (retry forever, surface after N failures).
- Flag tests required *before* implementation: replay never touches
  `optigains-workout-active`; queued save + reload restores into logging mode;
  duplicate replay creates one row.

Open decision: should *food* logs also queue? (Same mechanism, lower risk.)

## 2. PST module (strength + running + swim scoring)
- Store standards as a **versioned, sourced, editable table**
  (`pst_standards`: event, sex, age band, level, min/max, `source`, `version`).
  Never hard-code constants (repo rule: don't invent thresholds).
- Sources disagree on minimums; the table must carry the source per row and the UI
  must show which standard set is active.
- `pst_tests` table already exists (RLS present); check live schema before adding
  columns.
- Needs from you: which standard set(s) to load first, and the event list.

## 3. Supersets
- Changes the logger's data model: exercises need a `group_id`/`superset_with`,
  rest timer semantics (rest after the *round*, not each set), and set ordering in
  the table.
- Engine impact: none if the group is presentation-only and per-exercise set rows
  are unchanged. Keep it that way: store grouping on the session/exercise, never on
  the set rows the engine reads.
- Recommend: group-id on exercise + "round" rest timer; no schema change to set
  rows. Build after the compact programmed logger lands (shares the same layout
  work).

## Also parked
- **TDEE reconciliation:** frontend uses fixed 500 kcal per lb/week without
  coverage weighting; engine's is coverage-weighted and bias-corrected. Decision
  needed: which is authoritative. Also confirm: at full headroom the cut target
  equals the macro floor, so adaptive TDEE does not move it — intended?
- **In-app weekly check-in** (depends on the TDEE decision; show logging coverage
  alongside the number). `send-weekly-checkin-reminder` has no cron in the repo.
- **Cron-only edge functions** (`generate-daily-brief`, `garmin-*`, `send-*`,
  `health-webhook`) accept unauthenticated calls with the public anon key.
  Requires a shared-secret header sent by pg_cron/workflows — a deploy-side change,
  not done here. `health-webhook` also fails open when its secret is unset.
