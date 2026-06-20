# Daily Athlete QA Pass — 2026-06-20

Diagnose-only mobile pass (390x844) of journeys D1-D8 against local seeded Supabase
(athlete@local.test). Real persistence. Screenshots under `personas/findings/shots/`.
No app code was changed.

## Per-journey verdict

| # | Journey | Verdict | Why |
|---|---------|---------|-----|
| D1 | Today with prescribed workout | PARTIAL | Renders with readiness 78 + data, but "No session prescribed yet" (program_workouts empty seed) and the one clear next action is ambiguous (coral CTA is morning check-in, not training). |
| D2 | Log the prescribed workout | FAIL [BLOCKER] | "Workout in progress" banner dead-ends to a blank screen; "Start Logging Workout" CRASHES the page with a React error. Could not log a set, rest timer, or heatmap. |
| D3 | Quick-log off-plan | PASS | Full flow works: readiness check-in (bottom sheet), exercise autocomplete, prefill from history ("Last 285x5"), mark complete, Finish persists ("Workout logged successfully"). No rest timer present. |
| D4 | Log food across a day | PASS | Add Food bottom sheet with USDA search + Recent + My Foods. Added "Oats, Whey & Blueberries"; macro bars updated correctly (P 52→94, C 65→139, F 14→30; kcal 550→1162). |
| D5 | Weigh in + wellness | PASS | Weigh-in sheet saved 182→183 (reflected on Today + Body). Hydration tab: water +250ml (750→1000), supplements log. All persist. |
| D6 | Recovery glance | PARTIAL | `/recovery` renders real data well (Readiness 78, Body Battery 70, Sleep 86, ACWR). But the DOCK "Body" target `/athlete-state` shows "analysis is being computed" + empty sections, so the one-tap recovery glance lands on the emptier page. |
| D7 | Daily Brief | PASS | Today + Insights show deliberate "No AI Brief Yet" empty state; "View Past Briefs" → real prior briefs (Fri Jun 19) reflecting logged data. Today's brief needs Desktop Agent (DATA gap, not a UI bug). |
| D8 | Mid-log interruption | PASS | QuickWorkout: entered Deadlift 405 lbs, navigated to Today, returned → "Resume Workout?" sheet → Resume restored Deadlift @ 405. ZERO data loss on this path. (Could not test the prescribed/WorkoutDetail path — it crashes, see D2.) |

## Findings by severity

Counts: BLOCKER 2 · DATA 3 · MOBILE 1 · TASTE/UX 4 · PERF 1

---

### [BLOCKER] 1. "Start Logging Workout" crashes the logging screen
- Surface: P9 WorkoutDetail (`/workout-detail?id=...`), logging mode
- File: `src/pages/WorkoutDetail.jsx` (error boundary trips at component render)
- Screenshot: `shots/d2-logging.png`
- Console: `Objects are not valid as a React child (found: object with keys {reps, weight, completed, set_number}). If you meant to render a collection of children, use an array instead.`
- Repro: Train → Library → any workout → View Details → "Start Logging Workout".
- Root cause (diagnosed): the seeded workout's exercise `sets` field is a NUMBER (a count, e.g. `sets: 1`), but the logging view expects `sets` to be an ARRAY of set objects. When logging starts, set objects `{set_number,weight,reps,completed}` are built and one is rendered directly into JSX instead of its fields. Data-shape mismatch between created-workout format (`sets: <number>`) and logging format (`sets: [ {...} ]`).
- Failed criterion: "Start and log the prescribed workout… log sets/reps/weight, use the rest timer, see the heatmap." The ENTIRE core training-log job is unusable from a saved workout.

### [BLOCKER] 2. "Workout in progress" banner on Today dead-ends to a blank screen
- Surface: P1 Today → routes to `/workouts/detail?id=null`
- File: `src/pages/Today.jsx:238-249`
- Screenshot: `shots/d2-workout-detail-null.png` (blank), console `No routes matched location "/workouts/detail?id=null"`
- Repro: Open Today (active session present in seed) → tap the coral "Workout in progress — tap to continue" banner.
- Two bugs compounded: (a) WRONG PATH — the link builds `/workouts/detail?...` but the registered route is `/workout-detail` (singular, no slash). (b) NULL ID — `activeSession.workout_id` is null, so even the path shape is `?id=null`. Either way React Router matches no route and renders a blank dark screen with no fallback/404.
- Failed criterion: "No loop step dead-ends; there is always a clear next action [BLOCKER]." The single most prominent CTA on the home screen is a dead end.

### [DATA] 3. program_workouts seed is empty → Today shows no prescribed workout
- Surface: P1 Today
- Screenshot: `shots/d1-today.png` ("No session prescribed yet")
- Known seed gap (per harness). Today falls back to "Run the engine… or start a session manually." D1's premise (a prescribed workout) can't be exercised. Not a UI defect on its own, but it removes the "Today knows what I'm doing" payoff and leaves two equal ghost CTAs instead of one prescribed-session action.

### [DATA] 4. Dock "Body" (/athlete-state) renders empty despite real recovery data existing
- Surface: P15 AthleteState (dock "Body" target)
- Screenshot: `shots/d6-athlete-state.png` vs `shots/d6-recovery.png`
- `/athlete-state` shows "Today's analysis is being computed" + "No strength data yet" + "No volume data this week" + "No PST data yet", while `/recovery` renders Readiness 78 / Body Battery 70 / Sleep 86 / ACWR from the same seed. The one-tap recovery glance from the dock lands on the emptier surface.
- Failed criterion: "readiness/load render from real data; no stale zeros [DATA]."

### [DATA] 5. Recovery SLEEP tab says "No sleep data yet" while Sleep Score shows 86
- Surface: P16 RecoveryDetail (`/recovery`), SLEEP tab
- Screenshot: `shots/d6-recovery.png`
- The readiness card reads Sleep Score 86, but the SLEEP detail tab reads "No sleep data yet — sync your wearable." Internally inconsistent; one of the two is wrong.

### [MOBILE] 6. Systemic: ui/dialog.jsx renders centered modals on mobile (tracked once)
- Surface: ~20 overlays via `src/components/ui/dialog.jsx`
- Per harness, tracked ONCE at the primitive level. NOTE: the daily-loop overlays I exercised (Add Food, Weigh In, QuickWorkout readiness check-in, Resume Workout) are all proper BOTTOM SHEETS, so the worst loop surfaces are already correct. The systemic centered-modal issue lives in other dialogs not on the core daily path.

### [PERF/TASTE] 7. Recharts ResponsiveContainer warning on Body/Fuel charts
- Surface: P12 Fuel Body tab, recovery charts
- Console (repeating): `The width(0) and height(0) of chart should be greater than 0… add a minWidth(0) or minHeight(200) or use aspect(undefined)…`
- Chart containers mount at 0x0 before measuring. Cosmetic console spam; watch for momentary chart collapse/jank on first paint.

### [TASTE] 8. Today's primary action is ambiguous (3 competing CTAs, none is "train")
- Surface: P1 Today
- Screenshot: `shots/d1-today.png`
- The only coral (action) CTA is "Start morning check-in." Training is split across two equal-weight GHOST buttons ("View engine state" / "Log a session"). For a persona whose job is "start today's workout," the coral discipline points at check-in, not the session. Reads as >2s to find the next training action.

### [TASTE] 9. Duplicate "Add Food" buttons, floating one overlaps a meal row
- Surface: P12 FoodTracker
- Screenshot: `shots/d4-fuel.png`
- Two "Add Food" buttons (top inline + floating bottom-right). The floating one sits on top of the "+ ADD ITEM" row of the breakfast card, creating a tap-collision zone in the thumb area.

### [TASTE] 10. QuickWorkout "Cancel" on a session with entered data has no confirm
- Surface: P10 QuickWorkout
- Repro: Enter set data → tap Cancel. No confirm dialog observed before discarding the in-progress session.
- Lower risk than D8 (the Resume prompt protects accidental navigation), but explicit Cancel with unsaved sets should gate. Worth a confirm given the "nothing ever lost" promise.

### [TASTE] 11. No rest timer (O23) anywhere in the logging paths reached
- Surface: P10 QuickWorkout (and P9 unreachable due to crash)
- Persona expects "rest timer auto-starts" after a logged set. QuickWorkout has no rest timer after marking a set complete. The prescribed-workout path that may host O23 could not be tested (crash).

---

## Sequencing / ordering (project-owner priority)

1. **Readiness check-in is gated BEFORE the workout, but is OPTIONAL and easy to skip blank.**
   QuickWorkout opens with "Readiness check-in (1-10)" before Start Session, which is the
   correct order (it seeds the session). BUT you can hit "Start Session" with nothing
   selected and no notes — the required-before signal is collected, then silently discarded.
   If readiness is meant to seed the session, an unselected value should block or default
   visibly, not pass through empty. (`shots/d3-quick-workout.png`)

2. **Post-session debrief field is shown DURING logging, at the bottom, before any set is done.**
   In QuickWorkout the "POST-SESSION DEBRIEF / Anything hard, easy, or painful? How did the
   session go?" textarea renders immediately when the first exercise is added — i.e. a
   post-session reflection is presented mid-session, before there's anything to reflect on.
   It belongs at Finish, not inline at set 1. (`shots/d3-exercise-added.png`)

3. **Today's action order puts "morning check-in" (coral) above the training action.**
   The home screen's visual priority (coral) is the morning check-in; the actual session
   start is demoted to ghost buttons below. For a training day the order/emphasis is inverted
   relative to the job. (Finding 8.)

4. **Recovery: the dock-reachable "Body" page is the empty/computing one; the populated
   recovery page (`/recovery`) is a second hop.** The glanceable summary is one tap deeper
   than the empty state. (Finding 4.)

---

## Prioritized fix queue (top 10)

1. [BLOCKER] Fix WorkoutDetail logging crash — normalize exercise `sets` (number vs array) before render; never render a set object directly. Unblocks D2 entirely. (`WorkoutDetail.jsx`)
2. [BLOCKER] Fix Today "Workout in progress" link — use `/workout-detail` (not `/workouts/detail`) and guard against null `workout_id`/`program_workout_id`; add a router fallback/404 so no path renders blank. (`Today.jsx:238-249`)
3. [DATA] Seed `program_workouts` so D1 (prescribed workout on Today) is exercisable; until then, make the no-prescription state offer ONE clear primary action.
4. [DATA] Make dock "Body"/AthleteState render the same readiness/load that `/recovery` already shows from seed (or route the dock "Body" to the populated surface).
5. [DATA] Reconcile Sleep: RecoveryDetail SLEEP tab shouldn't say "no data" when Sleep Score = 86.
6. [TASTE] Re-rank Today CTAs so the training action owns coral on a training day; demote/secondary the morning check-in.
7. [SEQ] Move QuickWorkout post-session debrief to the Finish step; stop showing it at set 1.
8. [SEQ] Enforce/visibly-default the pre-session readiness value so it isn't silently skipped.
9. [TASTE] De-duplicate Fuel "Add Food" or move the floating button off the meal "+ ADD ITEM" row.
10. [TASTE] Add a confirm to QuickWorkout Cancel when sets are entered; add a rest timer (O23) to the logging path.

## What worked well (do not regress)
- Daily-loop overlays are correct bottom sheets: Add Food, Weigh In, QuickWorkout readiness, Resume Workout.
- D8 data safety on QuickWorkout: navigate-away/return triggers a Resume prompt and restores entered weight. Zero loss.
- Food macro math is correct and live; weigh-in and water persist and reflect across Today/Body.
- Exercise autocomplete + "Last 285x5" history prefill make set logging fast.
- No horizontal scroll at 390px on any page checked; desktop (1280x900) sidebar layout is clean.
- Empty states (Daily Brief, recovery) are deliberate copy + CTA, not bare spinners.
