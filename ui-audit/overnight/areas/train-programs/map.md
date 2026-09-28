# Train / Programs map — round 1

Two coexisting program models share the `programs`/`program_enrollments`/
`program_workouts` tables:

- **v2 builder model** (`ProgramBuilder.jsx`, `schema_version: 2`, `day_index`):
  user hand-builds a cycle in the wizard. `programs` total **2** rows ever, **0**
  in the last 90 days (usage.json) — this whole wizard flow is barely touched.
- **v1/engine model** (`scheduled_date`, `locked`, `override_source`, driven by
  a Python engine + `replan-day` edge fn / cron `generate_weekly_program.py`):
  `program_workouts` **135 total / 96 last 90d** — this is the heavily-used
  table, and it's populated mostly through the engine + the override/template
  swap UI on `/weekly-schedule`, not through `/program-builder`. Read/verify
  weight should lean toward `/weekly-schedule` and the per-day override, not
  the wizard.

Known, don't re-report: migration `20260928000000_program_workouts_notes.sql`
(adds `program_workouts.notes`) is unapplied on hosted → every `ProgramWorkout`
insert that sends a `notes` field 400s with PGRST204. `ProgramBuilder.jsx`
always sends `notes: w.notes || null` (`:429`), so **every** create/update of a
v2 program hits this right now.

## Screens

### `/program-builder` (`src/pages/ProgramBuilder.jsx`, 1583 lines)
4-step wizard (Details → Cycle Days → Progression → Confirm). Real controls:
"Assign workout" drag-and-drop onto a day cell from `WorkoutLibrarySidebar`
(`DndContext`/`pointerWithin`), inline day editor (`handleCellClick` toggles
`editingDay`), per-exercise fields (sets/rep_target/rir_target/rest_seconds,
`makeEmptyExercise` `:63-72`), progression preview (`projectProgression`),
Import `.json` (button → `parseProgramJson`), final "Create Program" / "Save
Changes" button → `handleSubmit` (`:424-471`).

- **Mutations**: `useCreateProgram` / `useUpdateProgram`
  (`src/hooks/useProgramQueries.js:115-181`) — both go through
  `db.entities.Program.*` + a per-day loop of `db.entities.ProgramWorkout.create`.
- **Risky path (file:line, confirmed by code read, not yet run)**:
  `useUpdateProgram` (`useProgramQueries.js:146-170`) deletes **every** existing
  `ProgramWorkout` row for the program (`:151-154`) *before* looping
  `ProgramWorkout.create` for the new set (`:155-161`) — no transaction, no
  rollback. Combined with the `notes` 400 above, **editing any existing v2
  program right now deletes all its days and then fails on the first
  re-create**, leaving the program with zero workouts and only a generic
  "Failed to update program" toast (`ProgramBuilder.jsx:459`) — worse than the
  known create-time PGRST204, this is silent data loss on edit, not just a
  failed create. Independent of the migration, the same delete-then-recreate
  shape (no lock) is the same class of bug already confirmed in fuel's
  `WeeklyPlanCard` approve flow — a double-tap Save could interleave two
  delete/create passes.
- Import: `parseProgramJson` (`src/utils/programIO.js:76-141`) clamps
  `cycle_length`/`num_cycles` (1–30 / 1–20) and string-length-caps most fields,
  but exercise `name` has **no non-empty check** (`:105`, defaults to `""`) and
  `sets`/`rest_seconds` have no upper bound — a crafted or corrupted file can
  import a blank-named exercise or absurd set/rest values straight through.
- Cardio-vs-strength source drop: `isCardioSource` branch (`:388-411`) — a
  cardio/HIIT library workout dropped onto a day populates `cardio_sessions`,
  a strength one populates `exercises`; verified this is handled (not a bug),
  but worth confirming a **mixed** library workout (has both) doesn't get
  silently truncated to one branch.
- Submit filters out empty days as "rest days" (`:427`) — a day the user
  emptied out on purpose (removed all exercises to make it a rest day) saves
  correctly as absent from `workouts`, but there's no way to tell "I meant to
  leave this blank" from "I haven't built this day yet" in the UI state.

### `/program/:id` (`src/pages/ProgramDetail.jsx`, 849 lines)
Controls: Enroll (opens `showEnrollDialog` w/ per-exercise starting-weight
inputs + start date), Pause/Resume (`handlePause`/`handleResume`), Restart
(`ConfirmDialog` → `confirmRestart`), Delete program (`ConfirmDialog` →
`confirmDelete`), Export `.json` (`exportProgramAsJson`), Share.

- **Mutations**: `useEnrollInProgram`, `useUpdateEnrollmentStatus`,
  `useDeleteProgram`, `useDeleteEnrollment` (all in `useProgramQueries.js`).
- `useDeleteEnrollment` (`:398-409`) doesn't actually delete — comment at
  `:402-403` explains `program_enrollments_status_check` rejects `"cancelled"`,
  so "Restart"/"cancel" just sets `status: "completed"`. Re-enrolling
  (`useEnrollInProgram:224-234`) finds that row by `created_by`+`program_id`
  (any status) and overwrites `progression_state` etc. — confirmed correct for
  the simple case; not yet checked against restarting mid-way through an
  in-flight `/workout-detail` session logging against the same enrollment
  (stale `enrollment` object captured in that page's closure).
- `useDeleteProgram` (`:172-181`) is a bare `Program.delete(id)` — no check of
  FK cascade behavior on `program_workouts`/`program_enrollments` rows, and no
  guard against deleting a program the user is currently actively enrolled
  in/mid-workout on.
- "Program not found" dead-end (`:122-137`) only offers "Back to Workouts",
  same shape as the train-logger wish-listed workout-detail dead-end.

### `/weekly-schedule` (`src/pages/WeeklySchedule.jsx`, 869 lines) — highest real usage
Calendar view built from `getProgramSchedule` (`src/utils/programSchedule.js`)
over `useEnrollments()`. Duration/pill rendering already has guards for
implausible `duration_seconds` (`:18-35`, 5–240 min plausible window, grounded
— not a bug). Hosts `WeekTemplateSwap` (below) for the current week.

- `useEnrollments()` (`useProgramQueries.js:50-90`) issues two un-scoped-by-day
  `supabase.from(...).in('program_id', programIds)` reads (`:60-68`) — RLS
  (`"user owns program workouts" ... USING created_by = auth.uid()`,
  `supabase/migrations/00000000000000_remote_schema.sql:2062`) is the only
  thing preventing cross-user leakage here; there's no app-level filter. Ties
  to the open **train-logger lead**: an intermittent `program_workouts
  ...access control checks` pageerror was seen once on `/workout-detail`
  (verified-r1.json `train-logger-r1-10`, side note) — this page hits the same
  table shape (`.in('program_id', ...)`) on every load, so it's a plausible
  second surface for the same intermittent failure.

### `WeekTemplateSwap` (`src/components/program/WeekTemplateSwap.jsx`, on `/weekly-schedule`)
"Run one of my saved library folders this week instead of the engine's plan."
Real controls: folder picker dialog, "Use engine plan" (clear) button,
apply button. Backed by `src/hooks/useWeekTemplate.js` — **not yet read this
round**; `apply.mutate({ plan, folder })` / `clear.mutate({ rows, touched })`
(`WeekTemplateSwap.jsx:74-79`) write to `program_workouts` rows keyed by
`scheduled_date`, skipping dates already in `touched` (logged or session
started, computed `:36-45`) — the touched-date guard is the main
data-safety mechanism here and is worth attacking directly (race: log a
workout for today, then apply a template for the current week in the same
tick — does the touched-set snapshot from page load win a stale race against
the just-logged day?).
- `activeTemplate` label derivation (`:64-67`) reads `override_source` prefix
  off whichever row happens to match first — cosmetic only, not a data risk.

### Per-day override (`useOverrideProgramWorkout`, `src/hooks/useOverrideProgramWorkout.js`)
"Swap today's programmed workout for one I picked" (component:
`OverrideProgramWorkout.jsx`, entry point not yet located this round — likely
`/today` or `/weekly-schedule` day-cell menu). Two-step: (1) PATCH
`program_workouts` row with `locked: true` + `override_source` (`:27-39`), (2)
best-effort `supabase.functions.invoke("replan-day")` (`:43-53`, failure is
swallowed — comment says "override is already saved" and week reflows on next
cron). The `locked` flag is load-bearing: it's what stops the engine's cron
from clobbering the override on its next run. **Risky path**: if step 1
succeeds but the page navigates away/reloads before step 2's promise settles,
that's fine (best-effort by design) — but there is no visible confirmation
that the override *itself* (step 1) succeeded before the UI likely
optimistically shows the swap; not yet confirmed whether the calling
component blocks on `mutate` before updating its own view.

### `/train?tab=library` (`Train.jsx:9,34` → renders `Workouts.jsx` with
`defaultTab="library"`, `src/pages/Workouts.jsx`)
Library of reusable workout templates (`Workout` entity), separate from
`program_workouts`. Controls: clone (`cloneWorkoutMutation:101-127`), delete
(`deleteWorkoutMutation:129-157`), rename folder
(`renameFolderMutation:159-...`), import `.json`, drag onto a
`ProgramBuilder` day cell (cross-screen use).

- **Risky path**: `deleteWorkoutMutation` (`:129-144`) nulls out
  `WorkoutLog.workout_id` and deletes `WorkoutSchedule` rows that reference the
  workout, but does **not** touch any `program_workouts.source_workout_id`
  that points at it (set at drop-time, `ProgramBuilder.jsx:~410/436`) — deleting
  a library workout after it's been used to populate a program day leaves a
  dangling FK-less reference. Low blast radius (program_workouts stores its own
  denormalized exercise copy, so nothing visibly breaks), but worth one
  confirm/reject pass rather than assuming.
- Delete confirm dialog text (`:706`) correctly warns "cannot be undone" and
  lists both scheduled-workout and library removal — better UX than fuel's
  food-entry delete (no confirm at all).

## Cross-cutting risk found across all four screens
Delete-then-recreate with no lock (v2 update), a background best-effort write
whose failure is swallowed by design (per-day override), and an unscoped `.in()`
read relying entirely on RLS with no app-level ownership filter (weekly
schedule / enrollments) are the three real risk shapes here — same family as
fuel's `WeeklyPlanCard` approve-week bug, not new failure modes, just three
more instances of it.

## UX candidates (for `ux.json`, not built this round)
- Week plan template swap works well but gives no "3 days left this week
  didn't get a template because they're already logged" explanation when
  `touched` silently skips dates — matches the wish-list pattern of "silent
  filter with no visible signal" seen in fuel's `MealPlanIdeas`.
- `/program-builder` "rest day" ambiguity (see above) — a UX affordance
  (explicit "Rest day" toggle per cell) would remove the guesswork.
