# OptiGains training side, reviewed as Chris Bumstead would review it

Reviewer persona: a 6x Classic Physique Olympia champion who has been handed the app
and is being hard on it. The scope is training only: /train (Schedule, Library,
Programs, Activity), the logger (/workout-detail, ExerciseCard), /program/:id, the
Python engine (scripts/), /athlete-state (the Body tab), /insights and Today's
training guidance.

Evidence comes from three places:
- **Source.** Every file:line below was read on branch `overnight-audit-2026-09-27`.
- **The live UI as the test athlete.** It was driven read-only through `drive.mjs`, with
  DOM text only and no rows written. /quick-workout was not opened, because it creates
  a session row.
- **usage.json.**

**Snapshot caveat.** The test account is a frozen June copy in the BUD/S phase. Several
on-screen numbers come from that snapshot and may not match Nolan's live engine today:
- the 215-set weekly budget
- `goal_prio {strength .35, hypertrophy .25, pst .40}`
- "0/16 muscles MRV-personalized"
- an all-Rest week
- volume bars at 0

These are marked **[snapshot]**. Everything else is code-verified.

---

## 1. The critique, in his voice

"Look, the bones here are smart. It does more thinking than most coaches I've paid.
But right now it's a powerlifting and SEAL-prep app that has hypertrophy bolted on,
and it can't tell you if you grew.

Everything it learns from is e1RM slope. That's strength. I've had years where my
bench didn't move and my chest got bigger. You have a tape-measure screen that nobody
uses, zero entries, and the engine never reads it anyway. So how does it know what
works for your body? It doesn't. It knows what works for your bench.

It prescribes accessories to failure. Then the progression screen sees you training
to failure and tells you to deload. So the program and the coach are arguing with
each other, and you're the one standing in the middle.

You told it you want adductors and glutes back. It literally cannot program an
adductor. There's no adductor muscle in the engine and no adductor exercise in the
catalog. Glutes get one hip thrust and whatever leaks over from squats. Classic
Physique is judged from the side and the back. You're leaving your legs half-built.

You ran a real experiment: side delts every day, six weeks. Good. Where's the
result? It's in a database row. The app shows active tests and throws the finished
ones away. The whole point of experimenting is looking at the answer.

And I can't even pull up a chart of my incline press over the last three months. The
screen that does that exists in the code. It's just not hooked up to anything.

Fix the feedback loop first: measure size, show me what worked, then lock it in.
Everything else is polish."

---

## 2. Ranked improvements

**Fit** says whether an item serves the stated goal, "enough variation to see what
works, then lock in and optimize to my body." There are three levels:
- **Core:** the goal fails without it.
- **Supports:** makes the loop faster or more trustworthy.
- **Hygiene:** good training, but not the loop.

### #1: Experiment and test results are invisible, and blocks can't be compared (L, Core)

**What's wrong now**
- `AthleteState.jsx:180-190` queries `controlled_tests` with `.eq("status","active")`
  only. A finished test's `result` is never displayed anywhere in the app.
- `controlled_tests.step_specialization_test` (`scripts/engine/controlled_tests.py:224-271`)
  computes a real contrast when it finishes. Its fields are `spec_slope_mean`,
  `control_slope_mean`, `contrast`, `proxy_readout` and `phase_at_start`.
- The docstring says so directly: "The result row is the finding." Nothing reads that
  row. The only other readers are `generate_weekly_program.py` and
  `validate_convergence_fixes.py`, and neither surfaces it.
- The side-delt frequency block was scheduled 2026-08-04 for 6 weeks
  (`SPEC_WEEKS=6`, `controlled_tests.py:116`), so it should have finished around
  mid-September. Nolan has had no way to see its answer. I did not query live data to
  confirm the row.
- The label for an active specialization test falls through to a generic
  "specialization test active." (`AthleteState.jsx` tests.map, the final ternary branch).
  It gives no muscle, no week and no control.
- `/insights` has no training analysis at all. `Insights.jsx` renders only the AI
  DailyBriefCard and a Mind link.
- There is no view comparing one program or block to another, for example "Upper
  Volume block vs Two-a-Day block: what moved?"

**Why it costs gains**
- An experiment you can't read is a wasted six weeks.
- "Find what works, then lock in" needs a place where "what worked" is written down.

**Concrete change**
- Build an **Experiments** page (full design in §3) that lists active, completed and
  aborted tests with their result card.
- Add a **Block review**: for any two date ranges or programs, show per-muscle weekly
  sets, e1RM slope per lift, bodyweight trend and tape deltas side by side.
- Link to both from Insights. Insights is otherwise empty for training.

### #2: The progression coach fights the engine's own prescription (S-M, Core)

**What's wrong now**

The engine prescribes failure:
- `athlete_profile.py:280` sets every accessory's `rir_target = ACCESSORY_RIR_TARGET = 0`.
- `log_ingest.py:27` has `FAILURE_RIR = 0`, meaning a blank RIR is read as "to failure."

The frontend progression code treats failure as a problem:
- `programProgression.js:186`: `readyToProgress = allSetsHitTarget && avgRir >= 2`. It
  ignores the exercise's own `rir_target`. With 1 working set (the default for
  accessories), line 175 keeps that single set, so a 1-set-to-failure movement can
  never reach "ready to progress."
- `programProgression.js:183`: `parseInt("8-10")` gives 8, so the target is the bottom
  of the range. That breaks double progression: 8 reps counts as "hit" and the app
  never asks for 10.
- `:193-197`: a stall means 3 sessions at the same max weight. Rep PRs at the same
  weight count as stalling. Bodyweight lifts are always at "0 lbs," so they always stall.
- `:28-32`: `avgRir < 2` leads to "Consider a deload week."
- `coachingEngine.js:118-125` has the same `avgRir < 1` deload rule.
- The chain runs on every Finish. `useProgramQueries.js:285` calls
  `updateProgressionState`, so each logged session gets re-judged: an RIR-0
  prescription is logged as RIR 0 (or blank, which reads as 0), and that becomes
  "stalled" plus "deload."

It shows up on screen. /program/:id → Progression Tracking on the test athlete reads:
- "5 sessions grinding near failure (avg RIR 0.0). Consider a deload week…"
- "Calf Raise · Avg RIR 0.0 · Stalled"
- "Pull-up Pyramid · 0 lbs · Stalled"
- "Hanging Leg Raise · 0 lbs · Stalled"

**Why it costs gains**
- Either you ignore the coach, which makes the feature worthless, or you obey it and
  deload a lift that is progressing by reps.
- Double progression is the bread-and-butter of hypertrophy, and the app can't
  represent it.

**Concrete change**
- Make progression compare against the prescribed `rir_target`, not a hard-coded 2.
- Ready means every working set hit the **top** of the rep range at or below
  `rir_target + 1`. Then add load and reset to the bottom of the range.
- Progress means any of these: a rep PR at the same load, a load PR, or an e1RM up
  more than 1% over 3 sessions. Stalled means none of those for 3 or more exposures.
- For bodyweight movements, track reps or added load, never "0 lbs."
- Delete the RIR-based deload advice, or gate it on `rir_target >= 2`. Only suggest a
  deload when e1RM declines across 2 or more sessions together with a readiness drop.
- Add a unit test on `updateProgressionState` with a 1-set-to-failure case and an
  "8-10" range case.

### #3: The engine can't program adductors, and glutes are an afterthought (M, Core, Nolan asked for this)

**What's wrong now**
- **Adductors are not a muscle in the engine.**
  - `hypertrophy_volume.py:11-18` (MUSCLES) has no `adductors`.
  - `muscle_map.py:294` maps `"adductors": []` to no landmark.
  - The comment at `muscle_map.py:169-173` says so outright: there is nothing to learn
    or fund.
- **No adductor exercise is in the 116-entry catalog** in `session_generator.py`.
  The selection pool is that static list (`EXERCISES` at `:114`, `_EX_BY_NAME` at `:404`).
  Nothing adds logged or library exercises to it, and `library_capture.py` only writes
  templates out. Sumo
  Deadlift (`:199-200`) is the only movement that even lists adductors, and that credit
  goes nowhere.
- `LOWER_MUSCLES` (`session_generator.py:486`) = quads, hamstrings, glutes, calves,
  core.
- **Glutes have one glute-primary exercise**, Hip Thrust (`:372`, 2 sets of 8-10).
- `muscle_map.py:73` knows "cable kickback," but the session generator's catalog has no
  such entry.
- Glutes carry the lowest-tier prior (MEV 4 / MAV 8 / MRV 12, `hypertrophy_volume.py:119`)
  and have no entry in `MUSCLE_EMPHASIS` (`athlete_profile.py:170-181`).
- [snapshot] The weekly plan chips show Glutes 9, the lowest of 16 muscles.
- Neither adductors nor abductors appear anywhere in the UI's volume view.

**Why it costs gains**
- Adductors are a large share of inner and mid-thigh mass. Classic Physique judges the
  quad sweep and the side-chest leg line.
- Glutes and upper hamstrings shape the back pose.
- Beyond the physique cost, a muscle with no landmark can never be learned, so the
  engine will never discover what volume works for Nolan's legs.

**Concrete change**
1. Add an `adductors` landmark. Mark it `[COACH]` tunable and start at MEV 4 / MAV 8 /
   MRV 12, same as glutes.
2. Map `"adductors": ["adductors"]`.
3. Add adductors to `_ANALYSIS_TO_LANDMARK_DISPLAY` (`compute_athlete_state.py:214`) and
   to `LOWER_MUSCLES`.
4. Add catalog entries:
   - Hip Adduction Machine
   - Cable Adduction
   - Copenhagen Plank (bodyweight)
   - Wide-stance Leg Press, crediting quads, glutes and adductors
   - 45° Back Extension, glute-biased
   - Cable Kickback
   - Hip Abduction Machine
   - Deficit Reverse Lunge, glute-biased
5. Seed `muscle_emphasis` with glutes 1.25 and adductors 1.25 through the existing
   `user_profiles.muscle_emphasis` jsonb, so it's his call and not hard-coded.
6. Include both muscles in the weekly volume view (#6).

### #4: There is no hypertrophy readout, and every learner is optimizing strength (M, Core)

**What's wrong now**
- The learners reward e1RM slope:
  - MRV learner: `learners.update_mrv`
  - frequency bandit: `learners.update_frequency`, where `reward = that muscle's e1RM slope`
  - exercise-value learner: `learners.exercise_reward`, whose slope term
    `SLOPE_SCALE=2.5`
  - specialization contrast
- The spec admits the gap (`SPEC_specialization_test.md`: "proxy_readout: true… rather
  than passing strength off as hypertrophy").
- A tape input does exist: /fuel?tab=body → Measurements (`Progress.jsx:168-180`). It
  has chest, waist, hips, L/R arm, L/R quad and neck. It has no shoulder/delt
  circumference, no calf, no glute or upper thigh, and no forearm.
- `measurements` has **0 rows** ever (usage.json).
- **No script in `scripts/` reads `measurements`** (grep: no hits). The SPEC doc's
  "no tape-measure input today" is half wrong: the input exists but is disconnected.
- Physique photos exist (39 entries) and produce an AI body-comp estimate. No learner
  consumes them either.

**Why it costs gains**
- You can't learn what grows your body from a signal that measures neural and skill
  strength.
- During an open-ended cut (the side-delt block's own comment says "cutting open-ended
  since 2026-06-07"), strength can hold while size drops, or fall while size holds.
  e1RM alone will mislead in both directions.

**Concrete change**
- Add these fields to the measurement form:
  - shoulder girth (around both delts)
  - flexed arm L/R
  - upper thigh L/R
  - calf L/R
  - glute or hip at its widest
- Add a one-line protocol cue: "AM, fasted, same spot, pump-free, 2 readings."
- Put a biweekly "Measure" nudge on Today, next to the weigh-in.
- In the engine, compute a per-muscle girth slope, normalized against the bodyweight
  trend so a cut doesn't read as muscle loss. Use it as the primary readout for
  experiments, with e1RM as secondary.
- Add a fixed-pose photo pair (the same 2 poses at start and end of a block) to every
  experiment.

### #5: The per-exercise progress chart and PR table can't be reached (S, Core)

**What's wrong now**
- `src/components/workouts/ProgressContent.jsx` holds `ExerciseProgressChart` (`:390`)
  and a "Personal Records" table (`:405-408`, `getAllPersonalRecords`).
- It is imported nowhere. The grep shows only its own file and a comment in
  `buildWorkoutLogFromSession.js`.
- The only reachable strength views are:
  - /athlete-state "Strength Goals," which covers bench, squat and deadlift only
  - the "Last 225×8 (Jun 21)" line in the logger

**Why it costs gains**
- "Did lean-away laterals or cable Y-raises move better over 8 weeks?" can't be
  answered without a per-exercise history.

**Concrete change**
- Mount `ProgressContent`'s exercise chart and PR table under Train → Activity as a
  "Lifts" segment.
- Make the exercise name in `ExerciseCard` open a history sheet: e1RM line, best set per
  session, PR markers, and which program or block each point came from.

### #6: Weekly volume per muscle is buried, uses the wrong vocabulary, and is missing muscles (M, Core)

**What's wrong now**
- The Muscle Volume card lives at /athlete-state (the Body tab) → Details → Body
  analytics (`AthleteState.jsx:1037`). That is 3 taps deep and nowhere near Train.
- It is sorted by fatigue and capped at 8 rows (`MUSCLE_CAP = 8`).
- It uses the "analysis" vocabulary: back and shoulders lumped together
  (`compute_athlete_state.py:214-224`, `ALWAYS_SHOW` at `:350`).
- The weekly plan uses 16 landmark muscles: lats, upper_back, side_delts, rear_delts,
  upper_chest and so on. Those appear only as chips under Engine internals → This
  Week's Plan.
- Bars fill toward MAV, not toward this week's planned target.
- [snapshot] The plan says Side Delts 19. The volume card's visible 8 rows have no side
  delts row, and Back and Shoulders show "0 / 12."
- Adductors appear in neither.
- There is no "days this muscle was hit this week" count, which is the number that
  matters for someone who trains shoulders and arms every day.

**Why it costs gains**
- You can't steer what you can't see.
- Training every day makes it easy to crush arms and quietly miss adductors and hams.

**Concrete change**
- Add one "This week" table at the top of Train → Schedule.
- Columns: muscle | sets done / planned | days hit (dots Mon-Sun) | 4-week trend
  sparkline.
- Use the landmark vocabulary with all 16 muscles plus adductors, ordered by emphasis.
- Tapping a row shows which exercises fed it.
- Use the same data source as `weekly_plans.set_targets` so plan and actuals can't
  drift.

### #7: Arms and delts every day, but capped before the post-PRT arm push (M, Supports)

**What's wrong now**
- The good part: `MANDATORY_ISOLATION_MUSCLES = ("side_delts","triceps","biceps")`
  (`athlete_profile.py:105`) guarantees 1 isolation of each in every session
  (`session_generator.py:1614+`). That is daily-frequency arms and side delts.
- The caps:
  - Biceps and triceps carry MRV 12 (`hypertrophy_volume.py:122-123`).
  - They are not in `FAST_RECOVERY_MUSCLES` (`athlete_profile.py:39`), so each is capped
    at 3 sets per session (`:30`).
  - `MAX_ACCESSORY_SETS_PER_EXERCISE = 2` (`:26`).
  - Raising MRV requires the learner to see a positive e1RM slope with low soreness,
    gated to mesocycle timescales (E5). On a cut that is slow.
- Rear delts are not in the mandatory set.
- [snapshot] `goal_prio` was the BUD/S branch (`allocator.py:99-100`: hypertrophy 0.25,
  the lowest). If Nolan's live profile still has `training_phase = buds_prep` or a
  stored `goal_priorities`, hypertrophy is still last. After the PRT, flip it. I didn't
  check live data.

**Why it costs gains**
- "Arms harder after the PRT" won't happen by itself. The priors will hold arms around
  8-12 weekly sets until a learner slowly earns more.

- **Recovery linkage is coarse.** Soreness trims sets but never below 1
  (`SORENESS_TRIM_FLOOR`, `athlete_profile.py:162`). Low TSB scales the session's
  intensity (`_scale()`, `session_generator.py:21,591`). Both are whole-session or
  per-exercise dials. For a daily trainer that is adequate as a safety net but blunt as
  a steering tool: nothing moves sore arms' work to tomorrow, or swaps a heavy movement
  for a lower-fatigue one. I did not audit the per-muscle recovery paths beyond this.
  With daily arm work, the soreness check-in has to reach the arms slot specifically.

**Concrete change**
- Run the post-PRT arm push **as an experiment** (§3, volume arm). Example: biceps and
  triceps at 16-20 sets per week for 4 weeks. Keep daily frequency, 1-2 sets per
  session, lengthened-bias movements.
- Add biceps, triceps and rear_delts to `FAST_RECOVERY_MUSCLES`, or a per-experiment
  override, so the cap doesn't clip the protocol.
- Expose `muscle_emphasis` as sliders in Profile. The jsonb already exists.
- Add a "Phase" switch (PRT prep → hypertrophy) that resets `goal_priorities`.

### #8: Rep range is the one variable hard-coded shut (S, Core)

**What's wrong now**
- `PREFERRED_REP_CEILING = 10` (`athlete_profile.py:157`) clamps every loaded movement,
  including laterals, calves, neck and traps, to 10 reps or fewer.
- It was Nolan's call and it's defensible. But a lifter who wants variation to find
  what works has frozen the variable most likely to matter for small, fast-recovering
  muscles.

**Why it costs gains**
- Small, fast-recovering muscles (side delts, calves, rear delts) are where a lifter's
  best rep range varies most from person to person. Freezing it means the app can
  never discover the answer for Nolan.

**Concrete change**
- Keep the default. Make rep range an experiment arm, for example side delts 6-10 vs
  15-25 for 4 weeks with sets matched.
- The clamp should respect an active experiment's override. It's the same hook that
  `spec_focus_muscle` uses for placement.

### #9: The exercise-value learner can be won by liking a lift, and it's invisible (M, Supports)

**What's wrong now**
- `learners.exercise_reward` (`:241-296`) gives the strength response at most ±1.
  Each swap-in adds +0.5, each skip −0.5, each net "liked" mention +0.6, each "too easy"
  +0.3.
- Two swaps and a "liked it" (1.6) outweigh the best possible growth signal (1.0).
- The frontend never shows `exercise_value` (no match in `src/`).

**Why it costs gains**
- "What works for me" slowly becomes "what I enjoy." Those overlap, but they're not the
  same. You need to see which one is driving selection.

**Concrete change**
- Add an **Exercise report card** (Train → Library, or the #5 history sheet). For each
  movement show weeks programmed, e1RM slope, girth slope for its muscle, your votes,
  pain flags, and the current value.
- Split the reward into a "response" term and a "preference" term, stored separately.
  Show both, and let him set their weighting.

### #10: The RIR column is dead weight for someone who trains to failure (S, Hygiene)

**What's wrong now**
- The engine assumes real logs carry no per-set RIR. See the comment at
  `compute_athlete_state.py:333-335` and `FAILURE_RIR=0`.
- Yet the logger shows an RIR input on every set (`ExerciseCard.jsx:39`
  `showRIR = true`, header at `:551`).
- The frontend then complains: "Log RIR on your sets to get progression coaching."

**Why it costs gains**
- Several sets a session, 7 sessions a week, every one with a field he leaves blank.
  That's friction mid-set, and the blank fields also feed the "log RIR" nag and the
  wrong verdicts in #2.

**Concrete change**
- For accessories, replace the RIR input with a one-tap chip: "Failure" (default) or
  "1-2 left."
- Keep numeric RIR on goal lifts, where `rir_target >= 1`. The `showRIR` prop already
  exists.
- This is fewer taps mid-set, and the data is honest.

### #11: No intensity techniques or set intent (S-M, Supports)

**What's wrong now**
- A set is a weight, reps, RIR and a type (working, back-off, daily_min).
- There is no drop set, rest-pause, myo-reps, lengthened partials or tempo marker.
- The train-logger `wishes.json` already flags that set intent is missing ("a tempo or
  technique-focus set… looks identical to a bad day").

**Why it costs gains**
- A 1-set-to-failure trainer lives on these. Without them, volume is under-counted and
  progression is misread. A drop set logged as a new set looks like a strength crash.

**Concrete change**
- Add a set-technique tag: drop, rest-pause, myo, partials, tempo 3-1-x. It is a
  long-press on the set row.
- The engine credits drop and rest-pause sets as about 0.5 to 1 extra set. Mark that
  `[COACH]` tunable.
- Progression ignores tagged sets.

### #12: Cues are generic, and there is no place for "my cue for this lift" (S, Supports)

**What's wrong now**
- The how-to dialog (`ExerciseCard.jsx:875-891`) shows free-exercise-db instructions.
- Exercise notes are free text per session (`:798-822`).
- Nothing persists a personal cue such as "pinky high, lead with elbow, 1s pause at
  top" from one session to the next.

**Why it costs gains**
- A cue that isn't repeated gives a stimulus that isn't repeated. Mind-muscle
  connection on laterals and curls comes from running the same cue every session, and
  right now each session starts from zero.

**Concrete change**
- Add a pinned per-exercise cue, stored per user and shown as one line under the
  exercise name every time it appears.
- The Coach form-review clips could attach to it.
- Mind-muscle connection is built by repeating the same cue.

### #13: Today's training guidance explains the engine, not the physique (S, Hygiene)

**What's wrong now**
- The rationale on the snapshot reads like engine output: "budget 215.3 sets;
  goal_prio {…}; pst_mult 1.16; 0/16 muscles MRV-personalized…" (Engine internals →
  This Week's Plan).
- `PrescribedSessionCard` humanizes it only partly (`humanizeRationale`, `:351-352`).

**Why it costs gains**
- If the plan reads like telemetry, Nolan skims it. Then the day's priority, like
  "adductors are behind," never reaches the gym floor.

**Concrete change**
- Give Today one line per session: "Today: side delts first (experiment wk 3/6),
  adductors 2 sets (behind plan by 3 this week), arms 1+1."
- Keep the raw engine text behind Engine internals.

---

## 3. The Experiments page

**Why it's the centerpiece.** The engine already has most of an experiment runner:
- the `controlled_tests` table
- `schedule_/step_specialization_test`
- `spec_focus_muscle`, which puts the probed muscle first
- `spec_locked_muscles`, which keeps the bandit from contaminating the probe
- a pre-registered control and arm
- a `phase_at_start` confound stamp

What's missing is the front door, the readout, and a way for Nolan to author one.

### 3.1 Where it lives

- Route `/experiments`, not in the dock.
- Entry points:
  1. The flask rows in "This Week's Plan" (`AthleteState.jsx`, FlaskConical). Tapping one
     opens that experiment.
  2. An "Experiments" tile under Insights → Explore, next to Mind & Learning.
  3. A small "Experiment wk 3/6" chip on Train → Schedule while one is active.

### 3.2 What an experiment needs (fields, filled at creation, locked once it starts)

| Field | Example (delts daily) | Example (bench daily) |
|---|---|---|
| **Question / hypothesis** | "Side delts grow faster at 7x/wk than 3x/wk at equal weekly sets" | "Daily bench practice raises my bench e1RM faster than 2x/wk" |
| **Variable (arm)**, exactly one | frequency | frequency, for one exercise |
| **Subject** | muscle: side_delts | exercise: Bench Press (movement-level) |
| **Protocol** | 7 sessions/wk, 2 sets, lateral raise ↔ cable Y-raise rotation, placed first, 8-12 reps @ 0-1 RIR, weekly sets fixed at N | daily top single @ RPE 8 + 3×3 @ 85%, weekly sets fixed |
| **Held constant** | weekly set count, rep range, sets per exercise | total weekly chest sets, other pressing |
| **Control** | rear_delts at their current 3x/wk, **or** a prior 4-week baseline block at 3x/wk | incline DB press held as-is, as an unpracticed pressing readout |
| **Duration** | 30 days (≥ `SPEC_MIN_WEEKS = 4`, OK) | 30 days |
| **Primary readout** | delt/shoulder girth slope (bodyweight-adjusted) | e1RM on a **non-practiced** test: a paused 3RM, or close-grip bench |
| **Secondary readout** | lateral raise e1RM slope, photo pair | bench e1RM, triceps/chest girth |
| **Success rule (pre-registered)** | girth +≥0.5 cm over control, and no joint pain flags | test lift +≥X lb over 4-wk baseline slope |
| **Stop rules** | pain note with severity ≥2, readiness below threshold for 3 or more days, 2 missed weeks | same, plus elbow/shoulder pain |
| **Confounders stamped at start and end** | phase and kcal 7-day average, bodyweight trend, sleep 7-day average, HRV baseline, other experiment on the same muscle (must be none), deviation rate (sessions skipped) | same |

### 3.3 Baseline vs. result: what the result card shows

- Readout plots with the baseline period shaded, the block in color and the control in
  grey.
- Adherence: the % of planned sessions and sets actually done, from `deviation_tracker`.
- A confounder panel: kcal, bodyweight, sleep and HRV, start vs end, with a warning
  whenever one moved more than a threshold. For example: "You dropped 4 lb during this
  block. A null result is weak evidence." `step_specialization_test` already carries
  `phase_at_start` for this purpose.
- A verdict in plain words: **Adopt / Reject / Inconclusive — repeat or extend**.
- **Adopt** writes back to the engine. See "What adoption writes" in §3.4.

### 3.4 How it plugs into existing code

**Storage**

Reuse `controlled_tests`. RLS is already `own tests FOR ALL` (remote_schema.sql:1961),
so the frontend can insert and update its own rows directly.

Add `test_type = 'experiment'` with a CHECK-constraint migration. The remote schema's
constraint at `:280` lists only 4 types, and `migrations/add_specialization_test_type.sql`
had to widen it once already. Alternatively, reuse `'specialization'` with a new
`arm` / `subject_kind`.

Put the protocol, control, readout, success rule and stamped confounders in `baseline`
jsonb. The outcome goes in `result`.

**Engine pickup** (`generate_weekly_program.py:1150-1245`)
- The scheduler already loads active `specialization` rows and steps them weekly. A
  row inserted by the page with `status='active'` would be picked up on the next weekly
  run.
- Three changes are needed:
  1. Remove the auto-schedule-once default, or keep it only for engine-proposed tests.
  2. Branch on `arm`:
     - `frequency`: force a slot for the subject in N sessions per week.
     - `volume`: `ramp_target`-style override of the muscle's weekly target, reusing
       `controlled_tests.ramp_target`.
     - `rep_range`: override `PREFERRED_REP_CEILING` for the subject.
     - `exercise_frequency`: pin a movement into each session, reusing the "plan owns
       the session" path near `session_generator.py:2503`.
  3. Support **exercise subjects**, not just muscles. `step_specialization_test` reads
     `perf_slopes[muscle]`, so an exercise subject needs `StrengthProgressionRegistry`
     history for the named lift.

**Readout**
- Extend `step_specialization_test` so it reads girth slopes from `measurements` once
  #4 is built, and fills `proxy_readout = false` when tape exists.
- Keep emitting `{key, obs, obs_var, complete}` so learners can consume a volume-arm
  result (`TEST_OBS_VAR = 2.0`, which is lower noise than passive data).

**Concurrency**
- `can_schedule_specialization` refuses a second specialization block. Change it to
  "no overlap on muscles or exercises," the rule the docstring already describes. That
  lets "adductor volume" and "bench frequency" run together.
- It must still refuse two probes on the same muscle, or a probe on the control.
- `spec_locked_muscles` already keeps the bandit off both arms.

**What adoption writes**
- `user_profiles.muscle_emphasis` (exists), an MRV/MAV posterior observation via
  `learners.apply_mrv_observation` (exists), or a preferred-exercise entry via
  `exercise_preferences` (exists, validated by `exercise_prefs.canon_prefs`).
- Store the adopted setting with a link back to the experiment id, so every locked-in
  setting can say which experiment justified it.

**UI**
- A new page and a create form built from templates:
  - "Muscle frequency"
  - "Muscle volume"
  - "Rep range"
  - "Exercise daily practice"
  - "Exercise A vs B"
- It reads `controlled_tests` for all statuses. The existing `WeeklyPlanPanel` query
  becomes a subset of it.

### 3.5 Pitfalls to design against

1. **"Delts every day for 30 days" is not a contrast in this app.** Side delts are
   already in every session (`MANDATORY_ISOLATION_MUSCLES`), and that is exactly how the
   first specialization block started. The experiment needs a baseline block that is
   actually different (for example, 4 weeks at 3x first), or a within-block control
   muscle. The form should refuse an experiment whose protocol equals the current
   default.
2. **Frequency confounded with volume.** Going to 7x per week without pinning weekly
   sets tests volume, not frequency. Hold the non-tested variables fixed and display
   them. The spec already insists on one arm at a time.
3. **Practiced-lift inflation.** Bench every day raises bench e1RM through skill and
   neural practice. It doesn't tell you the chest grew. Read out with an unpracticed
   variation plus tape, and label e1RM on the practiced lift as "skill-confounded."
4. **Cut as a confounder.** On an open-ended cut, the growth contrast shrinks toward
   zero, so a null result is weak. Show that on the result card. Consider requiring
   maintenance or a surplus for volume-arm experiments. The spec notes the cut-gate
   reasoning is arm-specific.
5. **Too short, too noisy.** At 4 weeks tape changes are close to measurement error
   (about 0.3-0.5 cm), so require 2 readings per session and show the error band.
   Default to 6 weeks for size questions. 30 days is fine for strength and skill
   questions.
6. **Carryover and order effects.** An A-then-B design favors whichever arm runs
   second (accumulated fatigue or detraining). Where you can, use a within-block control
   muscle. Otherwise put a deload week between blocks and repeat the winner once before
   adopting it.
7. **Only one experiment per muscle, and none on the control.** The engine enforces
   the global rule (`_test_muscles` overlap). The form should explain a refusal instead
   of failing silently.
8. **Adherence.** An experiment you ran 60% of is a different experiment. Show adherence
   and mark the verdict invalid below about 80%.
9. **Deciding after the fact.** Lock the success rule and readout at creation (the spec
   already calls for "pre-registered"). Editing after start forks a new experiment.
10. **Joint cost.** Daily pressing or daily laterals can flare shoulders or elbows. Wire
    stop rules to the existing pain parser (`notes_parser`, the `exercise_reward` pain
    terms) and the soreness check-in.

---

## 4. Order of work if you only do five things

1. **#2 progression fix** (S). The coach stops contradicting the program, and every
   later readout depends on correct progression.
2. **#3 adductors and glutes** (M). He asked for it, and the engine literally can't do
   it today.
3. **#4 tape fields plus an engine read** (M). Without a size signal, every "what works"
   answer is a strength answer.
4. **#5 remount ProgressContent** (S) and **#6 weekly volume table on Train** (M).
5. **§3 Experiments page** (L), starting as a read-only view of `controlled_tests`
   (completed results first). Add authoring next, then the arm branches.
