# OptiGains, reviewed as Jeff Nippard would review it

Reviewer persona: an evidence-first hypertrophy coach who reads the primary
literature and checks claims against it — and, just as importantly here,
checks the code against the app's own stated spec (`Science-Unified.md`) before
checking it against the literature. A tool that contradicts its own design
doc is a sharper problem than one that merely disagrees with a meta-analysis.

Scope: training prescription correctness vs. `Science-Unified.md`, the RIR/
progression pipeline, training-focus adjustability, and whether the app is
actually useful day to day — not a restyle of `cbum-training.md`, which this
doc assumes as read and will reference rather than repeat.

Evidence: source read on branch `ios-sim-audit-2026-10-12`; live device via
the real iOS Simulator (Appium/XCUITest, `ios-sim/run.mjs`), logged in as the
`optigains-sim-test@example.invalid` clone, fresh as of 2026-10-11/12 data.
Screenshot paths are under `ios-sim/audit/`.

---

## 1. The critique, in his voice

"Let's start with what the spec actually says, because that's the part most
reviews of this app are going to skip. `Science-Unified.md` is not a vague
aspirational doc — it makes specific, falsifiable modeling choices. Training
to failure as the default is one of them, explicitly: '0 RIR is the default
style and is kept' (line 122). That's defensible — effective-reps models
(Reps_eff = max(0, 5-RIR), line 226) are a real framework, and at 0 RIR you
get the full 5 effective reps per set. Fine. I don't even need to agree with
every choice here; I need the implementation to follow its own choices.

It doesn't. The effective-reps formula the spec defines for hypertrophy
*stimulus* — the thing that's supposed to tell you how much a set counted
toward growth — is implemented exactly once in this codebase, and it's wired
to the *fatigue* side (`log_ingest.py:32-44`, feeding the Banister fatigue
model), not the stimulus side. The function that actually fills your weekly
set count against MEV/MAV/MRV (`compute_hypertrophy`,
`compute_athlete_state.py:319`) just counts sets. A set at RIR 4 and a set at
RIR 0 count identically toward your volume target. The spec's own formula
says they shouldn't — a set at RIR 5+ contributes *zero* effective reps. So
either the spec is aspirational and nobody finished wiring it, or the volume
counter is quietly wrong by the app's own definition of a hard set. I checked:
it's the former. That's not a hypertrophy-science disagreement, that's an
unfinished implementation of the app's own math.

Second one, same pattern. The spec's parameter table is explicit:
per-muscle frequency should be an *absent, derived output* — 'Omit (derived
output)', not a fixed table (`Science-Unified.md` comparison table, row
'Per-muscle frequency'). That's the right call, and it's the literature-
consistent one — Schoenfeld's volume-equated frequency work (and your own
read of it, this app seems to know that) says frequency barely matters once
volume is matched. So the engine should be computing frequency FROM the
volume target divided by sets-per-session, which the spec text says it does
(line 212). But `MANDATORY_ISOLATION_MUSCLES = ('side_delts', 'triceps',
'biceps')` (`athlete_profile.py:105`) hardcodes those three to **every single
session**, full stop, regardless of weekly volume target, regardless of
whether that's 3 sessions or 7. That's a fixed-frequency table wearing a
different variable name. It happens to be clinically fine — daily arms at low
per-session volume is a legitimate specialization pattern — but it's the
exact thing the spec says the engine shouldn't hardcode, and it means the
'derived from volume' claim isn't true for three of sixteen tracked muscles.

Third, and this is the one that actually costs reps in the gym, not just
tidiness points: I opened Quick Workout live on the test account today —
not June, today — and the coach card says 'Machine Incline Press: last 3
sessions averaged RIR 0.0. Deload weight: 242.5' (`ios-sim/audit/rir1/
01-qw-landing.png`). That's the frontend's `programProgression.js` and
`coachingEngine.js` treating RIR 0 as a stall signal worth a deload. But the
spec, which this exact app ships with, says training to failure is the
*intended default*, not a warning sign. The progression coach is running
pre-spec logic — it reads like it predates the 0-RIR decision and nobody went
back to reconcile it. You can't half-adopt a failure-training model: either
RIR-based deload triggers get removed for exercises whose own `rir_target` is
0, or the 'failure is fine' spec claim needs a second look. Right now the app
believes both at once, and the athlete is the one who has to arbitrate.

On adjustability: I went looking for where you tell this thing 'I'm shifting
from strength-primary to hypertrophy-primary.' There's no such control.
`training_phase` and `goal_priorities` — the exact inputs
`default_goal_priorities()` (`allocator.py:91`) uses to set the strength vs.
hypertrophy vs. conditioning weights — have no UI writer anywhere in `src/`.
Profile (`ios-sim/audit/sweep2/15-profile.png`) has Identity, Body &
Nutrition, Settings. None of them touch this. An athlete can switch which
*program template* they're on, which is a different and much shallower lever
than telling the adaptive engine what to optimize for. If the pitch is 'this
converges to the right split for your goals,' the goal has to be settable by
the person whose goal it is.

And the RIR input itself — I ran it live. Weight and reps share one
keypad pattern, same button position to advance. RIR swaps to a color-coded
pill row and moves the confirm button to the bottom of the screen
(`ios-sim/audit/rir4/`). Harmless-looking, but it's exactly the field whose
data quality this entire coaching layer depends on
(`coachingEngine.js`'s phase-gating needs real RIR to ever activate), and
it's the one field with the most friction to log correctly. That's backwards.

Bottom line: the model underneath this app is more rigorous than most
consumer fitness software I've looked at — real effective-reps thinking, a
real recovery-limited MRV instead of a hard ceiling, a real controlled-
experiment runner. The problem isn't the science. It's that three different
layers (stimulus counting, frequency, progression coaching) haven't caught up
to the spec's own latest decisions, and the one steering input a user would
actually want — training focus — was never built."

---

## 2. Ranked findings

Same Fit framework as `cbum-training.md`: **Core** (the stated goal fails
without it), **Supports** (makes the loop faster/more trustworthy),
**Hygiene** (good practice, not load-bearing).

### N1: Hypertrophy volume counting doesn't use the spec's own stimulus model (M, Core)

**What's wrong:** `Science-Unified.md:226-231` defines `Reps_eff = max(0, 5 -
RIR)` as the hypertrophy stimulus unit and states sets beyond 5 RIR add no
stimulus. `compute_hypertrophy()` (`compute_athlete_state.py:319-369`) counts
`hard_sets` as any set with weight or reps logged — no RIR weighting at all.
The formula is implemented exactly once in the codebase
(`log_ingest.py:46-course`, `proximity_fatigue_factor`), and it feeds fatigue
cost, not the MEV/MAV/MRV volume bars a user actually sees.

**Why it matters:** The weekly volume table (`cbum-training.md` #6) is the
one place an athlete can see "am I doing enough for this muscle." If a set at
RIR 5 counts the same as a set at RIR 0, the bars are measuring reps
performed, not stimulus delivered — the exact distinction the spec itself
says matters.

**Concrete change:** Weight `hard_sets` in `compute_hypertrophy` by
`Reps_eff / 5` (or a simpler binary: don't count a set toward volume if its
logged RIR is ≥ 5), so the stimulus-unit the spec defines is the one that
actually drives the number on screen.

### N2: Three muscles get a hardcoded fixed frequency the spec explicitly says not to use (S, Supports)

**What's wrong:** `Science-Unified.md`'s parameter comparison table lists
per-muscle frequency as "Absent — Omit (derived output)." `athlete_profile.py:105`'s
`MANDATORY_ISOLATION_MUSCLES = ("side_delts", "triceps", "biceps")` forces one
isolation set of each into every session unconditionally
(`session_generator.py:1614+`), independent of the computed weekly volume
target.

**Why it matters:** Not clinically wrong — daily arms at low per-session dose
is a legitimate pattern several high-frequency hypertrophy protocols use. The
problem is the claim-vs-code mismatch: "frequency is derived" is false for 3
of 16 tracked muscles, and that's exactly the trio CBum's doc (#7) already
flagged as capped too low post-PRT. Fix one, and the other gets easier to
reason about.

**Concrete change:** Either reclassify these three as an intentional,
documented exception (own it in the spec text), or make their frequency fall
out of volume ÷ sets-per-session like the other 13 muscles, with a floor
rather than a hard mandatory-every-session rule.

### N3: The progression coach runs pre-"failure is the default" logic (L, Core — see `cbum-addendum-2026-10-12.md` §1 for the live confirmation)

Covered in full in the CBum addendum with live October evidence; flagging
here because it's the same root cause as N1/N2 — a part of the app that
hasn't been reconciled with the spec's own 0-RIR-default decision. Worth
fixing together: once accessory RIR is correctly excluded from "stall" logic,
N1's volume weighting and this fix pull from the same corrected RIR
semantics.

### N4: No UI control for training-focus / goal priorities (M, Core — see CBum addendum §2 for full citations)

Flagged independently by both reviewers from different angles: CBum from "I
can't tell it what I'm training for," this review from "the spec's adaptive-
convergence story requires a goal to converge toward, and nothing sets one."
Same fix serves both: expose `training_phase`/`goal_priorities` in Profile.

### N5: RIR input UX (S-M, Core — see CBum addendum §3 for the live screenshots and full writeup)

Agreed independently; not re-detailing here. The one thing to add from an
evidence-based-coaching angle: RIR autoregulation only works if the logged
number is trustworthy. A field that's harder to fill in accurately than
weight or reps produces noisier RIR data even when it IS filled in, on top of
the sessions where it's skipped entirely. That compounds with N1 and N3 —
bad or missing RIR corrupts both the (currently unweighted) volume count and
the (currently miscalibrated) progression coach.

### N6: Is it useful, or just well-modeled? (Core)

The engine underneath — recovery-limited soft MRV instead of a hard ceiling,
effective-reps thinking, a real controlled-experiment runner with
pre-registered success rules — is more rigorous than the median consumer
fitness app. That's a genuine strength and worth saying plainly, not just as
a lead-in to criticism. But rigor in the model doesn't reach the athlete if
the outputs don't: N1-N5 are all instances of the same failure mode, a
correct or near-correct backend signal that either doesn't reach the UI, or
reaches it miscalibrated, or reaches it through an input the user avoids.
Fixing the plumbing (N1-N5) is higher leverage than any further modeling
work — the science is mostly already good enough to be useful; it isn't yet
*reaching* the person using the app.

---

## 3. Order of work if you only do three things

1. **N3/CBum #2** — reconcile the progression coach with the spec's 0-RIR
   default. Everything downstream (N1, N5) depends on RIR meaning what the
   app says it means.
2. **N4** — a training-focus control in Profile. Without it, "converges to
   the right split for your goals" has no goal to converge toward.
3. **N1** — weight hypertrophy volume by effective reps, not raw set count,
   so the number on screen matches the spec's own stimulus definition.
