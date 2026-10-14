# CBum addendum — real device, fresh data, 2026-10-12

Companion to `cbum-training.md` and `cbum-nutrition-body.md` (branch
`overnight-audit-2026-09-27`, driven through Playwright's emulated-iPhone layer
against a frozen late-June test account). This pass used the actual iOS
Simulator (iPhone 13 Pro Max, iOS 27, real Safari/WebKit via Appium+XCUITest —
`ios-sim/run.mjs`) against the live deployed site, logged in as
`optigains-sim-test@example.invalid` — a clone of Nolan's real account made
**this week** (`ios-sim/clone-test-user.mjs`), not a June snapshot.

**What this changes:** every `[snapshot]`-tagged number in the two source
docs was a guess about what the live app would show. This pass confirms some
of them directly, on real device glass, with current data — and turns up two
findings neither prior pass had: no UI path to the "goal_prio" lever CBum's
doc assumed existed somewhere, and a hands-on problem with the RIR input
itself, not just what the engine does with it.

---

## 1. Confirmed, live, with fresh data

**Finding #2 (the progression coach fights the engine) — still true, not a June
artifact.** Screenshot: `ios-sim/audit/rir1/01-qw-landing.png`. Opening Quick
Workout today (October data, not June) shows, unprompted:

> COACH — Machine Incline Press: last 3 sessions averaged RIR 0.0. Deload
> weight: 242.5.

That is `programProgression.js`'s RIR-based deload rule firing on an exercise
whose own `rir_target` is 0 (trained to failure by design), exactly as
`cbum-training.md` §2 traces through the source. Six weeks and a full data
clone later, it says the same wrong thing. This is not stale test-fixture
noise — it is the live coach, live.

**Finding #1 (experiments/analysis invisible) — confirmed structurally.**
`/insights` (screenshot `ios-sim/audit/sweep2/14-insights.png`) is still just
Daily Brief + a "Mind & Learning" link. No training analysis, no experiments
list, no per-exercise history, exactly as documented. There is no
`/experiments` route and nothing in the five-tab dock (Today/Train/Fuel/Body +
the hidden Analyze tab) points at one.

**New data point, not in the original doc — the engine state pipeline is
cron-only, tied to one hardcoded user.** `/athlete-state` → State tab
(`ios-sim/audit/sweep2/12-athlete-state.png`) reads "No analysis yet" even
though this account has 129 real cloned workouts and 2.6M lbs volume
(Profile screen, `ios-sim/audit/sweep2/15-profile.png`). That's because
`athlete_state` rows are computed only by the GitHub Actions cron against
Nolan's real `USER_ID` — cloning workout/food/program rows doesn't make the
engine run for the clone. This is expected given `CLAUDE.md`'s "Private,
single-user training engine" framing, not a bug, but it means this pass (and
any future one using this cloning method) **cannot** visually verify anything
downstream of `athlete_state`: the muscle volume table, strength-goal e1RM
cards, readiness, or the daily brief. Those findings in the source docs remain
code-verified only, not re-confirmed live. If a future pass wants to see them
live, `clone-test-user.mjs` needs to also run `compute_athlete_state.py`
against the clone's ID once, or the frontend needs reading against Nolan's
real (read-only) account — neither was in scope here.

---

## 2. New finding: there is no UI path to change training focus at all

Nolan asked directly: "how do I adjust how focused I am on powerlifting vs
bodybuilding vs cardio?" The honest answer, traced through both source and
live device: **you can't, anywhere in the app.**

- `user_profiles.training_phase` is read by the engine
  (`compute_athlete_state.py:805`) and drives `default_goal_priorities()`
  (`scripts/engine/allocator.py:91-99`, strength/hypertrophy/pst weights). It
  has **zero** writers anywhere in `src/` — grep confirms no component ever
  sets it.
- `user_profiles.muscle_emphasis` — the jsonb `cbum-training.md` #7
  recommended exposing as Profile sliders because "the jsonb already
  exists" — has **zero** references anywhere in `src/`, read or write. It
  isn't surfaced at all, in either direction.
- Live confirmation: Profile (`ios-sim/audit/sweep2/15-profile.png`) has
  exactly three sections — Identity, Body & Nutrition, Settings — plus Sign
  Out. Nothing resembling a training-focus or muscle-priority control exists
  on any of them (checked via accessibility dump,
  `ios-sim/audit/sweep2/16-profile.xml` — no "phase," "focus," "emphasis"
  or "priority" labels anywhere in the tree).
- The only adjustable "phase" in the UI is `diet_phase` (cut/maintain/bulk,
  `PhaseRecommendationCard.jsx`) — nutrition, not training. It is explicitly
  **not** `training_phase` (the component's own comment draws this
  distinction, line 40-41).
- What *does* exist: switching which **program template** you're following
  (Train → Programs → "+", or "Resume" on a paused program —
  `ios-sim/audit/switch1/01-past-program-detail.png` shows a paused "Strength
  + BUD/S Conditioning" program sitting alongside the active "Powerlifting
  HF" one, fully resumable). That changes which static block of sessions you
  follow. It does **not** touch `goal_priorities`, which is what actually
  steers the adaptive engine's strength/hypertrophy/conditioning balance. A
  user can swap workouts; they cannot tell the brain what to optimize for.

**Fit:** Core. The app's entire pitch is "run experiments, find what works,
converge on the right split for you" — and the one dial that would let an
athlete declare "I'm done peaking strength, go hypertrophy-primary now" has no
handle anywhere a user can reach. Right now that value can only be changed by
someone editing the database directly.

**Concrete change:** a training-focus control in Profile (even a simple
3-slider or preset picker: Powerlifting / Bodybuilding / Conditioning,
writing `user_profiles.training_phase` and/or `goal_priorities` directly) is
higher priority than most of the items already ranked in `cbum-training.md`
— it's not a missing readout, it's a missing steering wheel.

---

## 3. New finding: RIR entry breaks the input pattern it just taught you

Scope addition from Nolan: "I'm not a fan of how RIR logging currently
works." Traced in source (`ExerciseCard.jsx`) and confirmed live,
tap-for-tap, logging a real set on the test account.

**What's wrong now**

Weight and reps share one input pattern — a bottom-sheet numeric keypad, 9
digits in a 3-wide grid, a tall "Next"/"Done" button anchored in a narrow
column on the **right edge**:
- `ios-sim/audit/rir4/01-a-weight-keypad.png` — weight: digits + right-column Next.
- `ios-sim/audit/rir4/02-b-reps-keypad.png` — reps: **identical layout**, same
  right-column Next, same key positions. Two fields of pure muscle memory.

Then RIR, `ios-sim/audit/rir4/03-c-rir-screen.png`: the digit grid is gone.
In its place, 7 color-coded pills (0 red, 1-2 amber, 3-4 green, 5-6+ blue).
The confirm button is no longer a narrow right-column strip — it's now a
**full-width button at the bottom** labeled "Done ✓." Tapping a pill doesn't
fill a buffer the way a digit does; it **immediately commits the value and
finishes the set in one tap** (`pickRir()`, `ExerciseCard.jsx:1649-1655`),
whereas weight/reps require digit-then-explicit-advance. Source:
`ExerciseCard.jsx:1599-1600` ("RIR uses the pill strip, not digits") and
`:1637` confirms RIR is always the third, differently-shaped field in the
sequence.

Two fields train you where to look and what to tap. The third field moves
both. Mid-set, after a hard lift, that's exactly the moment a UI should be
getting more predictable, not less.

**Fit:** Core, not just Hygiene — this directly explains why the
progression-coach bug (above) sees so much data at RIR 0: if the interaction
itself adds friction and a jarring layout switch right when you're gassed,
skipping it (swipe-dismiss, or mis-tap into the wrong pill) is the path of
least resistance. `coachingEngine.js`'s entire RIR-trend coaching system is
gated on real per-set RIR existing (`countRirSessions`,
`coachingEngine.js:24-29`) — so this isn't a standalone polish complaint, it's
upstream of the progressive-overload gap this whole audit started from.

**Concrete change:**
1. Keep the confirm button in the same screen position across all three
   fields — right-column, not right-column-then-bottom-full-width. Muscle
   memory should carry across the whole set, not reset on the last field.
2. Make RIR entry commit-on-tap *optional* behavior, not the only path: let a
   pill tap fill the buffer like a digit does (one more tap to confirm),
   OR keep instant-commit but make it undo-able for a few seconds (ties into
   the already-confirmed "no-undo set delete" finding from the September
   run's `r1-03`) — a sweaty-thumbed mis-tap on "0" versus "1" right now
   requires catching it before the set closes.
3. Consider: does RIR need its own distinct widget at all, or would a
   horizontal continuation of the same numeric keypad (just capped 0-6+) keep
   the whole three-field flow in one visual language? The color-coding on the
   pills is a genuinely good scannability idea — worth keeping as styling on
   whatever replaces the layout, not dropping it.

---

## 4. Is the app actually useful, not just premium-looking?

Nolan's framing, not just "does it look expensive." Verdict from this pass,
across both the live screens and the structural findings above:

**Where it earns its keep:** the logging flow itself (weight/reps entry,
Quick Workout, program schedule) is fast, legible, and — modulo the RIR issue
above — low-friction. `ios-sim/audit/sweep2/06-train-schedule.png` and
`08-train-programs.png` show real information density done well: progress
bars, tag chips, session counts, nothing wasted. A session was added, logged,
navigated away from, and returned to cleanly with zero data loss
(`ios-sim/audit/rir5/` sequence) — the one explicit regression check this
pass ran came back clean.

**Where it's busywork that doesn't change behavior:** this is the sharper
version of `cbum-training.md`'s complaint, and live evidence makes it
concrete rather than theoretical. The app computes real signal — a measured
RIR trend, a measured e1RM slope, a controlled experiment's contrast — and
then, for all three, either doesn't show it, shows it somewhere nobody looks
(`/athlete-state`, three taps deep), or shows it and then acts on it wrong
(the deload-at-RIR-0 bug). An athlete can log faithfully for months and the
app will not, on its own, ever tell them to lift more weight on anything but
the three competition lifts — and even there, only by a label they'd have to
go find. Logging-as-busywork is the real risk: all the inputs exist, almost
none of the outputs reach the user as an instruction to do something
differently. That is the throughline connecting this addendum's findings to
the original doc's #1 and #2 — fix the loop, and the "is this useful"
question answers itself; leave it, and the premium visual polish (which,
credit due, is mostly already there) is decorating a logbook, not a coach.
