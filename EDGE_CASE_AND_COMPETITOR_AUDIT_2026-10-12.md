# OptiGainsOS Edge-Case, Nutrition and Competitor Audit - 2026-10-12

Method: iOS Simulator (iPhone 13 Pro Max, iOS 27) driven by Appium against a local build of branch
`uiux-fixes-2026-10-12` (the four UI fixes included), test account
`optigains-sim-test@example.invalid` only. Findings marked **live** were reproduced on-device
with a screenshot; **code** means verified by reading source but not reproduced live.
Screenshots: `ios-sim/out-edge/<run>/` (untracked). Flows: `ios-sim/flows/edge-*.json`,
driver `ios-sim/run-edge.mjs` (copy of `run.mjs` with button/keypad/eval steps).
No source code was changed, nothing committed.

## What passed

- Mid-session restore: an in-progress Quick Workout restored silently (timer continuous, sets intact)
  after a reload and on a brand-new browser origin (state is server-side). Never restarted.
- RIR keypad (fix 4): six pills 0, 1, 2, 3, 4, 5+ at about 44pt, Done inline, pill tap fills without
  finishing the set. `out-edge/01/04-rir-keypad.png`.
- Create Workout (fix 1): dock hidden, Cancel/Save bar sits alone, Sets/Reps/Rest row visible at
  first paint. `out-edge/15/01-create-initial-dock-hidden.png`.
- Dock clearance (audit finding 2 re-check): Fuel scrolled to the bottom clears the dock with room
  to spare. `out-edge/22/02-scrolled-entries.png`. That earlier finding was a false positive.
- Decimal weight (102.5) accepted; weight stepper (-5/+5) and "Use last set 295 by 8" shortcut exist.
- Rest timer starts automatically on set completion (2:58 countdown).
- Food delete shows "Entry deleted" with Undo. Today and Fuel macro numbers agree (1,800 kcal, 247 P,
  25 C, 63 F remaining, identical).
- Recipe Builder (code): name and at-least-one-ingredient validation, sticky macro bar with
  per-serving math, delete confirmation.

## Friction points, ranked

### High

1. **Swapping an exercise in a program workout deletes the original's progression state.**
   (code) `WorkoutDetail.jsx:1148-1159` calls `transferProgressionState`, which does
   `delete state[oldExerciseName]` (`programProgression.js`), and persists it immediately with no
   confirmation. The swap itself is session-only, so next week the original exercise has no
   `working_weight` or `ready_to_progress`, and the replacement inherits a weight from a different
   movement (a barbell weight onto a cable variant). Fix: keep the original's entry, store the
   replacement's under its own key, and only transfer when the user chooses "replace in program".

2. **Resuming a second program leaves two programs active, silently.** (live)
   Resume on "Strength + BUD/S Conditioning" produced a "Program resumed" toast, no confirmation,
   and `ACTIVE 2` on the Programs tab while the header still says "Active program: Powerlifting HF".
   Unclear which one drives Schedule and Today. Fix: confirm ("Pause Powerlifting HF and resume
   this?") or auto-pause the other and say so. `out-edge/13/01-after-resume-tap.png`,
   `out-edge/14/01-programs-after-switch.png`.

3. **One-tap "Log again" has no undo and no duplicate guard.** (live) Three taps on the Recent
   "Chicken Breast" chip logged three entries (493 to 1,479 kcal, protein flipped to 35 g over).
   The success toast has only a close button; delete has Undo, logging does not.
   Fix: Undo action on the log toast, plus brief disable or merge-into-quantity on rapid repeats.
   `out-edge/21/03-after-rapid-triple.png`.

### Medium

4. **Weekly training reads 0/7 right after a finished workout.** (live) Session card says "Logged
   today, nice work." while "This week 0/7 Workouts" is unchanged. Either quick workouts do not
   count toward the week or the card is stale; either way it contradicts the card above it.
   `out-edge/10/01-finish-tapped.png`.
5. **Meal auto-assignment is wrong at night.** (live) A food logged at 8:46 PM landed in Lunch
   (Edit sheet shows "lunch"). Fix: assign by time of day (Dinner after about 5 PM) or to the
   last-used meal.
6. **Edit Food Entry is the full Add sheet.** (live) Title says "Edit Food Entry" but the first
   screen is USDA search, Scan, and "Describe it" (AI estimate). Amount and Meal Type are below
   them, serving size is a second dropdown. Editing a serving needs a scroll. Fix: in edit mode
   collapse search/scan and lead with Amount and Meal. `out-edge/23/02-edit-sheet.png`.
7. **Prefilled sets complete with one tap and look identical to entered values.** (live) Set 2
   completed at 102.5 x 8 with reps never touched, because reps were carried from the previous set.
   A set also sat completed with 0 reps (green check plus "Where did it stall?"). Fix: dim
   prefilled values until touched, and require reps > 0 to complete.
8. **Finish is instant and silent.** (live) No confirm, no summary (volume, duration, PRs,
   comparison to last time), lands on Today with a toast overlapping the dock. Wins are the
   retention loop in Hevy and Strong. PR computation exists (`exerciseStats.js getExercisePR`),
   so the data is there; no celebration was observed (this session was not a PR).
9. **"Cancel workout" lives in the per-exercise kebab** next to Calculators, in red. (live, not
   tapped) A destructive session-level action inside an exercise-level menu is a misfire risk.
   Move it behind the header or the Finish area with a confirm.

### Low

10. Weight entry silently clamps 99999 to 2000, then raises a native iOS `confirm()` ("2000 lbs is
    much heavier than your last 295 lbs. Save it anyway?"). (live) Protective, but the clamp is
    invisible and the dialog is unbranded. `out-edge/03/04-set2-absurd-weight-done.png`.
11. Create Workout empty save shows Safari's native "Fill out this field" bubble, one field at a
    time. (live) `out-edge/15/03-create-empty-save.png`. Inline errors would be clearer.
12. Label accuracy: Program Builder "28 TOTAL TRAINING DAYS" counts rest days (cycle 7 x 4); program
    detail says "132 training days" next to "10/91 workouts". (live)
13. Program Manage menu offers Pause, Cancel, Edit, Export, Delete; Pause vs Cancel vs Delete
    semantics are not explained. (live) `out-edge/27/04-manage-open.png`.
14. Macro targets do not reconcile with the calorie target: 247 P x 4 + 25 C x 4 + 63 F x 9 =
    1,655 kcal against a 1,800 kcal target. (live arithmetic) Could be intentional slack; if so,
    label it.
15. Recipe servings are integer-only (min 1, step 1), so half servings are impossible.
    (code `RecipeBuilder.jsx:1129-1146`)
16. iOS text-selection handles appear on keypad fields when tapped. (live) Likely an Appium tap
    artifact; confirm with a finger.

## Not covered (be honest about gaps)

- Search food / USDA lookup, custom food entry, barcode scan (needs camera permission and a real
  barcode), "Copy a day", quick-add of raw calories, unit switching: typing into the iOS keyboard
  through the harness is unreliable (text landed in the wrong field), so these were assessed from
  code and screens only.
- Create Workout save, Library run, reorder; Program Builder steps 2-4 and abandon; recipe
  create/log on-device; supplements (the clone has none configured); past/future date navigation.
- Quick-add "Analyze" entry and Training Focus slider drag were not exercised on-device.
- Harness collision: another worker rebuilt `dist/` with the GitHub-Pages base path and drove the
  same simulator mid-run, which caused a white-screen episode (assets resolved to HTML) and WDA
  connection flakes. This was environmental, not an app bug. I served an isolated build on :4180.

## Competitor comparison

Competitor facts are from web search (vendor pages and help centers; marketing claims treated as
such). RP details come from third-party summaries and are lower confidence.

| Capability | OptiGainsOS | Best-in-class | Verdict |
|---|---|---|---|
| Taps per set | About 4 (reps, Next, RIR pill, Done); "Use last set" is 1 | Hevy/Strong: prefill + 1 tap | Match |
| Previous performance | Prev column, volume vs last, e1RM best set | Hevy/Strong same | Match |
| Rest timer | Auto-starts on set done | Hevy: configurable default, Watch | Match |
| Plate calculator | In Calculators modal (lbs and kg plates) | Hevy, Boostcamp free tier | Match |
| Warm-up sets | No generator found in code | Hevy percentage warm-ups, Boostcamp templates | Lag |
| Supersets | Not in the live logger (only a draft util reference) | Hevy, Boostcamp | Lag |
| PR detection | Computed (`getExercisePR`); no finish celebration observed | Hevy live PR notifications | Lag (UI) |
| Finish summary | None | Hevy/Strong summary screen | Lag |
| Exercise swap | Replace in menu; state handling risky (finding 1) | Fitbod auto-substitution | Match, flawed |
| Programs / mesocycles | Multi-cycle programs, builder, JSON import, deload tags | RP mesocycles + volume landmarks; Boostcamp programs | Match |
| Auto-regulation | RIR-based progression and deload advisory, engine weights | RP (pump/soreness/performance), Fitbod algorithm | Lead for RIR-driven strength |
| Training-focus control | Strength/Hypertrophy/PST sliders | Few apps expose this | Lead |
| Charts / analytics | e1RM, weight, recovery, load charts | Hevy graphs | Match |
| Offline | Service worker present; server-side draft (cross-device restore works) | Hevy/Strong native offline | Match (PWA limits) |
| Apple Health / Watch | Garmin/Apple Health fallback in recovery only; no Watch | Hevy Watch app | Lag, low relevance |
| Export | DataExport (CSV/JSON) | Hevy/Strong export | Match |
| Nutrition logging speed | 1-tap Recent chips, search, scan, "Describe it" AI | MacroFactor Speed Index, AI describe, voice | Match |
| Barcode | Present (Open Food Facts) | MacroFactor verified 1.15M DB + label scanner | Match, DB trust unknown |
| Food database | USDA + Open Food Facts | MacroFactor verified-only | Lag on verification |
| Recipes | Builder, per-serving math, log to meal | MacroFactor same plus plate | Match (no half servings) |
| Copy meal/day, templates | "Copy a day", save meal/day template | MFP/MacroFactor | Match |
| Macro budget visualization | Remaining/Consumed toggle, 7-day bars, pace | MacroFactor similar | Match |
| Adaptive expenditure | Engine-side targets (daily cron) | MacroFactor adaptive TDEE | Match in concept |
| Undo on log | None for log, yes for delete | MacroFactor undo | Lag (finding 3) |
| Hydration / supplements | Water presets, supplement stack | MFP water | Match |

## What matters for this user (single athlete, strength + hypertrophy + BUD/S PST)

Matters: finish summary with PRs (motivation, closes the loop), warm-up generator for heavy
bench/squat days, and supersets for the accessory blocks. Also trustworthy program/progression
state (findings 1 and 2), since the whole product is progression.

Does not matter: Apple Watch, social feed, public program marketplace, multi-user features,
large verified food DB (single user eats a short rotation; Recent chips cover it).

## Prioritized recommendations

1. Stop the progression-state deletion on swap (finding 1). Data-integrity bug, small fix.
2. Confirm or auto-pause on program resume; show which program drives Today (finding 2).
3. Undo on food log, brief duplicate guard (finding 3).
4. Finish summary screen with volume, e1RM change and PR badges; fix the 0/7 weekly counter
   (findings 4, 8).
5. Meal-by-time default and an edit-mode food sheet (findings 5, 6).
6. Dim prefilled set values; require reps > 0 (finding 7).
7. Warm-up set generator and superset grouping in the logger.
8. Polish: move "Cancel workout", inline validation on Create Workout, label fixes, half servings.
