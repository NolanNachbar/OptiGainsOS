# Journey List (OptiGains)

Concrete journeys for the test/improve loop. Each is a sequence a subagent walks
against the running app (local Vite :5173, bypass auth, mobile 390x844 by default),
logging friction, screenshots, timings, and console errors, then scoring against the
criteria in the persona files and the surface map in `SURFACE_INVENTORY.md`.

Auth: bypass only (`localStorage.bypass_auth='true'`), never the real account. See
`harness.md`. Data: UI-AUDIT mode (empty, safe) by default; journeys tagged
[NEEDS-DATA] require POPULATED mode (local Supabase) and are otherwise marked
`[BLOCKED: needs local supabase]`.

How a loop iteration uses this file:
1. Start `npm run dev` (:5173). Confirm bypass works (load `/today?bypass_auth=true`).
2. Fan out one subagent per journey below; each owns an isolated headless context.
3. Each records: pass/fail vs criteria, where it stalled, timings, console errors,
   screenshots at every state; judges screenshots visually, mobile-first.
4. Adversarially verify each finding with a second agent before it counts.
5. Findings -> fix queue -> fix top confirmed issues -> re-run.

Severity tags: [BLOCKER] dead end / crash / data loss, [MOBILE] 390px layout, [A11Y]
target<44px / focus / contrast, [PERF] slow/jank, [TASTE] human eye, [DATA] integrity.

---

## New User (UI-AUDIT mode, empty data)

N1. Land cold on Today (P1) empty.
    Pass: heading + explanation + one primary CTA; no blank wall [BLOCKER if blank].
N2. Discover the FAB (O1) and open each of its 6 actions.
    Pass: FAB opens; all 6 labeled; each opens its flow; none dead-ends [BLOCKER].
N3. Walk every dock section empty (Today, Train P3-P6, Fuel P12-P13, Body P15-P17, Analyze P18-P20).
    Pass: every empty state has heading + line + CTA; none is a bare list/spinner [BLOCKER if blank].
N4. First-workout path: Today/FAB -> CreateWorkout (P7) or QuickWorkout (P10).
    Pass: reachable with no prior data; form renders; no dead end.
N5. First food + first weigh-in: FAB -> Log Food (O8), FAB -> Weigh In (O2).
    Pass: both overlays open and submit; bottom-sheet on mobile [MOBILE].
N6. 60-second coherence check: can the persona tell what the 5 sections are for?
    Pass [TASTE]: section purpose legible without a manual.

## Daily Athlete (POPULATED mode; [NEEDS-DATA])

D1. Open Today (P1) with a prescribed workout. [NEEDS-DATA]
    Pass: today's workout + readiness visible; one clear next action.
D2. Log the prescribed workout (WorkoutDetail P9): sets/reps/weight + rest timer (O23). [NEEDS-DATA]
    Pass: log a set in <= N taps with prefill; rest timer runs; heatmap updates [PERF].
D3. Quick-log off-plan (QuickWorkout P10). [NEEDS-DATA]
    Pass: prescribed + empty variants work; logs persist.
D4. Log food across a day (FoodTracker P12/P14, O8). [NEEDS-DATA]
    Pass: add is searchable/recent-first; macro bars update correctly [DATA].
D5. Weigh in (O2) + wellness (P13: water, supplements). [NEEDS-DATA]
    Pass: values save and reflect on Today/Body.
D6. Recovery glance (AthleteState P15, RecoveryDetail P16). [NEEDS-DATA]
    Pass: readiness/load render from real data; no stale zeros [DATA].
D7. Daily Brief (Insights P18). [NEEDS-DATA]
    Pass: brief reflects logged data; empty handled before data exists.
D8. Mid-log interruption: navigate away during D2/D4 and back. [NEEDS-DATA]
    Pass: zero entered data lost [BLOCKER if loss].

## Power User (UI-AUDIT mode mostly; some [NEEDS-DATA])

PU1. ProgramBuilder (P8) 4-step wizard + O16/O17/O18.
    Pass: state survives step nav + back; no dead end [BLOCKER]; enroll via P11.
PU2. RecipeBuilder (O13 2-step) create/edit + log (O14).
    Pass: create and edit reuse one form; wizard keeps state.
PU3. Meal templates (O10 apply / O11 edit / O12 save) + diet phase (O7) + TDEE (O15).
    Pass: each overlay opens/closes clean; scroll dialogs usable at 390px [MOBILE].
PU4. Calculators (O3: 1RM / working / plates).
    Pass: correct values for known inputs [DATA]; tabs switch cleanly.
PU5. Analytics + engine: AthleteState engine+load (P15), RecoveryDetail tabs (P16),
     BriefHistory (P19), Physique compare (P17 - camera idle only).
    Pass: render without unresolved spinner [PERF]; tabs work.
PU6. Long-tail CRUD: Mind (P20 books/skills O21), Career (P21 apps/contacts O20).
    Pass: create/edit/delete via O19 confirm; empty states designed.
PU7. Account + destructive gating: Profile (P22), DataExport, delete confirms (O19),
     account delete path.
    Pass: every destructive action gated by a confirm; account delete NOT executed [BLOCKER].

---

## Cross-cutting passes (run against every journey's screens)

X1. [MOBILE] Every overlay on mobile: is it a bottom sheet, not a centered modal? Track
    the known systemic ui/dialog.jsx issue ONCE; flag any overlay that also overflows.
X2. [A11Y] Every interactive target >= 44px; focus trapped in overlays; escape + backdrop
    close; visible focus ring; sufficient contrast.
X3. [MOBILE] Every page at 390x844: no horizontal scroll, no content under the dock/FAB,
    safe-area respected.
X4. [BLOCKER] Every screen has a clear next action; no dead-end blank state.
X5. [TASTE] Every loading state is a deliberate skeleton/spinner, not a flash or a frozen
    screen; empty != infinite spinner.
X6. [PERF] Each route's first meaningful paint and each overlay open is within budget;
    flag jank on the heatmap, charts, and lists.
X7. [TASTE] No emojis anywhere in UI or copy (project rule).
X8. Desktop pass: re-run key screens at ~1280x900; the sidebar layout and wider dialogs
    render correctly (FAB/dock are mobile; sidebar is desktop).
