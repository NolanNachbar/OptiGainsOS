# train-logger area map — round 1

Routes: `/train` (Train.jsx — tab shell), `/workout-detail` (WorkoutDetail.jsx,
1686 lines — the main logger), `/quick-workout` (QuickWorkout.jsx, 823 lines),
`/create-workout` (CreateWorkout.jsx, 771 lines — template builder, not a
logging surface but routed through this area).

Tables touched by this area: `workout_sessions` (in-progress logging state),
`workout_logs` (finished logs — the record of truth), `workout_schedules`
(today's completion flag), `workouts` (saved/library templates),
`program_workouts` (program day templates, read-only from here),
`program_enrollments` (progression_state read/write on swap + finish),
`exercise_reactions` / `exercise_shot_notes` (like + per-exercise shot notes,
peripheral).

## /train (Train.jsx) — tab shell, entry point for Schedule/Library/Programs/Activity

1 tap from app open (bottom nav "Train"). Renders `<SubTabs>` and switches
between `WeeklySchedule`, `Workouts` (library/programs/activity-log) by
`?tab=` URL param. The tab IS the URL param, so deep links resolve correctly;
legacy `activity-log` param aliased to `activity`.

- **Schedule tab** (default, 0 extra taps): `WeeklySchedule.jsx` — today/weekly
  plan, links into WorkoutDetail per day. Default tab, so this is what >90% of
  `/train` opens land on.
- **Library tab** (1 tap): saved workout templates (`workouts` table).
- **Programs tab** (1 tap): active/available programs (`programs` +
  `program_workouts`).
- **Activity tab** (1 tap): workout history (`workout_logs`).

**Known lead — Supabase 403 on `program_workouts` at /train load:**
`useEnrollments()` in `src/hooks/useProgramQueries.js:65-68` queries
`program_workouts` directly via raw `supabase.from('program_workouts').select('*').in('program_id', programIds)` —
no `created_by` filter, and (unlike the `db.entities.ProgramWorkout` wrapper)
bypasses whatever the entity layer does. This hook backs the Schedule tab
(default landing tab), so most `/train` opens with an active program
enrollment fire this query. A `403` (not an empty `200`) from PostgREST
usually means a missing table-level GRANT for the anon/authenticated role
(RLS row-filtering alone yields `200` + `[]`, not `403`), which would explain
why it's a hard error and not silently-empty data. Included as a lead case
(`train-logger-r1-15`) rather than a confirmed bug — verify against actual
network response code before reporting.

## /workout-detail (WorkoutDetail.jsx) — the core logger

Reached from: Schedule tab → tap a day (2 taps from app open), or Library tab
→ tap a workout (2 taps), or a program day card. Also the target of
`source=program&enrollmentId&programWorkoutId` URL params (program mode) vs a
bare `?id=` (library workout) vs no params at all (resolves today's scheduled
workout, or falls back to most recent).

Highest-usage screen in the area: `workout_sessions` 137 total / 81 last 90d,
`workout_logs` 110/50, `program_workouts` 135/96 (program-sourced sessions
dominate).

Controls/features, in on-screen order:
- **Start Session** button — creates a `workout_sessions` row
  (`status: in_progress`), seeds `exerciseLogs` from program prescription (today
  only) or last-performance autofill (Epley e1RM scaling, `scaleWeightToReps`,
  WorkoutDetail.jsx:97-103).
- **Resume/Start Fresh dialog** — offered when an in-progress session for this
  workout is found and is >24h old (`STALE_SESSION_MS`, workoutSessionFlag.js).
  Under 24h old: silently restores into logging mode, no dialog (hard
  constraint from CLAUDE.md — verified in code, WorkoutDetail.jsx:325-337).
- **Per-set inputs** (ExerciseCard.jsx): weight (`type=number`, `max="2000"`
  HTML attribute only — **not enforced in the onChange handler**,
  ExerciseCard.jsx:599-625), reps/hold-seconds (`max="500"`/`"3600"`, same gap),
  RIR (`max="10"`, same gap), a completed-checkbox.
- **Add set** / **Remove set** per exercise.
- **Add exercise** (AddExerciseForm) / **Remove exercise** (Trash2 icon,
  ExerciseCard.jsx:430) / **Replace/swap exercise** (menu → dialog,
  ExerciseCard.jsx:399-408, 790-831) — carries forward already-completed sets,
  seeds remaining sets from the replacement's own history.
- **Drag-to-reorder exercises** (dnd-kit, 8px activation distance).
- **Rest timer** — absolute end-timestamp based, handed to the service worker
  for background/locked-phone firing (`postRest`, WorkoutDetail.jsx:689-742).
  Skip / +time controls in the sticky logging header.
- **Top-set → back-off cascade** — completing a "(Top Set)" set recomputes the
  matching "(Back-off)" exercise's uncompleted sets from the actual e1RM lifted
  (WorkoutDetail.jsx:946-979). Guards on `!weight || !reps` before computing.
- **Finish** (sticky header) → incomplete-sets prompt if any set unchecked →
  post-workout notes dialog → `saveWorkoutLogMutation`. Button disabled while
  `isPending || isSuccess` (WorkoutDetail.jsx:1195, dialog confirm
  WorkoutDetail.jsx:453) — guards the obvious double-tap.
- **Cancel** (sticky header) — `cancelSession()`, discards local state,
  marks the `workout_sessions` row `cancelled`.
- **Equipment profile toggle** — swaps blocked movements (e.g. rack squat →
  Zercher on a "Casper" equipment day) live mid-session, renaming exercises in
  place without discarding completed sets (WorkoutDetail.jsx:346-362).
- **Auto-save** — every `exerciseLogs`/`preWorkoutNotes` change fire-and-forget
  writes to `workout_sessions` (`useWorkoutSession.saveProgress`), mirrored to
  `localStorage` first (`saveDraft`) so an offline write still survives a tab
  kill; `online` event replays the last failed write.
- **Stale-session auto-finish** — silent >3h since last set logged (not since
  start) and <24h old: writes the `workout_logs` row from the session on next
  mount, then closes the session (log-first, status-second, so a crash between
  the two never loses the row — `buildWorkoutLogFromSession.js`).

## /quick-workout (QuickWorkout.jsx) — freeform / prescribed-session logging

Reached from: bottom nav / dashboard "Quick Workout" action (1-2 taps from
app open depending on entry point), or "Log this session" from the engine's
PrescribedSessionCard (passes `location.state.prescribedSession`).

- **Always creates a `workout_sessions` row on mount** if none is found —
  including on the empty canvas, before any exercise is added
  (QuickWorkout.jsx:250-286, `createSession({ exercises: prescribedInitial,
  startTime })` unconditionally in the `else` branch). Navigating here and
  leaving without adding anything still leaves an `in_progress` row with
  `exercises: []`.
- **Empty-canvas quick-start** — recent-lifts one-tap re-add list (last 6
  distinct exercise names from `workout_logs`, most-recent-first).
- **Pre-session insight chip** (coaching phase 2+) — accept/dismiss a
  suggested starting weight.
- Same per-set inputs, add/remove set, add/remove/replace exercise, drag
  reorder, rest timer as WorkoutDetail (shared `ExerciseCard`,
  `useWorkoutExercises`).
- **Session notes** textarea (PRE:/POST: tags feed `notes_parser.py`).
- **Finish** → creates `workouts` (ad-hoc template) + `workout_schedules` +
  `workout_logs` rows in one mutation (QuickWorkout.jsx:351-384). Guarded
  against empty (`exercises.length === 0` → toast, no save) and double-submit
  (`isPending || isSuccess` check inside `handleSave` itself, not just the
  button's `disabled`).
- **Resume/Start Fresh dialog** — same 24h staleness rule as WorkoutDetail.
  "Start Fresh" (`handleDismissResume`) cancels the found session and
  immediately opens a brand-new empty one.

## /create-workout (CreateWorkout.jsx) — template builder, not a logging surface

Reached from: Library tab → "New Workout" / "Edit" on an existing template (2
taps), or "Clone" from WorkoutDetail (`cloneWorkoutMutation`,
WorkoutDetail.jsx:745-766). Lower usage — feeds `workouts` (no direct usage
count in usage.json; inferred from `workout_schedules`/`program_workouts`
volume that these templates are logged against).

- Title (required), description (collapsed by default), focus, duration.
- Exercises list: add exercise, add "repeat block" (interval-style structure
  with nested steps), remove exercise/block/step, per-field editing.
- **Save** — case-insensitive duplicate-title check against all of the user's
  workouts (`w.title.toLowerCase() === workoutData.title.toLowerCase()`,
  CreateWorkout.jsx:229-234), excluded by `editId` only. Blocks save with a
  toast on collision — no silent overwrite.
- Edit mode (`?edit=<id>`) loads and patches an existing `workouts` row in
  place.

---

## UX candidates (ideas only, not built)

- **Weight/reps/RIR ceilings are cosmetic, not enforced.** `max` is an HTML
  attribute; none of the three `onChange` handlers in ExerciseCard.jsx clamp
  or reject the parsed value. A fat-fingered `1710` for `171` is exactly the
  slip the code comment says the ceiling exists to catch, and it doesn't.
  Cheap fix: clamp in the handler (or on blur) instead of trusting the
  attribute. High-usage screen (top-set/back-off cascade multiplies the error
  downstream too).
- **Empty-session "Resume?" is confusing.** Visiting `/quick-workout` and
  leaving immediately (no exercise added) still creates an `in_progress` row.
  A day later, opening Quick Workout again offers "Resume" a session that
  has nothing in it. Either skip session creation until the first exercise is
  added, or skip the Resume dialog when `exercises` is empty and just start
  fresh silently.
- **Finish-time log_date vs auto-finish log_date can disagree for the same
  physical workout.** Manual Finish stamps `log_date` with "today" at the
  moment the mutation fires (`getTodayString(profile?.timezone)` — the
  current instant); the stale-session auto-finisher stamps it with the day the
  *session started* (`localDateOf(startedAt, timezone)`,
  buildWorkoutLogFromSession.js). A workout begun at 11:50pm and closed by
  hand at 12:10am logs to the new day; the identical workout closed instead by
  the 24h-later auto-finisher logs to the day before. Same event, two
  possible dates depending only on which code path closes it. Worth a
  decision on which is "right" and making both paths agree.
- **The library tab and the program day cards are the only routes into
  WorkoutDetail** — Quick Workout is a fully separate flow one level up in the
  nav, not offered as a fallback when a library/program workout link 404s
  (`workoutNotFound`). The dead-end screen only offers "Back to Workouts."
  Given `workout_logs` skews heavily toward program-sourced sessions (135
  `program_workouts` rows / 96 last 90d vs the smaller ad-hoc slice), a
  "Log a quick workout instead" escape hatch on that dead end would match
  actual usage patterns.
- **Rest timer's "Add time" / "Skip" controls are buried in the sticky header**
  (`WorkoutLoggingHeader.jsx`) behind whatever collapse state that component
  uses — not confirmed a problem, flagging for the UX pass to check tap-target
  size/reachability given the rest timer fires on essentially every set.
