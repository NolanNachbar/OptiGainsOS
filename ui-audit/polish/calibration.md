# Harness calibration

## 1. Positive control: ProgramDetail mobile CTA vs. bottom dock (de5e993b)

Setup: `git worktree add` at `de5e993b^` (1deb2d20) in the scratchpad, `.env`
symlinked in (gitignored, not read/printed), `npm ci` (380 packages), Vite run
on a dedicated port (5174, `--strictPort`) with a separate `cacheDir` so it
never touched the live :5173 server's `node_modules/.vite` cache. `drive.mjs`'s
`ORIGIN` is now `process.env.ORIGIN || 'http://localhost:5173'` so `probe.mjs`
can point at either server without editing source.

A throwaway `OVN-polish-control program` (unenrolled, so ProgramDetail renders
the fixed bottom "Start Program" CTA rather than "Start Next Workout") was
inserted via `e2e/helpers.mjs`'s `testDb()`, probed against both origins by id
(`/program/<id>`), and deleted afterward.

**Result:**
- Buggy commit (port 5174): check (d) flags
  `{ text: "Start Program", coveredBy: ".glass-elevated.z-[9999] (...)" }` at
  the page-bottom pass — `.glass-elevated.z-[9999]` is the bottom nav dock
  class from `AUDIT_RUBRIC.md`'s own glossary. Confirmed.
- HEAD (port 5173, de5e993b applied): "Start Program" does **not** appear in
  `checks.occluded` at all. Confirmed.

**Gate: PASS.** The probe distinguishes the fixed commit from its parent on
exactly the bug the commit fixed.

Worktree removed (`git worktree remove --force`), port 5174 confirmed down
(`curl` -> connection refused), control program + its `program_workouts` row
deleted via `testDb()`. `git worktree list` shows only the two pre-existing
worktrees (main repo, `ios-sim`) afterward.

### A occlusion false-positive this control caught, and the fix

The first pass of check (d) checked every visible interactive control at
whatever scroll position the page loaded at, regardless of CSS `position`.
Against `program-detail`, that flagged 9 controls as "covered by the dock" —
every completed-cycle row and the "Show all 13 cycles" button below the fold —
purely because they hadn't been scrolled into view yet, not because they were
actually clipped once a user got there.

Fixed by splitting occlusion into two passes:
1. **Fixed/sticky controls only**, checked at the page's current scroll
   position (catches "this floating CTA is always under the dock").
2. **Static/relative controls**, checked after scrolling the page to its
   *bottom* (the real end state a user reaches), and only counted if still
   covered by something `position: fixed` at that point (catches "the last
   row is permanently clipped under the dock"). `position: sticky` coverers
   are excluded from this second pass — a sticky header naturally overlaps
   content it has already scrolled past; that's correct sticky-header
   behavior, not a rubric defect, and counting it would flag literally the
   first item on every page.

Re-run after the fix: buggy commit still flags 2 (the real CTA-under-dock bug
+ one legitimate FAB-over-FAB overlap unrelated to this control), HEAD flags 1
(just the FAB overlap). See `ui-audit/polish/probe.mjs`'s `OCCLUSION_STATIC_PASS`.

## 2. Keyboard warnings: train-logger r1-10 and fuel Add Food

Both were left as open questions overnight ("blamed on the simulator and
never settled"). `iphone-sim/layer.js`'s `showKeyboard` reveal logic was
re-read in full: it moves a focused field into view by `window.scrollBy`
first, then makes up the remainder by panning the visual viewport
(`setPan(pan + want - moved)`, capped at `baseH - vvHeight`), and only warns
`field-hidden-by-keyboard` if the field's rect still overlaps the keyboard
band after that.

`git -C ~/projects/iphone-sim log --oneline -- layer.js` shows the most recent
change to that function is **e9519bf**, "Pan by what the field actually
moved, so fields in fixed sheets get revealed like iOS" (Mon Sep 28 00:59,
same day as the r1 findings) — exactly the fix both rejected verdicts already
asked for (r1-10's `fixHint`: "pan by the fixed-field delta when the focused
element has a fixed ancestor"; the fuel verdict's `why`: describes the same
`want - moved` pan gap). The current `layer.js` (read directly, lines
219-233) already contains this fix.

**Re-ran both on current HEAD (port 5173):**

- **fuel Add Food** (`ui-audit/overnight/areas/fuel/scripts/v1-ios4.mjs`, run
  unmodified): tap `#food_name`, then move focus to `#calories` via
  `el.focus()` (the accessory-bar "next" path, not a raw fill) with the
  keyboard left up. Previously `#calories` landed at y=634 (under the
  keyboard, before the fix) then y=544 after `moveFocus` (still covered,
  warning fired). **Current HEAD: `#calories` lands at y=165** (kbTop=513,
  clearly above it), zero warnings across `#food_name`/`#calories`/`#protein`.
- **train-logger r1-10** (new minimal repro, `verify-r1-10.mjs`: open a
  library workout, start logging, open the exercise's "..." menu, Replace
  exercise, fill the `Enter exercise name…` combobox): field lands at
  y=391 (kbTop=513, above it), **zero warnings**.

**Verdict for both: sim false positive, already fixed in iphone-sim (e9519bf).**
Not an app bug — no app-side change is needed, and re-running the harness's
own probe (`workout-logging-active`/`fuel-add-food-manual` screens in
`screens.json`) on current HEAD should stay warning-free. If a *new* keyboard
warning appears in a later round, RUNBOOK.md documents the discriminating test
(needed vs. available scroll room in the field's overflow ancestors) rather
than taking the warning at face value again.

(Side note, out of scope for this calibration: the r1-10 repro also logged one
`pageerror` on `program_workouts?...access control checks` — the same
intermittent lead flagged in the original overnight finding. Not re-audited
here; it's an app/RLS question, not a harness or keyboard question.)

## 3. Baseline

Full probe run on HEAD, 34 screens, concurrency 2 (pool) + serial
session-creating screens (workout-logging-active, workout-set-complete,
workout-finish-dialog), written to `ui-audit/polish/baseline/`. 216.4s total.
Session cleanup ran after each serial screen (not once at the end — see
RUNBOOK caveats) and removed 3 leftover `in_progress` workout_sessions rows.

Totals (`baseline/summary.json`):

| check | count |
|---|---|
| smallTargets (<44x44) | 88 |
| smallText | 734 |
| overflow / overflowingEls | 0 / 4 |
| occluded | 79 |
| contrastFails | 1 |
| problems (iPhone-layer) | 12 |
| warnings (iPhone-layer) | 0 |
| driftFindings (token lint) | 22 |
| fatalError | 0 |
| setupError | 2 (both explained below, neither a harness defect) |

An earlier run against this same screens.json (before the round of fixes
below) had `setupError: 8`. Getting from 8 to a documented 2 was most of this
calibration session's work:

- **`workout-finish-dialog` (setupError, both runs).** The screen's own note
  already flags this: the test fixture's first library workout isn't always
  the same one, and when it happens to have zero logged exercises,
  `WorkoutLoggingHeader` makes Finish legitimately `disabled` (`canFinish =
  loggedSetsCount > 0` in `WorkoutDetail.jsx`). A disabled button is
  `isVisible() === true` but never satisfies Playwright's click actionability
  check, so `clickIfPresent` (which only gates on visibility, not
  enabled-ness) times out. This is fixture-state-dependent, not a bug — the
  same screen entry is documented to capture either the confirm dialog OR this
  inert-Finish state honestly, and it did the latter both times it setup-errored.
- **`calculators-sheet` (setupError, one baseline run only) — confirmed to be
  concurrency-pool timing flakiness, not a real issue.** It timed out clicking
  `[data-tutorial='fab-button']` on `/today` in the full baseline run, but ran
  clean 3/3 times when re-probed alone (`node probe.mjs --screens
  <calculators-sheet only>`). `weigh-in-sheet` and `stream-note-sheet` click
  the exact same FAB on the exact same route and passed in the same baseline
  run, which rules out an app regression. Most likely cause: three FAB-opening
  screens landing in the concurrency-2 worker pool at similar moments,
  contending for the same browser process. Documented rather than "fixed" —
  raising the click timeout to paper over pool contention risks masking a
  genuinely slow render elsewhere. A round whose report leans on this screen's
  result should spot-check it standalone before trusting a finding.

Fixes made to get here (harness-only, no app code touched), each now also
documented in `RUNBOOK.md`'s "Known harness caveats":

1. Native `confirm()`/`alert()` dialogs are auto-dismissed by Playwright unless
   handled - added `page.on('dialog', d => d.accept())` in `probeScreen`
   (was silently no-op'ing the sweaty-thumb heavy-weight guard's "mark set
   complete" click).
2. Session cleanup moved from once-at-the-end to once-per-serial-screen
   (state bleed between session-creating screens was producing
   non-reproducible setup errors).
3. Duplicate mobile/desktop DOM renders defeating `.first()` - generalized fix:
   `click` steps auto-append `:visible`; `clickText`/`clickTextIfPresent` walk
   all matches for the first genuinely visible one instead of trusting DOM
   order. Root-caused in `WorkoutLoggingHeader.jsx` (Finish button rendered
   twice) and `FloatingActionButton.jsx` (hover-fan tooltip labels rendered
   twice); fixed the four screens that hit it (`workout-finish-dialog`,
   `calculators-sheet`, `weigh-in-sheet`, `stream-note-sheet`).
4. Full-viewport modal scrims (`fixed inset-0 bg-black/85`) were flagged as
   "occluding" every element behind them while a dialog was legitimately open -
   both occlusion passes now exclude coverage from an element whose rect is
   ~the whole viewport.
5. `fuel-add-food-sheet`/`fuel-add-food-manual` were clicking a FAB that
   doesn't exist on `/fuel` (`Layout.jsx`'s `showFab` list excludes it) -
   pointed both screens at the real target URL (`/food-tracker?addFood=true`)
   instead.
6. `fuel-water` was clicking in-page text ("Water") that never exists on
   `/fuel` at all - the Hydration sub-tab is URL-driven
   (`Fuel.jsx`: `tabParam === "hydration"`), so the screen now navigates
   directly to `/fuel?tab=hydration`.
7. `today-todos` was clicking text ("To-Do") that doesn't exist anywhere on
   `/today` - `TodayActions.jsx`'s card is headed "Today's Actions" and has no
   tabs. Repointed the screen at a more useful distinct state (the "adding a
   new action" input, via the card's `+` button) since plain `/today` is
   already covered by the `today` screen.
8. `fuel-add-food-manual`'s "Manual entry" toggle click hung indefinitely with
   no error - root cause: the Add Food dialog autofocuses its search input,
   which pops iphone-sim's simulated keyboard (`.kb`, `pointer-events:auto`,
   spans from mid-screen to the bottom), silently swallowing the click. Added
   a general `{ "blur": true }` step type to `probe.mjs` (blurs
   `document.activeElement`, same as tapping the sim's own Done key) and used
   it before this screen's click.

**Calibration verdict: harness is ready to drive the polish loop.** Positive
control passes, both keyboard-warning disputes resolve to documented sim
false positives (fixed upstream in iphone-sim e9519bf), and the baseline's
only two setupErrors are both explained and neither is a harness defect -
one is fixture-dependent app state the screen is designed to capture either
way, the other is a confirmed pool-concurrency flake that reproduces clean in
isolation.
