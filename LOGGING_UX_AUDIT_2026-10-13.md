# Workout logging UX audit — 2026-10-13

Scope: the set-logging experience (Quick Workout / ExerciseCard / header /
keypad), plus a competitor comparison. This is **not** a re-run of the
app-wide pass in `UI_UX_AUDIT_2026-10-12.md`; read that for navigation, dock,
and form findings.

## Evidence and its limits

- **Our app:** real iOS Simulator screenshots from the prior pass
  (`ios-sim/out-uiux/keypad/`, production build `9116c0a`) and the code
  (`QuickWorkout.jsx`, `ExerciseCard.jsx`, `WorkoutLoggingHeader.jsx`).
- **Competitors:** thin. I could not install or drive any of them.
  - MacroFactor Workouts: official page lists features only (RIR, rest timers,
    supersets/myoreps, per-side tracking, plate calculator, warm-up
    suggestions, swaps). It does not describe the logging screen.
  - RP Hypertrophy: help center returned 403; no usable description.
  - STNDRD (Cbum): App Store marketing copy only ("distraction-free").
  - Strong / Hevy: third-party blogs say Hevy is fastest for the basic
    add-set/reps/weight flow and Strong is more granular. Vendor-adjacent.
  - Liftoff: nothing found.
  So the comparison below is a hypothesis list, not a teardown. The fix for
  that is screenshots from your phone of each app's logging screen.

## Findings in our logger (ranked)

1. **Chrome before content (High).** Four stacked layers before the first
   exercise: OS title bar ("Quick Workout"), timer bar (back, clock, Rest,
   Finish), a "QUICK WORKOUT · 0/1 SETS" strip, and a "Rename session" row.
   That is roughly 21% of the viewport. There are also two back chevrons
   (title bar and timer bar).
2. **Cards above the lifting (High).** The coach card sat above the first
   exercise and pushed it down about a quarter of the screen. An advisory
   should live inside the exercise it is about, collapsed to one line.
3. **Unlabeled icon row on every exercise (Medium).** Kebab plus three bare
   icons (help, swap, notes) between the title and the sets. Four controls,
   none labeled, on every card.
4. **Set row is cramped and risky (Medium).** Column header runs together
   ("SET PREV"), the done check is a small target, and the destructive delete
   X sits directly beside the primary done check.
5. **Reps prefilled with 0 and the field shows text-selection handles
   (Medium).** The 0 has to be cleared, and the selection handles read as a
   web page, not a native logger. Prefill from last session/target and make
   the field non-selectable behind the custom keypad.
6. **Keypad sheet covers the next set (Medium).** The bottom sheet takes the
   lower half and hides Add Set and the following rows. Weight, reps, RIR,
   then done is several taps per set.
7. **Dock and Safari chrome overlap Session notes (Low).** Seen in the 9116c0a
   build; the branch hides the dock on some routes, but I did not verify it
   on the logger.

## Changed today

- **"All sets done. Finish workout?" prompt** in Quick Workout
  (`logger-finish-prompt-2026-10-13`, local commit). Fires only when your tick
  completes the last set; "Not yet" closes it. It never finishes by itself.
  Not device-verified. **Not yet covered:** programmed workouts
  (`WorkoutDetail.jsx`), which have their own finish path.

## Proposed layout (not built)

- One compact bar: back, clock, rest, Finish. Drop the strip and the
  duplicate title; fold set progress into the bar's thin progress line.
- One-line set rows: `1  295×8 (ghost)  [295] [8] [RIR]  ✓`. Tap the check to
  complete with the ghost values; edit only when they differ.
- Move swap/help/notes into the kebab; keep only the exercise name and kebab.
- Keep Delete out of the row (swipe or the kebab).
- RIR as an optional inline stepper after the check, not a gate on it.
- Coach advice as a one-line chip on its exercise.

## Open questions

- Should Finish with incomplete sets also ask "N sets not done, finish
  anyway?" I could not confirm what it does today.
- Is the prompt wanted per exercise ("next exercise?") or only at the end of
  the workout? I built end-of-workout only.
