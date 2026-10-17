# OptiGainsOS UI/UX Audit — 2026-10-12

Scope: pure UI/UX (navigation, layout consistency, touch targets, information
hierarchy, form usability, error/empty states) on a real iOS Simulator
(iPhone 13 Pro Max, iOS 27) via Appium/XCUITest against the live production
deploy at `https://nolannachbar.github.io/OptiGainsOS/`, commit `9116c0a`.
Account: `optigains-sim-test@example.invalid` (sanitized clone of the real
athlete's data). This is a UI/UX-only pass — the prior audit
(`IOS_SIM_AUDIT_2026-10-12.md`) covered training-science/persona critique and
is not repeated here.

Screenshots and accessibility-tree dumps backing every finding live in
`ios-sim/out-uiux/{sweep,keypad,profile-focus}/` (untracked, same convention
as the existing `out/`, `out2/`, `out3/` run directories — not committed).
Flow scripts: `ios-sim/flows/uiux-sweep-1.json`, `uiux-keypad.json`,
`uiux-profile-focus.json`.

## Findings, ranked by severity

### 1. [High] Sticky form action bar hides active input fields — Create Workout
**Screen:** `/create-workout` · Evidence: `out-uiux/sweep/26-t-create-workout.png`

The `Cancel / Save Workout` bar is fixed to the bottom of the viewport. Below
it, the floating global dock nav (Today/Train/+/Fuel/Body) is *also* fixed.
Together they permanently cover roughly the bottom 20% of the screen. In the
captured screenshot, Exercise 1's `Sets`, `Reps`, and `Rest (sec)` input row
is rendered directly under that stack and is completely obscured — the field
labels are visible but the input boxes themselves are not, and there's no
indication to the user that scrolling further will reveal them (the page
doesn't auto-scroll past the sticky bar). For a form whose central purpose
is entering exercise contained in a repeating list, having the newest fields
routinely require blind-scroll-past-the-save-button is a real friction point.

**Contrast:** `/program-builder` (`out-uiux/sweep/20-n-program-builder.png`)
gets this right — it suppresses the global dock entirely while in its
step-flow and shows only its own single sticky `Next` bar. Create Workout
should adopt the same pattern (hide the dock while this full-screen form is
open), or at minimum add scroll-padding-bottom equal to the combined height
of both bars so the last fields in the list are reachable and visible without
guessing.

### 2. [High] Floating bottom dock overlaps page content on nearly every scrollable screen
**Screens:** Today, Train › Schedule, Train › Programs, Fuel › Today,
Fuel (food log), Weekly Schedule, Coach — at minimum.
Evidence: `04-b-today.png`, `06-c-train-schedule.png`, `09-e-train-programs.png`,
`11-g-fuel-today.png`, `14-i-food-tracker.png`, `19-m-weekly-schedule.png`,
`17-k-coach.png`.

The floating pill-shaped dock nav sits on top of page content instead of the
page reserving space for it. On every one of the screens above, the last
visible content row before the viewport's natural end is partially or fully
covered by the dock: Today's "To do" add-item row, Train's next-program
card description, the food log's Breakfast/Lunch "+ add" rows, Weekly
Schedule's workout preview, and Coach's "Fix, in order" description all get
clipped. Users have to know to keep scrolling past where the page visually
appears to end. This is a single root cause (missing bottom padding/safe-area
inset on the scrollable content equal to the dock's height) showing up
repeatedly — fixing it once in the shared layout wrapper fixes all of these
screens at once.

### 3. [Medium] "Analyze" (Insights) tab is missing from the primary dock
**Screens:** compare `18-l-athlete-state.png` (Body tab active, dock shows
Today/Train/+/Fuel/Body — 5 items) vs. `15-j-insights.png` (dock shows
Today/Train/+/Fuel/Body/Analyze — 6 items, only when already on `/insights`).

On every other screen in the sweep, the dock has a fixed 5-item set. Landing
directly on `/insights` (the "Analyze" section — daily coaching brief, brief
history, Mind & Learning) is the only place "Analyze" appears as a dock item.
There's no way to discover or navigate to this section from the other four
tabs' dock — the only route in is a saved link/bookmark or typing the URL.
If this section is meant to be part of the core nav, it should appear
everywhere; if it's intentionally secondary, it needs a visible entry point
from somewhere (e.g. Profile, or a sub-nav inside another tab), because right
now it's effectively orphaned, which is the same IA problem already flagged
for `/career` in `App.jsx`'s own code comment (search `IA-ORPHAN`).

### 4. [Low] RIR pills are narrower than Apple's 44pt touch-target minimum
**Screen:** Quick Workout → exercise logging RIR sheet.
Evidence: `out-uiux/keypad/11-d-rir-screen-before-tap.png`, accessibility
dump shows each `RIR 0`…`RIR 6+` button at **37–38pt wide** (52pt tall) on a
428pt-wide screen, packed edge-to-edge with no gap between adjacent pills.
`Done` is comfortably sized at 96×52pt.

This was already a reasonable design tradeoff pre-fix (7 discrete values +
Done need to fit one row), and the fix in commit `716cb97` is confirmed
working correctly on-device (see Fix Verification below) — this is a
pre-existing sizing note, not a regression. Still, 37pt is noticeably under
the 44pt HIG guideline, and the pills sit flush against each other, so a
slightly-off tap on "2" can land on "1" or "3". Consider either a small gap
between pills or collapsing adjacent low-value pills (0/1) into a single
wider target if a design pass touches this sheet again. Low severity because
the fix verification run didn't produce a single mis-tap.

### 5. [Low] Schedule duplication between `/weekly-schedule` and `/train?tab=schedule`
**Screens:** `06-c-train-schedule.png` vs `19-m-weekly-schedule.png`.

Both routes render what is visually the same weekly list (same day rows,
same "Up Next" card, same week-nav arrows) under different page chrome (one
has the Schedule/Library/Programs/Activity sub-tabs, one doesn't). If
`/weekly-schedule` exists only as a legacy/deep-link target, that's fine and
not worth touching; if it's meant to be a distinct destination, right now a
user bouncing between Train's Schedule tab and a Weekly Schedule nav entry
(if one exists) would see near-identical screens and reasonably wonder why
there are two.

### 6. [Info] Coach deload advisory appears divorced from its subject exercise
**Screen:** Quick Workout, building a Bench Press set.
Evidence: `06-b-exercise-card.png`.

A "Machine Incline Press: RIR 0.0 and e1RM trending down over 3 sessions.
Deload weight: 242.5" card renders at the top of the session while the user
is actively adding **Bench Press**, with `Use 242.5 lbs` / `Keep my plan`
buttons. The advisory is legitimate (this is the fixed deload logic from
`coachingEngine.js` firing correctly on real declining e1RM data — see Fix
Verification #1 below), but it's shown globally at the session level rather
than attached to the Machine Incline Press exercise card specifically. A
user who hasn't added that exercise yet this session has no exercise card to
anchor the advisory to, so it reads as commentary on whatever they're
currently doing (Bench Press) until they read closely. Consider showing it
only once that exercise is actually added to the session, or labelling it
more prominently as "upcoming in your plan" rather than floating at the top.

## Fix verification (from the prior session's four fixes)

| # | Fix | Verdict | Evidence |
|---|---|---|---|
| (a) | Deload only fires on declining e1RM, not stable RIR-0 alone | **Pass (observed live)** | The "Machine Incline Press… e1RM trending down over 3 sessions" card in `06-b-exercise-card.png` is exactly this logic firing correctly on the cloned athlete's real historical data — it's a legitimate declining-trend deload, not a false positive from RIR-0-alone. |
| (b) | KeypadSheet RIR layout matches weight/reps visual language, Done inline | **Pass** | `11-d-rir-screen-before-tap.png` / `13-e-rir-screen-after-tap-pill-2.png`: RIR options render as one unified pill row with `Done ✓` inline at the end, not a separate full-width bar underneath. |
| (c) | Tapping an RIR pill fills the buffer without auto-closing/auto-completing the set | **Pass** | `13-e-rir-screen-after-tap-pill-2.png` shows RIR "2" selected, buffer updated, sheet still open, row's Done checkbox still unchecked — confirms the set is not auto-finished by a pill tap. Explicitly tapping "Done, mark set complete" afterward correctly completed the set with RIR persisted (`16-g-set-finished.png`), and even surfaced a nice contextual "Where did it stall? Lockout / Off the chest" follow-up once RIR 0 was logged — a good existing UX detail worth highlighting positively. |
| (d) | `programProgression.js` accessory (rir_target=0) progression logic | **Not directly observable** | Requires multi-session historical data to trigger; not reachable in a single live pass without seeding specific logs. No live evidence of a regression either. |
| (e) | Profile "Training Focus" sliders render, draggable, save bar works | **Partial pass** | Renders correctly and clearly: three sliders (Strength 30 / Hypertrophy 45 / PST-Conditioning 25), each with an explanatory subtitle, intro copy, and a "Reset to default" button (`03-b-training-focus-open.png` in `out-uiux/profile-focus/`). **Could not verify drag interaction or the save bar appearing on change** — the test harness only supports tap-based interaction (`tapText`), not drag gestures, so adjusting a slider value and confirming the save bar triggers is outside this automation's capability. Recommend a quick manual check on a real device/finger.

## Harness note (not a product issue)

One early flow attempt (`uiux-keypad.json` v1) tried `tapText("8")` to enter
reps on the reps keypad. The driver script's `findNative()` prioritizes
matching `TextField`/`TextView` elements by `placeholderValue` before it
checks buttons — the Reps field's `placeholderValue="8"` (its previous
session's value, shown as a hint) matched before the actual digit-8 button
did, so the tap landed on the (already-focused) text field instead of the
keypad key. Reps ended up logged as 0 for that one test set. This is a
limitation of `ios-sim/run.mjs`'s element-matching order, not an app bug —
flagging here so it isn't mistaken for a reps-entry defect if this file is
read in isolation.
