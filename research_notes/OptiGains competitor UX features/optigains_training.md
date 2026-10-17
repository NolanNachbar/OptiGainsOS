# OptiGains training-side UX: code-grounded inventory

Scope: what the workout/training experience does today, verified by reading source in `/Users/nolan/projects/OptiGainsOS` (read-only). Citations are `file:line` against the working tree on `main` as of 2026-10-13. Read first: `CLAUDE.md`, `KNOWN_NON_ISSUES.md` (no training-side item in it applies here; the `created_by` note is not relevant to UI reads). Prior audits were used as leads only; claims checked are marked below.

Two loggers exist and they differ a lot:
- **QuickWorkout** (`src/pages/QuickWorkout.jsx`, route `/quick-workout`, `App.jsx:93`): free logging, optionally seeded from an engine prescription.
- **WorkoutDetail** (`src/pages/WorkoutDetail.jsx`, route `/workout-detail`, `App.jsx:247`): program workouts (`?source=program`) and saved workouts (`?id=`).
Both render the same `ExerciseCard` (`src/components/workouts/ExerciseCard.jsx`, 1774 lines) and `WorkoutLoggingHeader` (`src/components/workouts/WorkoutLoggingHeader.jsx`).

Dead-code convention used below: "dead" means no importer or route reaches the file. Checked by grepping `import` lines and route definitions in `src/App.jsx`. Zsh-safe greps were used throughout.

---

## 1. Logger: what happens per set

### Takeaway
The logger is a dense grid per exercise (Set | Prev | weight | reps | RIR | done | remove) with a rest pill in the header, real prefill for program and quick sessions, and a per-exercise vitals strip. It has no warm-up sets, no supersets, no per-set e1RM column, no PR detection, no haptics, no sound, and no celebratory animation. Its "Prev" column is one value per exercise, not per set.

### Cited Findings

**Grid and row layout**
- Grid columns: `ExerciseCard.jsx:258-260` (`22px / minmax(52px,1fr) / 44px x4` with RIR; `44px` cells, Set column 22px to 32px on sm).
- Header labels Set / Prev / {weightUnit} / Reps|Sec / RIR (with hover tooltip) / Done / blank: `ExerciseCard.jsx:968-990`.
- Per-set row cells, in DOM order: set number (`:1034-1038`), Prev button (`:1039-1053`), weight input (`:1054-1097`), reps input (`:1108-1126`), RIR input (`:1127-1145`), done toggle (`:1146-1160`), remove X (`:1161-1168` area).
- Hold exercises (planks, etc.) log seconds in place of reps: `ExerciseCard.jsx:143` (`isHold`), `:1113`, `:1124` (max 3600 vs 500).

**Prev column (the "previous performance" column)**
- The Prev button text is `lastWeight x lastReps` and is **the same value on every set row** of the exercise: `ExerciseCard.jsx:1050-1052` reads `lastPerformance.lastWeight` / `lastPerformance.lastReps`, not a per-set-index value.
- `getLastExercisePerformance` (`src/utils/exerciseStats.js:428-462`) returns the **heaviest** set from the most recent log containing the exercise (`lastWeight = Math.max(weights)`, `lastReps` = reps of the first set at that weight). It also returns the full `sets` array, which the vitals volume comparison uses (`ExerciseCard.jsx:191-197`), but the Prev column does not.
- Tapping Prev copies `lastWeight` and `lastReps` into that one set (`ExerciseCard.jsx:1042-1046`). The aria-label is "Use last set W by R" (`:1047`). This is the only "use last set" action; it is per row, not bulk.
- Prev is disabled when there is no history (`:1041`, shows an em dash `:1052`).
- Dated last-time text also appears in the exercise header: `ExerciseCard.jsx:616-664` ("name · target · last time").

**Prefill**
- Program mode (WorkoutDetail): on exercise seed, weight = `e1Load(targetReps, rir_target)` or the engine working weight or a rep-scaled last weight; reps = the prescribed target; RIR is explicitly not prefilled (`src/pages/WorkoutDetail.jsx:~680-800`, comment "never prefill the target as a logged value", `rir: null`). Rep ranges seed the lower bound (`WorkoutDetail.jsx:108`).
- Quick mode, from an engine prescription (`location.state.prescribedSession`, set by `PrescribedSessionCard.jsx:422,442,640,665`): one set per prescribed count, weight = `targetWeight`, reps = lower bound of the rep string, RIR null (`src/pages/QuickWorkout.jsx:50-80`).
- Quick mode, from history: `addExercise` and `replaceExercise` seed weight from insight suggestion, else last weight, and reps from last reps (`src/pages/QuickWorkout.jsx:258-272`). If there is no history, reps default to **0** (`src/hooks/useWorkoutExercises.js:172`). The input then renders "0" as a real value (`ExerciseCard.jsx:1119` placeholder only shows when the value is empty; `value={set.reps ?? ""}` at `:1113` and `:1074`). This matches the prefill finding in `LOGGING_UX_AUDIT_2026-10-13.md` item 5, verified.
- Add Set copies the **last set's** weight and reps, not the last session's (`src/hooks/useWorkoutExercises.js:20-37`).
- Weight input shows a green "+N" badge when a completed set beats `lastWeight` (`ExerciseCard.jsx:1102-1106`). Only up-deltas are shown.

**RIR keypad**
- Two input modes. On a coarse pointer (touch) the native keyboard is suppressed (`inputMode="none"`, `:1065`, `:1111`, `:1131`) and a custom bottom-sheet keypad opens on focus (`useKeypad` at `:521-527`, `activeField` at `:514`, `KeypadSheet` referenced around `:570-600`). On fine pointers the native numeric input is used.
- RIR accepts 0 to 10 in 0.5 steps (`:1140-1142`). The keypad's RIR pills are part of the sheet (commit path at `:504-506`, `handleRirChange` `:444-470`).
- Top-set rule: completing a `top_set` with no RIR or RPE routes focus to RIR and shows "RIR required on top sets" (`:362-368`, alert at `:1186` area). Only `top_set` is enforced; other set types are not.
- RIR color scale: red at <=0, amber <=2, green <=4, neutral otherwise (`:279-285`).
- Finish-time soft check: a top set with no RIR shows a toast "Top set missing RIR... tap Finish again to save as-is" (`src/pages/WorkoutDetail.jsx:1375-1387`). Not a hard block.

**Weight sanity**
- Max input weight 2000 (`ExerciseCard.jsx:1094`). Completing a set more than 2x `lastWeight` (and above the previously confirmed max for that exercise) raises `window.confirm("... is much heavier than your last ... Save it anyway?")` (`:380-395`). This is a browser dialog, not an in-app sheet.

**Rest timer on set completion**
- Completing a set calls `onStartRestTimer(rest_seconds || programExercise.rest_seconds || smartRest)` (`ExerciseCard.jsx:399-404`).
- Smart rest defaults: 180 s for compound/machine, 90 s for isolation, 180 s when the exercise is unknown (`src/utils/fatigueManagement.js:11-12, 95-106`).
- Quick mode timer: `src/pages/QuickWorkout.jsx:122-125` state, `:356-380` tick (1 s cadence, aligned to the second), `:383-388` start, `:390-395` skip, `:396-402` add +/-seconds.
- Header rest pill: `src/components/workouts/WorkoutLoggingHeader.jsx:234-281`. Idle reads "Rest"; running shows a countdown with an `rest-urgent` pulse in the last 10 s (`:84`, CSS `src/index.css:668, 694`). A popover offers -10, +10, +30 and Skip (`:256-290`).
- Rest end has **no sound, no vibration, and no in-page alert**. The timer simply reaches 0:00 and the pill returns to "Rest" (`QuickWorkout.jsx:366-372`; `WorkoutDetail.jsx:818-826` comment "Deliberately no notification here").
- Background rest alarm (program mode only): WorkoutDetail posts `SCHEDULE_REST` with the absolute end time to the service worker (`WorkoutDetail.jsx:808-813, 838-845`; cancelled on unmount `:836`). `public/sw.js:115-170` fires a "Rest over" notification with `vibrate: [200,100,200]` if no window is visible. **QuickWorkout never posts to the SW** (grep for `SCHEDULE_REST` and `postRest` in `src/pages/QuickWorkout.jsx` returns nothing). So the lock-screen rest alert exists for programmed workouts only.

**Set completion, delete, and add**
- Completion control: `ExerciseCard.jsx:1146-1160`, a rounded check that turns green when done. Aria-label "Mark set N complete".
- Remove: X button in the set row (`ExerciseCard.jsx:1161-1168`). Removal is immediate with a "Set N removed" toast carrying an Undo action (`src/pages/QuickWorkout.jsx:229-245`, same pattern in `WorkoutDetail.jsx:286-300`). No confirmation dialog.
- Add Set: `ExerciseCard.jsx:1229-1233`, copies last set (see above).
- Daily-min and daily-max set types exist for a "daily min" protocol: `ExerciseCard.jsx:828` adds a `daily_min` set; `:1035` colors it.

**Vitals strip (per exercise)**
- Target (`:155-168`): program mode shows working weight and daily min and RIR; free mode shows `sets x reps` from the original exercise.
- Volume: completed sets' sum of weight x reps, and a delta % against the first N sets of last session where N = completed count (`:170-208`). A delta is shown only when the comparison is apples-to-apples (`:199-208`). This is the in-workout "vs last time" comparison, and it is the only one in the logger.
- Best set: heaviest completed set, shown as "W x R" with an Epley e1RM when eligible (`:210-218`, rendered `:1262-1279`).
- e1RM sparkline: last 8 sessions, shown only with >=2 points, with the current value and a delta vs prior session (`:224-246`, rendered `:920-965`). Data from `getExerciseE1rmHistory` (`exerciseStats.js:260`).

**Tagging on misses and near-failure sets**
- Missed set (below prescribed weight/reps): "Missed, why?" with reason chips (`ExerciseCard.jsx:1006-1014, 1158-1210`). Reasons come from `src/config/failureReasons.js` via `reasonsForExercise`. Free text on "Other".
- Made set with RIR <=1: "Where did it stall?" sticking-point chips for Big-3 lifts only (`:1011-1014`).

**Replace exercise, reorder, notes, cues**
- Kebab menu (`ExerciseCard.jsx:770-800`) has Replace exercise, reorder mode, notes, and "Cues / how-to" (lazy-loads `getExerciseInfo` `:348-353`).
- Replace is a free-text Combobox, not a curated list (`:1329-1365`). Replacement logic in `WorkoutDetail.jsx:~1100-1150`: completed sets are kept; uncompleted sets take the replacement's seed load and reps; a note "Swapped X -> Y after N sets" is written; program mode transfers progression state via `transferProgressionState` (`programProgression.js:254`).
- Drag reorder: `src/components/workouts/SortableExerciseRow.jsx` (imported by QuickWorkout and WorkoutDetail).

**Shot notes (per-exercise cues)**
- A "Shot list" toggle (off by default) shows stored per-exercise notes inside the card (`WorkoutDetail.jsx:161, 220, 1495-1514`; `ExerciseCard.jsx:47-48, 1435-1440`). Data from `useExerciseShotNotes` (`src/hooks/useUserQueries.js:159`, table `ExerciseShotNote`). Not a generated suggestion.

**Items not found (grep evidence)**
- Warm-up set generation: no code generates warm-up sets. `set_type` values written by the app are `working`, `top_set`, `back_off`, `daily_min`, `daily_max`. Grep `warm` in `src/` returns only comments (`exerciseStats.js:228-229`, `ExerciseCard.jsx:188`) and a session-type option `warmup` in `src/pages/CreateWorkout.jsx:29, 59` (a whole-session type, duration 10 min, not a set). `scripts/` (engine) also grep-clean for `warm.?up`. The e1rm utility excludes set types matching `/warm/i` (`src/utils/e1rm.js` eligibility) but nothing produces such a set.
- Superset / circuit support: grep `superset|circuit` in `src/` returns nothing relevant (only an unrelated `circuit breaker` free-text fragment is absent too). Program blocks ("merged lifts", `set_scheme`) exist (`WorkoutDetail.jsx:~690-720`, comment "A merged lift... heavy top set, then back-offs"), but they are sequential blocks of one exercise, not supersets.
- Plate calculator in the logger: not present. A plate calculator exists separately in `src/components/CalculatorsModal.jsx:16-148` (`PlateCalculator`: plates per side from a target and bar weight, lbs and kg lists). It is reached from the Quick Add menu "Calculators" action (`src/components/Layout.jsx:682` mounts `CalculatorsModal`; `src/components/ui/QuickAddMenu.jsx:18`). Not reachable from inside the logger.
- One-rep-max calculator: `src/components/workouts/OneRMCalculator.jsx`, reached only through CalculatorsModal (`CalculatorsModal.jsx:14, 300`).
- PR detection UI: not found. `detectPRs` (`src/utils/exerciseStats.js:97-121`) and `getAllPersonalRecords` (`:166`) have **no call sites anywhere in `src/`** (dead). The only "PR" language left is in comments. The e1RM column the code comments describe (`ExerciseCard.jsx:248-251` "SET | PREV | LOAD | REPS | (RIR) | E1RM | done | remove") is **stale**: the rendered grid has no E1RM cell (verified: 7 children per row, `:1029-1168`). E1RM appears only in the best-set vitals and sparkline.
- Haptics: `navigator.vibrate` and `vibrate` are absent from `src/`. `vibrate` appears only in notification payloads (`public/sw.js:103, 161`, `src/hooks/usePushNotifications.js:87`). Note `showLocalNotification` (`usePushNotifications.js:80-89`) has no callers (dead).
- Sound: no `Audio`, `.mp3`, `.wav`, `speechSynthesis`, or `AudioContext` in `src/` or `public/`. Only `audio: false` in a camera capture (`src/components/physique/TimedCameraCapture.jsx:49`).
- Animation: CSS keyframes `restUrgent`, `spinLoop`, `pulseLoop`, `scanSweep`, `sheetRise`, `riseIn`, `ringFill` (`src/index.css:694-731`). No confetti or celebration animation (grep `confetti|celebrat|trophy|personal best` returns nothing relevant).
- Per-set e1RM in the grid: not present (see stale comment above).
- Per-side tracking, tempo, RPE-only mode: not found (RPE is accepted as a legacy input, converted to RIR as `10 - rpe`: `ExerciseCard.jsx:1009, 1133`).

### Inferences
- e1RM in the logger (`estimateOneRepMax`, Epley `w*(1+r/30)`, `exerciseStats.js:219-226`) ignores RIR. The engine-side helper `src/utils/e1rm.js:20-21` uses `w*(1+(reps+rir)/30)`. The two e1RM numbers can disagree for the same set, and the user sees the logger number. This is a real inconsistency, not a closed item; not verified against the engine's Python implementation.
- Because Prev is the heaviest set, not per-set, a day with a heavy top set and lighter back-offs shows the top set in every row's Prev cell. That is the most likely reason the Prev column reads ambiguously; a per-set-index Prev would be a different number.
- Rest-over alerting for free sessions is absent (not just unpolished). A user who logs free sessions with the phone locked gets no end-of-rest signal at all.

### Gaps
- Did not drive the UI on a device; visual density and tap targets are from the audits' screenshots only, not re-verified here.
- The `KeypadSheet` component body (keypad keys, "Next" flow) was referenced but not read end to end (`ExerciseCard.jsx` ~`:570-600` plus the sheet definition). Behavior described above is from call sites and comments.

---

## 2. Finish flow

### Takeaway
Finishing a workout saves silently and navigates away with a toast. There is no summary screen, no PR badge, and no volume or vs-last-time recap at finish. The only in-flow "finish" moments are two confirmation prompts and a post-workout notes dialog.

### Cited Findings

**"All sets done" prompt (both loggers)**
- QuickWorkout: prompt "All sets done. Finish workout?" with "Not yet" and "Finish workout" (`src/pages/QuickWorkout.jsx:975-995`). Fires only on the single-set transition that completes the last set (`QuickWorkout.jsx:524-530` comment, rule implemented in its handler). It never finishes on its own.
- WorkoutDetail: same prompt copy (`src/pages/WorkoutDetail.jsx:2036-2060`) and a rule at `WorkoutDetail.jsx:1248-1260`. "Finish workout" calls the same handler as the header Finish (`:1254-1256`).
- The LOGGING_UX_AUDIT claim that this prompt is "not yet covered" for programmed workouts is **outdated**: WorkoutDetail has it now (verified at `WorkoutDetail.jsx:2039`).

**Header Finish**
- `WorkoutLoggingHeader.jsx:291-310`: volt-colored Finish button, `canFinish` gate (`:35`), disabled while saving. Aria/test-id `finish-workout-btn`.

**Incomplete-set prompt (WorkoutDetail)**
- `WorkoutDetail.jsx:1388-1403`: if any set is incomplete, a prompt offers to mark them all complete (`markAllSetsComplete`), then opens the notes dialog. "Complete All" button at `WorkoutDetail.jsx:1253, 1374`.

**Post-workout notes dialog (WorkoutDetail)**
- Title "Finish Workout", a textarea "What felt good/bad? Any injuries? Pump quality?", "Go Back" and "Finish workout" (`WorkoutDetail.jsx:2109-2130`). This is the only "summary" surface in the finish path, and it is free text, not stats.

**What happens after save**
- QuickWorkout (`QuickWorkout.jsx:412-470` mutation): creates Workout, WorkoutSchedule (completed) and WorkoutLog rows, with a pre-check that the session is still in progress. On success: `toast.success("Workout logged successfully!")` and `navigate("/dashboard")` (which redirects to `/today`, `App.jsx:228`). Duplicates surface as "Workout already logged."
- WorkoutDetail program path (`WorkoutDetail.jsx:~1000-1030`): toast "Workout logged! Progression updated." or "Program completed! Congratulations!" (5 s), then navigate to `/program/:id`. Progression is computed in the browser (`src/hooks/useProgramQueries.js:~290-340` calls `updateProgressionState`), then saved on the enrollment. If progression update fails the toast says so.
- WorkoutDetail free path (`WorkoutDetail.jsx:1026-1028`): toast then navigate to `/dashboard`.
- No summary page, no PR badge, no volume total, no vs-last-time recap is rendered after finishing.

**Session persistence while logging**
- Each set change triggers `saveProgress` to the server (`src/hooks/useWorkoutSession.js`), with a localStorage mirror (`src/lib/workoutDraft.js:1-20`) to survive failed writes mid-session. The header flag `optigains-workout-active` is maintained by `src/lib/workoutSessionFlag.js` (per CLAUDE.md, not to be changed here).

### Inferences
- A user who finishes a session gets no confirmation of what was achieved beyond the toast. There is no in-app place where the day's performance is recapped; the next surface is Today.

### Gaps
- Did not verify whether `/today` or `/program/:id` renders anything about the just-finished session (e.g., a "Done today" card). Only the redirect target was read.

---

## 3. Programs

### Takeaway
Programs are built in a desktop-capable builder with a cycle-day grid, imported and exported as JSON, and progress with client-side double-progression-style rules. The engine-side deload and mesocycle controls exist as UI code but their modal is unreachable (dead). Exercise replacement in a live session is a free-text swap that keeps completed sets.

### Cited Findings

**Builder**
- Route `/program-builder` (`src/App.jsx:89`). Title "Program Builder" (`src/pages/ProgramBuilder.jsx:500`). Fields: name, goal (Muscle Gain, Fat Loss, Strength, Endurance, General Fitness: `ProgramBuilder.jsx:53-57`), description, tags, cycle total days, training days, cycle template (`:1509-1538`).
- Cycle-day grid with drag-and-drop (dnd-kit `ProgramBuilder.jsx:12`; `src/components/programs/CycleDayGrid.jsx`, `DraggableWorkoutCard.jsx`, `WorkoutLibrarySidebar.jsx`). Dragging a library workout into a day.
- Per-exercise config: sets, rep target, RIR target, focus (Strength or Hypertrophy), start weight, progression increment (`ProgramBuilder.jsx:1289-1441`).
- "Progression Preview" (`ProgramBuilder.jsx:1407-1450`): select an exercise, enter start weight, see projected weights by cycle, labeled as "best case" (progression every session). Uses `projectProgression` (`src/utils/programProgression.js:238`).
- Entry points: Train > Programs tab "+ / Create" links to `/program-builder` (`src/pages/Workouts.jsx:507, 571, 591, 607, 663, 1200`), and Train's active-program chip has Edit (`src/pages/Train.jsx:31-40`).
- Schedule-after-create modal: `src/components/workouts/ScheduleAfterCreateModal.jsx` (imported by ProgramBuilder).

**Import and export (JSON only)**
- Export: `src/utils/programIO.js:28-70` downloads `<name>.json`. Button in `ProgramDetail.jsx:13` import.
- Import: Train > Programs has a hidden `accept=".json"` input (`src/pages/Workouts.jsx:528-534`), handler `handleImportProgram` (`:242-250`) parses via `parseProgramJson` (`src/utils/programIO.js:75-151`), then navigates to `/program-builder` with `importedProgram` state.
- Library Import button (`src/pages/Workouts.jsx:361`) is a separate workout import: JSON with `title` and `exercises` (`:199-220`). No CSV, no spreadsheet, no URL import, no PDF import anywhere in `src/` (grep for those formats returns nothing relevant).

**Deload and mesocycle**
- The engine has no scheduled deloads by design: `src/utils/programProgression.js:25-26` ("Never suggests a deload... the athlete may schedule one manually"). `src/utils/coachingEngine.js:117-133` flags a possible deload as informational only.
- `ProgramDurationModal.jsx` (347 lines) contains a duration picker (4, 8, 12, 16 weeks, custom), a weekly increment, and a deload mode ("match intro" vs "reduce by N%") (`src/components/workouts/ProgramDurationModal.jsx:25-28, 37-38, 225-265`). **It is dead**: no file imports it (grep for `ProgramDurationModal` finds only its own definition). Its deload options therefore have no effect in the UI.
- The Prescribed card maps an engine session type `DELOAD` to a label (`src/components/dashboard/PrescribedSessionCard.jsx:53`). The engine-side deload labeling was not verified here.
- Progression "stall" detection: `hasWidespreadStalling` (`src/utils/programProgression.js:277`) has no importers (dead). `STALL_THRESHOLD = 3` (`:3`) is used inside progression logic only.

**Progression state (program mode)**
- Targets computed per exercise from progression state: `calculateDailyTargets` (`programProgression.js:55`) feeds the ExerciseCard target (`ExerciseCard.jsx:157-162`) and seeds (`WorkoutDetail.jsx`).
- Per-set evaluation after RIR is entered: `evaluateSetPerformance` (`programProgression.js:97-124`) returns a nudge only for `daily_min` sets ("RIR X on the daily min. Working weight: Y.") (`:104-123`). Shown for 8 s (`ExerciseCard.jsx:406-424`, render `:1396-1405`). For ordinary working sets there is no per-set nudge in program mode.
- Save-time update: `updateProgressionState` (`programProgression.js:136`) is called once per exercise log in `src/hooks/useProgramQueries.js` (around lines 290-340). Version 2 programs advance to the next workout in sequence, not by calendar (`useProgramQueries.js` comment "v2: Simplified progression").
- The rule set (increment per session, stall threshold, weight step `PLATE_INCREMENT = 2.5` at `programProgression.js:4-8`) is fixed in the browser. The "+5 lbs/session" text in the builder preview uses the exercise's `progression.weight_increment` or a default of 5 (`ProgramBuilder.jsx:1431-1436`).

**Exercise swap**
- In-session Replace (see section 1). Free text, Combobox over known names (`ExerciseCard.jsx:1329-1365`).
- Week-level "run one of my saved splits this week" swap: `src/components/program/WeekTemplateSwap.jsx`, reached from WeeklySchedule (`src/pages/WeeklySchedule.jsx`). Uses `useWeekTemplate`.
- Dead swap code: `src/utils/exerciseReplacer.js` (`findReplacementExercise`, `replaceDislikedExercises`, `shouldReplaceExercise`) has **no importers**. `src/components/workouts/CustomSplitSelector.jsx` also has no importers.
- Equipment swaps (automatic) exist: `WorkoutDetail.jsx:215` reads `swaps` from a memo, rendered via `EquipmentProfileToggle` (`:1481`).

**Other program UI**
- ProgramDetail (`src/pages/ProgramDetail.jsx`, route `/program/:id`, `App.jsx:237`): program page with edit and export.
- ProgramCompleteCard on Today (`Today.jsx:801`), when an enrollment finishes.
- Cardio sessions inside a program: `CardioSessions` in WorkoutDetail (`:1828`).
- Override a program workout: `OverrideProgramWorkout.jsx` (used by `CreateWorkout.jsx` and `WorkoutDetail.jsx`).

### Inferences
- The program engine's progression rules are client-side JavaScript, not the Python engine. A reader comparing to competitor "auto-progression" features should know the in-app rule is a fixed heuristic (increment and stall threshold), and the prescription that actually drives Today is server-side. Two sources of truth for load exist in the app; not verified which one wins in every case.

### Gaps
- Did not trace whether the engine prescription (`training_prescription`) and the client progression targets agree on the same day. Not verified.

---

## 4. Engine-facing UI: why a weight or volume was prescribed

### Takeaway
The app shows an engine rationale as a single line plus a few badges on the prescription card, and a numeric target per exercise in the logger. It does not show the numbers behind a load (no e1RM input, no fatigue or RIR derivation per set). The most explanatory surface is the coach-style chips, which are conditional.

### Cited Findings

**PrescribedSessionCard** (`src/components/dashboard/PrescribedSessionCard.jsx`, 706 lines, mounted on Today at `Today.jsx:805`)
- Rationale: the engine's `rationale` string, with raw enum names humanized (`:60-64`, render `:509-511`). The "why today looks like this" line (`:513-524`) shows focus split (`w_pst`/`w_str`, "% conditioning / % strength"), "Anabolic window open, lift now" (when `anabolic_window` and not rest), and "High interference, protect the lift" (`interference_level === "HIGH"`).
- Intensity badge: `intensityBadge` (`:66-74`) shows "x.xx x intensity" (teal, >=1.05 or 0.85-1.05) or "x.xx x back off" (warn, <0.85) on the title row (`:~505-512`).
- Lift list: collapsed by default on mobile, expanded on desktop (`:530` area; disclosure `liftsOpen`). Each `ExerciseRow` shows reps and RIR from the prescription (`:~75-80`).
- Primary CTAs: "Start", "Begin program workout", "Log a workout" (`:246-274, 408-410`). "Log this session" hands the prescription to Quick Workout (`:422, 640`).
- Pre-train check-in gate: `beginSession` (`:139-146`) routes through a check-in sheet (energy, weigh-in) before starting.

**DailyBriefCard** (`src/components/dashboard/DailyBriefCard.jsx`, 223 lines)
- Collapsible brief (`:92-100`; collapse state in `localStorage` key `ai_brief_collapsed`). Link "Brief History" to `/brief-history` (`:144`). Mounted on Today's "Today's detail" disclosure, brief tab (`Today.jsx:1054`), and on Analyze (`Insights.jsx`).
- I did not read its rendered sentence structure in full (gap below).

**Coach (form review, not the training engine)**
- `src/pages/Coach.jsx` (353 lines, route `/coach`, `App.jsx:106`, reachable from Body nav `Layout.jsx:68`). Title "Coach office hours". User uploads a lift clip (video only, 50 MB cap), which is stored in the `physique` bucket and sent to a Supabase edge function `analyze-form` (`Coach.jsx:85-101`). The header comment says the edge function uploads to the Gemini Files API. The result shows "Fixes, in order" and "Working well" (`:326, 341`), with per-exercise sections (`:303`).
- This is an LLM feature and sits outside the deterministic engine described in `CLAUDE.md`. Recorded here as found; not judged.

**Logger chips (QuickWorkout only)**
- Coaching phase: derived from the count of past sessions with any RIR logged. Phase 2 at 5 sessions, phase 3 at 15 (`src/utils/coachingEngine.js:10-11, 32-37`). Phase 1 shows nothing.
- Pre-session insight (phase 2+): `getPreSessionInsight` (`coachingEngine.js:94`) produces a trend up/down and a suggested weight. Shown on the empty canvas as a chip that expands to `PreSessionInsightCard` (accept/dismiss) (`src/pages/QuickWorkout.jsx:144-170`, `src/components/workouts/PreSessionInsightCard.jsx`). Accept pre-fills weight (`QuickWorkout.jsx:267-272`).
- Between-set coaching chip (phase 3, free mode only): `getBetweenSetCoaching` (`coachingEngine.js:195`) returns a message with `go_heavier`, `affirm`, or `back_off` and a suggested weight, shown as a chip targeting the next set (`ExerciseCard.jsx:428-439`). **Only QuickWorkout passes `coachingPhase`** (`QuickWorkout.jsx:850`); WorkoutDetail does not, so program mode never gets these chips (`ExerciseCard.jsx:42` default 1).
- The Phase 3 chip appears only in free mode (`!programExercise`, `:428`).

**Vitals and volume**
- Per-exercise volume delta, best set, e1RM sparkline (section 1). These are descriptive, not prescriptive.

### Inferences
- The app explains the prescription in words (one rationale line, a focus split, and an intensity multiplier) and in targets (weight, reps, RIR). It does not show which inputs produced the number (last e1RM, days since last session, fatigue state) on the logger itself. Those live on AthleteState and Recovery pages (`src/pages/AthleteState.jsx`, `RecoveryDetail.jsx`), reached via Body nav (`Layout.jsx:58-65`); not read in depth here.
- The coach chip logic in QuickWorkout gives advice at phase 2-3, but the program logger, which is the engine-driven path, gets no between-set advice. That is the opposite of what the engine would be able to provide.

### Gaps
- Did not read `DailyBriefCard` render body or `AthleteState.jsx` / `RecoveryDetail.jsx` in depth.
- Did not read the engine's Python output schema to confirm every field the card reads (`rationale`, `w_pst`, `interference`, `anabolic_window`). The card's field names were taken from its own comment at `PrescribedSessionCard.jsx:46`.

---

## 5. Today and Train: what appears, in what order, which moments are interactive

### Takeaway
Today is a vertical stack of modules in fixed order: Nutrition, Session, Weight trend, Weekly training rings, Readiness, To-do, then a collapsed "Today's detail" disclosure (Vitals, State / Brief / Muscle tabs), then Quick actions. Train is a four-tab hub (Schedule, Library, Programs, Activity) with a program chip above.

### Cited Findings

**Today order** (`src/pages/Today.jsx`, 1089 lines)
1. Desktop-only header (`:679`). Load-failure banner if the brief fails (`:687-700`).
2. Module 1, Nutrition: Kcal / Protein / Carbs / Fat, 4 columns with bars (`:711-766`). Link to Fuel (`:727`). Interactive (tap through).
3. Module "Session" (`:771-808`): workout name row with Activity icon and chevron (`:776-790`), then `PrescribedSessionCard` (compact, `:805`) or ProgramCompleteCard (`:801`). This is where Start / Begin / Log a workout live. Interactive.
4. "Unfinished sessions" module (`:810-866`): sessions older than 24 h that were not finished, with review actions. Interactive.
5. Module "Weight trend · 30 days" with EWMA value and sparkline, detail link to `/fuel?tab=body` (`:868-906`). WeighInRow inline (`:906`). Interactive.
6. Module "Weekly training" progress rings (`:909-932`), only rendered once data is known. Interactive only through the ring tap if any.
7. Module "Readiness" one-line score and verdict (`:934-948`). Not interactive beyond the morning check-in (`MorningCheckin`, `:~1000+`).
8. To-do list `TodayActions` (`:950-953`), self-hides when empty. Interactive.
9. Below the fold (`:955`): calorie-timing chip, then a "Today's detail" disclosure (`:977-1070`) with **Vitals** (tiles) and a three-way segmented control: **State** (Form/TSB, ACWR, VDOT, Fitness/CTL tiles, `:1000-1040`), **Brief** (`DailyBriefCard`, `:1054`), **Muscle** (heat map, `:1062`). On mobile it is collapsed by default (`:998-1010`).
10. Quick actions (`:1072-1085`): a Log food tile.

**Train** (`src/pages/Train.jsx`, 66 lines; route `/train`, `App.jsx:86`)
- Active-program chip with Edit (`:31-40`, link to `/program-builder?edit=`).
- Four tabs (`:9-14`): Schedule (WeeklySchedule), Library (Workouts library), Programs (Workouts programs tab), Activity (Workouts activity log). Tab state is the URL `?tab=`.
- Nav in the dock/sub-nav: `Layout.jsx:36-43`.

**Dock and entry points**
- Dock items: Today, Train, Fuel, Body (`src/components/Layout.jsx:30-110`, `dock` flags). Mind and Analyze are `dock: false` (`Layout.jsx:83, 97`) and are reached through the Quick Add menu ("Analyze", `src/components/ui/QuickAddMenu.jsx:19`) or from Insights (`src/pages/Insights.jsx:43` links to `/mind`).
- Quick Add (center "+" action, `Layout.jsx:441, 657`): Quick Workout (primary), Log Food (primary), Weigh In (mid), Create Workout, Calculators, Stream Note, Analyze (demoted) (`QuickAddMenu.jsx:8-20`).
- Body nav group (`Layout.jsx:58-74`): State, Recovery, Physique, Coach, Lifts. Lifts (`src/pages/Lifts.jsx`) shows each logged lift's current e1RM (or best set if no e1RM), a 4-week change, and expands to an e1RM chart. Entry point is Body > Lifts.
- Progress (`src/pages/Progress.jsx`) has no route of its own; it is embedded in Fuel's Body tab (`src/pages/Fuel.jsx:5, 71-78`). Not dead.
- Workouts (`src/pages/Workouts.jsx`, 1226 lines) is no longer routed; `/workouts` redirects to `/train?tab=library` (`App.jsx:235`). It is still the body of the Train tabs.
- Career (`/career`) has no nav entry (`App.jsx:96-101` comment "IA-ORPHAN"); reached only from Insights' tab redirect (`src/pages/Insights.jsx:22`).

**Other notes**
- Push reminders have senders in `supabase/functions/` (`send-daily-workout-reminder`, `send-daily-brief-push`, `send-weekly-checkin-reminder`, `send-physique-reminder`, `send-weekly-meal-plan-reminder`, `send-reminder-push`). Notification titles include "Workout Day" (send-daily-workout-reminder). Scheduling of those functions was not verified.

### Inferences
- The training card is buried in the middle of Today (after Nutrition), so on a phone the first screen is Nutrition and the Session module is below it. That ordering is a choice; competitors typically lead with the workout.
- "Today" surfaces three training-relevant things (Session, Weekly training, Readiness) but none of them summarizes what was done last session.

### Gaps
- Did not render Today to confirm which modules are visible at phone width under each state (no morning check-in done, no program, etc.).

---

## 6. PWA specifics

### Takeaway
It is an installable, standalone PWA with a network-first navigation handler and cache-first static assets, a deferred reload after a new service worker, and a rest alarm owned by the service worker for programmed workouts. Supabase calls are never cached, so there is no offline logging. Icons referenced by the manifest and HTML do not exist in the repo.

### Cited Findings

**Manifest** (`public/manifest.json`)
- `display: standalone`, portrait, theme `#0A0D12`, start `/`. Icons listed: `optigains-icon.svg` (any), `icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`.
- **The four PNG icons do not exist.** `find` over the repo (excluding node_modules) for `icon-192*`, `icon-512*`, `icon-maskable*`, and `apple-touch-icon*` returns nothing. `public/` contains only `404.html`, `manifest.json`, `optigains-icon.svg`, `optigains-logo.svg`, `sw.js`, `vektor-logo.png`, `vektor-logo.svg`. (`index.html:34` also links `apple-touch-icon.png`, which is absent.) Claimed by no prior audit I read; verified here.
- No `shortcuts`, no `share_target`, no `widgets`, no `protocol_handlers` in the manifest.

**HTML head** (`index.html:32-39`)
- Favicon SVG, manifest link, `apple-mobile-web-app-capable=yes`, status bar `black-translucent`, `theme-color #0A0D12`.
- Viewport `width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover` (`:35`). Pinch-zoom is disabled. Accessibility consideration.

**Service worker** (`public/sw.js`, 174 lines)
- Cache name `optigains-v4` (`:2`). App shell precache: `/`, `index.html`, `manifest.json`, `optigains-icon.svg` (`:9-10`).
- Install: `cache.addAll(APP_SHELL)` and `skipWaiting()` (`:13-17`). Activate: deletes other caches and claims clients (`:20-26`).
- Fetch (`:29-70`): non-GET passes through; **Supabase hosts are not intercepted** (`:36`, `if hostname includes supabase.co return`), so API and auth calls always go to the network. Navigation requests are network-first with fallback to cached `index.html`. Other same-origin GETs are cache-first with runtime caching capped at 60 entries (`MAX_RUNTIME_ENTRIES`, `:4-5`, trim at `:72-80`).
- Offline logging: no offline write queue for workouts. `src/lib/workoutDraft.js` keeps a localStorage mirror of sets so a failed Supabase write is not lost mid-session, but the mirror does not replay writes (the header comment says the tail is lost if writes never land).
- Push: `push` handler shows a notification with `vibrate` and `notificationclick` focuses or opens the app (`:82-120`).
- Rest alarm: `SCHEDULE_REST` / `CANCEL_REST` messages set a timeout; if no window is visible when it fires, it shows "Rest over" with `tag: optigains-rest` and `renotify` (`:122-174`). Only WorkoutDetail posts these (section 1). This is the only background alert for training.

**Registration and update**
- `src/main.jsx:12-~45`: registers `sw.js` in production only, on `load`. On `controllerchange` it reloads the page, but holds the reload while a workout is active (`isWorkoutActive` / `onWorkoutActiveChange`, `src/lib/workoutSessionFlag.js`), per CLAUDE.md.

**Install prompt, widgets, notifications settings**
- No `beforeinstallprompt` handler and no in-app install button (grep `beforeinstallprompt` in `src/`, `public/`, `index.html` returns nothing). Install is the browser's own affordance.
- No `display-mode` media query in CSS or JS (grep returned nothing). The app does not detect standalone mode itself. The header comment in `WorkoutLoggingHeader.jsx:190-192` says it accounts for standalone mode via safe-area padding, which is layout-only.
- No home-screen widget, Live Activity, or lock-screen widget code (grep `widget|live activity|ActivityKit` returned nothing).
- Push subscription UI: `src/components/NotificationSettings.jsx`, in Profile (`src/pages/Profile.jsx:933-934`). Uses `Notification.requestPermission` and a push subscription (`src/hooks/usePushNotifications.js:13-60`).

### Inferences
- Lock-screen rest alerts work for programmed workouts only, and only if the service worker is still alive (the source comment admits it can be terminated while idle, `sw.js:~122-130`).
- The missing icon files likely mean the home-screen icon falls back to the SVG or the browser's default on iOS (apple-touch-icon missing). Not verified on a device.

### Gaps
- Not tested on an iPhone or a simulator in this pass (the `ios-sim/` artifacts in the working tree were not read).
- Whether Vite emits the PNG icons at build time (no vite-plugin-pwa in the repo that I found; `vite.config.*` not read). Checked only the source tree and `public/`.

---

## Dead and unreachable code found in the training surface

Verified by grepping importers and route definitions. Not "working" in the app.

| File | Evidence | Note |
|---|---|---|
| `src/components/workouts/ProgramDurationModal.jsx` | no importers | Contains the mesocycle duration and deload-mode UI. Unreachable. |
| `src/components/workouts/CustomSplitSelector.jsx` | no importers | Custom split picker, unreachable. |
| `src/utils/exerciseReplacer.js` | no importers | Auto-replace of disliked exercises, unreachable. |
| `src/utils/exerciseStats.js` `detectPRs`, `getAllPersonalRecords`, `getExercisePR`, `getVolumeByDate`, `getExerciseHistory`, `getUniqueExercises`, `calculateVolume` | no call sites outside the file (`getExercisePR`, `calculateVolume` only used by dead helpers) | PR and history helpers, unreachable. |
| `src/components/dashboard/EngineStatusCard.jsx` | no importers | Unreachable. |
| `src/components/dashboard/HoldDeficitButton.jsx` | no importers (named only in a comment inside `HoldDeficitButton.jsx` itself) | Unreachable. |
| `src/components/dashboard/EaseTodayButton.jsx` | no importers | Unreachable. |
| `src/components/dashboard/PhaseRecommendationCard.jsx` | no importers | Unreachable. |
| `src/components/dashboard/SorenessCheckin.jsx` | no importers | Unreachable. |
| `src/components/dashboard/TrainingLoadTab.jsx` | no importers | Unreachable. |
| `src/components/progress/WeightProgressChart.jsx` | no importers (only mentioned in comments in `Today.jsx`) | Unreachable. |
| `src/utils/programProgression.js` `hasWidespreadStalling` | no importers | Unreachable. |
| `showLocalNotification` in `src/hooks/usePushNotifications.js:80-89` | no callers outside the hook's own return value | Unreachable in practice. |
| Set-grid E1RM column (comment `ExerciseCard.jsx:248-251`) | comment only, no rendered cell | Stale comment. |

Reachable but worth knowing: `CalculatorsModal` (plate calculator, 1RM calculator) is reachable from the Quick Add menu, not from the logger.

---

## Verification of prior audit leads

Checked against source. Only items relevant to training are listed.

- `LOGGING_UX_AUDIT_2026-10-13.md` item 5, "Reps prefilled with 0": **confirmed** for quick sessions with no history (`src/hooks/useWorkoutExercises.js:172`; rendered `ExerciseCard.jsx:1113`). Not present for prescribed sessions (`QuickWorkout.jsx:50-80`) or program mode.
- LOGGING_UX_AUDIT "Not yet covered: programmed workouts (`WorkoutDetail.jsx`)" for the "All sets done" prompt: **outdated**. The prompt exists in WorkoutDetail (`WorkoutDetail.jsx:1248-1260`, `:2036-2060`).
- LOGGING_UX_AUDIT competitor list (MacroFactor features, RP, STNDRD, Strong/Hevy, Liftoff): **not verified here**. The audit itself says these are thin and vendor-derived. This pass did not browse competitor sites; the inventory above is the input a comparison needs.
- LOGGING_UX_AUDIT item 1 ("four stacked layers before the first exercise, two back chevrons"): consistent with `WorkoutLoggingHeader.jsx` (timer bar with back) plus a page title; the "QUICK WORKOUT · 0/1 SETS" strip and "Rename session" row were not re-read here.
- `UI_UX_AUDIT_2026-10-12.md` and `EDGE_CASE_AND_COMPETITOR_AUDIT_2026-10-12.md`: not re-verified in full. Only headings were skimmed. Not used as evidence.
- `SCIENCE_ALIGNMENT.md` `[DONE]` markers: not checked (not in scope for the UX inventory).

---

## Competitor-comparison hooks (what to compare, by feature)

Each row is what the code does, so a competitor can be checked against the same thing.

| Feature | OptiGains today | Evidence |
|---|---|---|
| Prev / last-time per set | One heaviest-set value per exercise, same in every row, tap-to-copy | `exerciseStats.js:428-462`, `ExerciseCard.jsx:1039-1053` |
| Per-set previous (by set index) | Not present | — |
| Warm-up sets | Not generated; no set type | grep `warm` in `src/` |
| Supersets / circuits | Not present | grep `superset|circuit` |
| Rest timer | Yes, in header pill; +/-10, +30, skip; no sound/vibration at end | `WorkoutLoggingHeader.jsx:234-281`, `QuickWorkout.jsx:356-402` |
| Background rest alert | Programmed workouts only (SW), not free sessions | `WorkoutDetail.jsx:808-845`, `sw.js:115-170` |
| Plate calculator | Yes, outside logger (Quick Add > Calculators) | `CalculatorsModal.jsx:16-148` |
| e1RM | Logger best-set and sparkline (Epley, RIR ignored); Lifts page per lift | `exerciseStats.js:219-260`, `Lifts.jsx` |
| PR detection and PR UI | Not present (helpers dead) | `exerciseStats.js:97,166` |
| Finish summary | None; toast and navigate | `QuickWorkout.jsx:463-464`, `WorkoutDetail.jsx:1005-1027` |
| Volume vs last time | In-workout vitals only, delta % vs first N sets of last session | `ExerciseCard.jsx:170-208, 1262-1270` |
| Haptics | None | grep `vibrate` (notifications only) |
| Sound | None | grep `Audio` / `.mp3` (none) |
| Celebration animation | None | `index.css:694-731` (no confetti) |
| Program builder | Cycle-day grid, drag-drop, progression preview | `ProgramBuilder.jsx:1407-1450` |
| Program import / export | JSON only | `programIO.js:28-151`, `Workouts.jsx:528-534` |
| Deload / mesocycle controls | Modal exists but unreachable | `ProgramDurationModal.jsx` (no importers) |
| Exercise swap | Free-text, mid-session, keeps completed sets | `ExerciseCard.jsx:1329-1365`, `WorkoutDetail.jsx:1100-1150` |
| Progression engine | Client-side fixed rules | `programProgression.js:4-8, 136-238` |
| Why a load was prescribed | One rationale line, focus split, intensity multiplier on card; none on logger | `PrescribedSessionCard.jsx:509-524, 62-74` |
| In-session coaching chips | QuickWorkout only, phases 2-3 by RIR session count | `coachingEngine.js:10-11, 195`; `QuickWorkout.jsx:850` |
| Form review (video) | Coach page, LLM edge function | `Coach.jsx:85-101` |
| Offline logging | Not supported; Supabase calls not cached | `sw.js:36` |
| Installable PWA | Manifest with missing PNG icons | `public/manifest.json`, `index.html:34` |
| Home-screen widget / Live Activity | Not present | grep `widget|live activity` |
| Push reminders | Senders exist in edge functions; schedule not verified | `supabase/functions/send-*` |

### Gaps (whole document)
- No on-device or simulator check in this pass.
- No competitor sources were fetched; the comparison column is the OptiGains side only, as requested.
- Did not read `Workouts.jsx`, `WeeklySchedule.jsx`, `ProgramDetail.jsx`, or `AthleteState.jsx` line by line; their claims above are limited to the lines cited.
