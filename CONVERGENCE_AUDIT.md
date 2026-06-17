# OptiGains — Convergence-to-Optimal Audit

**Date:** 2026-06-16
**Question:** Given enough weeks of real data, does this engine converge toward the
optimal program for the athlete's goals — or are there places where it can't learn,
learns too slowly to matter, or thrashes? Where is hardcoding silently capping
convergence, and is the guardrail/freedom balance right?

**Method:** end-to-end parameter traces (owned by lead), three fan-out coverage
agents (allocation / guardrails / session+coherence), every claim verified against
source and — where decisive — against runtime (`numpy` RNG, RLS variance). Held the
code to `ADAPTIVE_ENGINE_DESIGN.md` + `Science.md`; the OptiGainsOS doc (EKF/PyMC/
CP-SAT/RL) is aspirational and **not** what shipped — the shipped system is the
greedy-allocator + Normal/Kalman-learner + bandit design in `ADAPTIVE_ENGINE_DESIGN.md`.

**Bottom line up front:** the system is _locally sensible but globally near-static_.
It snaps to a well-hand-tuned population prior in week 1 and then **cannot learn its
way off that prior for the parameters and muscles that matter most**, because the
learning signals are missing, dead, or self-extinguishing. It does **not** thrash
(guards are good). The "optimum" it converges to ≈ the prior program, not a
discovered personal optimum. Four mechanisms block the personalization loop; none is
a crash, all are silent.

---

## Part 1 — The objective, and convergence to it

**There is no single global objective the whole system maximizes.** It's a stack of
local objectives:

- **Allocator** maximizes greedy marginal-value on an inverted-U between MEV/MAV/MRV,
  under a systemic set budget, weighted by `goal_priority × muscle_relevance ×
deadline × emphasis` (`allocator.py:81-103`). This local objective **does** point at
  the goals — emphasis and goal weighting are wired correctly (see refuted headline).
- **Each learner** optimizes its own posterior (MRV, frequency, exercise-value).
- **MPC** maximizes a per-trajectory score `goal_term + tsb_bonus − acwr_penalty`
  (`mpc_prescriber.py:_score_trajectory`).

These compose into a coherent program **only at the priors**. The half of the system
meant to personalize the priors (the learners + exploration) is largely inert, so the
global behavior is: converge fast to the hand-tuned prior, then stay there.

### REFUTED HEADLINE (corrected): emphasis does NOT evaporate

An early hypothesis — that the 1.5× emphasis for `neck`/`side_delts`/`upper_chest`
silently falls back to 1.0 because the allocator iterates a coarser canonical set —
is **false**. `hypertrophy_volume.py:11-55` defines a 16-muscle canonical taxonomy
that includes `neck`, `side_delts`, `upper_chest`, `traps`, `rear_delts` as
first-class landmarks; the allocator seeds `landmarks_lc` from `LANDMARK_PRIORS`
(`generate_weekly_program.py:953`) and `muscle_emphasis.get(m, 1.0)`
(`allocator.py:89`) therefore finds every emphasis key. A test run funds those
muscles to/above MAV. **The allocation half points at the goals correctly.** The
problem is entirely in the _learning_ half below.

---

## Findings — ordered by impact on convergence-to-optimal

### 🔴 F1 — MRV maturity is structurally unreachable on passive data (the keystone)

**Severity: Blocks convergence** · `learners.py:41-58`

The MRV posterior only takes an upward observation `obs = weekly_sets + 1` **and only
when `weekly_sets + 1 > mean`** (`learners.py:44`). But the allocator caps
`weekly_sets ≤ mrv`, and while a muscle is immature `mrv = round(prior_mrv)`
(`learners.py:58`). So the observation ceiling is `≈ prior + 1`, while maturity
requires `|mean − prior| > 1.96·√var` (`learners.py:57`) — about 2+ sets of
separation.

The observations **self-extinguish**: `mean` climbs toward `prior+1` within ~5–8
informative weeks, at which point the `weekly_sets + 1 > mean` guard stops firing,
`var` freezes around ~1.3, and `1.96·√1.3 ≈ 2.2` sets of required separation can never
be met by the ~1 set of achievable separation. Variance would need to fall below
**0.26** (≈23 consecutive informative weeks) for a 1-set move to count. It's a fixed
point at the prior, not a slow climb. The downward branch (`obs = weekly_sets − 1`,
`learners.py:49`) is pinned by the same logic. **Passive MRV cannot mature in either
direction, by construction** — even for muscles that _have_ a clean signal (the goal
lifts).

The intended escape hatch — the controlled volume-tolerance test (`apply_mrv_observation`,
`learners.py:64`, `K` up to 0.5, `obs_var=2.0`) — **is wired live**
(`generate_weekly_program.py:902-960` → `step_volume_test` → `ramp_target` pushes one
muscle above MAV). So MRV-up is _not_ dead. But it tests **one muscle at a time**, 3
weeks minimum (`controlled_tests.py:19`), never during a cut (`can_schedule`,
`controlled_tests.py:62`), gated on TSB. Across 16 muscles that is **~48+ weeks
minimum** to probe each once, realistically far longer with cuts and fatigue gating.

**Fix:** decouple the upward-observation guard from the current capped volume — let a
"responding + recoverable at volume `s`" week emit `obs = s + Δ` with `Δ` scaled to the
distance from MAV, and raise `K_MAX` modestly so a string of strong weeks can separate
the posterior without a designed test. OR (cleaner) make the controlled test the
_primary_ MRV mover and explicitly document passive weeks as variance-shrinking only.
**Tradeoff:** a looser upward guard risks chasing noise upward on a few good weeks —
mitigate with the existing `responding AND recoverable` conjunction and a soreness
ceiling.

### 🔴 F2 — Signal starvation of the priority hypertrophy muscles

**Severity: Blocks convergence** · `generate_weekly_program.py:330-347` ·
`log_ingest.py:257` · `learners.py:41`

The _only_ per-muscle response signal is `muscle_perf_slopes()`
(`generate_weekly_program.py:330`), derived **exclusively** from e1RM-tracked lifts
(`len(e1rms) ≥ 3`). A lift is e1RM-tracked only if it has loaded sets at
`reps ≤ EPLEY_REP_CAP = 12` (`log_ingest.py:28,257`). The athlete's **top-priority**
hypertrophy muscles — neck, traps, side delts, calves, rear delts, upper chest — are
trained exclusively by high-rep (12–20) isolation to failure, and **no loaded compound
in `EXERCISE_MUSCLE_MAP` maps to neck/traps/calves**. Those sets fail the ≤12 filter →
rep-tracked → **zero e1RM history** → never appear in `perf_slopes`.

Consequence — every learner that keys off the slope goes dark for exactly these
muscles:

- `update_mrv` gets `e1rm_slope=None` → `obs=None` → posterior untouched, forever
  (`learners.py:41`).
- Frequency bandit is gated on `perf_slopes.get(m) is not None`
  (`generate_weekly_program.py:883`) → returns the `default=4` prior forever
  (`learners.py:101`).
- Exploration reward `if slope is None: continue` (`generate_weekly_program.py:704`).
- The volume-tolerance test is fed `perf_slopes.get(tm)` (`generate_weekly_program.py:910`);
  for a slope-less muscle `step_volume_test` still emits `obs = best_tolerated or
week_sets` (it records _tolerated volume_, not a growth response), so the test is the
  one partial rescue — but see F1 for its glacial cadence.

So for the muscles the objective ranks **highest**, the engine runs open-loop on
population priors. Week-count to learn anything from the main loop: **0 of every N
weeks, indefinitely.**

**Fix:** give these muscles a volume-load (Σ weight×reps, per-set normalized) or
rep-PR trend as a fallback response signal when no e1RM series exists; feed it into
`update_mrv`/frequency with a higher `obs_var` so it moves posteriors slowly rather
than not at all. **Tradeoff:** volume-load slope conflates "added a set" with "got
stronger" — normalize per set and lean on the volume-tolerance test (soreness/MRV
direct) as the primary mover.

### 🔴 F3 — The exploration bandit never fires (dead from day 1)

**Severity: Blocks convergence** · `exploration_manager.py:42,104-109` ·
`generate_weekly_program.py:733` · `mpc_prescriber.py:591`

`ControlledExplorationManager.from_dict` re-seeds `np.random.default_rng(seed=42)` on
**every run** (constructor, `exploration_manager.py:42`), and `to_dict`
(`:104-109`) **never serializes RNG state**. `get_exploration_delta` draws exactly
once per run; `select_exploration_parameter` explores only if `rng.random() < epsilon`
(`:74`). Verified at runtime: `default_rng(42).random()` = **0.7740**, and max epsilon
is **0.30** (weeks 1-4). `0.7740 < 0.30` is **False on every run, forever.**

Result: `get_exploration_delta` returns `{}` every week → the reward loop
(`generate_weekly_program.py:702-711`) never executes → `record_outcome` never called
→ UCB1 counts/values stay all-zero. The entire active-probing subsystem is **dead from
the first run** — not "frozen at week 13." This also forecloses the one mechanism that
could have probed the F2 starved muscles.

**Fix:** persist/restore RNG state (`rng.bit_generator.state` in `to_dict`/`from_dict`),
**or** drive exploration deterministically off `step_count` (explore every Nth week) —
preferable here, keeps reproducibility. While fixing, add an epsilon **floor** (~0.10)
with periodic re-warming (see Part 1.3 below). **Tradeoff:** persisted RNG breaks
fixed-seed reproducibility; the deterministic schedule avoids that.

### 🔴 F4 — RLS τ-learner is live and corrupts the Kalman state model

**Severity: Blocks/Slows convergence** · `compute_athlete_state.py:1105` ·
`rls_learner.py:25,45,102,114-116,143-145`

This **resolves a direct conflict between two coverage agents** (one called RLS
"advisory/KEEP", the other "live and corrupting"). The code settles it: it is **live**.
`compute_athlete_state.py:1105` hot-swaps learned τ/c into the Kalman whenever
`rls.is_mature()`, and maturity is just `update_count ≥ 4` (`rls_learner.py:145`) with
`update_count` persisted across runs (`:154`) — i.e. ~4 Sundays.

The author's stated safety mechanism does **not** work as documented. The docstring
(`rls_learner.py:25`) says the `MIN_PHI_VAR` windup guard "keeps theta near the
default." But the guard checks `np.var` of a **heterogeneous-scale** regressor
`[fitness≈10, fatigue≈5, u_t/100≈0.7, nutrition≈0.95]` (`:102`); that variance is ≈14,
~700× the `0.02` threshold, so **the guard never fires at runtime.** Updates pass; θ
is clipped to `THETA_BOUNDS` every update (`:115-116`); and because `φ·θ` is not on the
e1RM-deviation scale of `y_t` (the author's own documented scale-mismatch), the update
drives θ to the clamp **bounds** rather than to a true value. A realistic 4-point
simulation pins all four parameters at their **lower** bounds by week 4
(`tau_fit=20`, `tau_fat=5`, `c_fit=0.05`, `c_fat=0.20` vs defaults `45/15/0.15/0.50`),
which is then injected into the Kalman `A`/`B` matrices that drive every MPC action
score and 14-day forward simulation.

So this is the worst category — not removed, not advisory: a learner that _should_ be
inert is silently **degrading the core fitness/fatigue model** the whole prescriber
rests on. The other agent was right that the bounds are _wide_ and the root cause is
the under-identified estimator, not the bounds — but wrong that it's harmless, because
`is_mature()` does not gate out clamp-pinned θ.

**Fix (cheapest, correct):** stop consuming it — comment out
`compute_athlete_state.py:1105-1106` until a structural estimator exists (joint
state-parameter EKF / offline Banister fit), matching the treatment already applied to
the cellular closed loop. If you want to keep it, gate consumption on
`not _at_bounds(theta) and confidence > THRESH`. **Tradeoff:** you lose τ
personalization, but population defaults are demonstrably better than clamp-pinned
values.

### 🟠 F5 — Frequency saturates at `days_available` → learned high MRV can't be delivered

**Severity: Slows convergence (Blocks for the focus muscles)** · `allocator.py:160` ·
`athlete_profile.py:27,30`

Max deliverable weekly volume for a muscle ≈ `days_available × per-session sets`. With
accessories capped at 2 sets/session (`MAX_ACCESSORY_SETS_PER_EXERCISE`) and ~6 days,
the realizable ceiling is ~12 sets/wk — yet the priors set **MRV 24 for calves and
side_delts** (`hypertrophy_volume.py`), the exact 1.5× emphasis muscles. The allocator
can fund them to MRV and a matured learner can raise MRV further, but
`freq[m] = min(f, days_available)` (`allocator.py:160`) silently clips the schedule.
**A clamp downstream of the learner defeats the learner.**

**Fix:** when `set_target[m] > days_available × per_session_cap[m]`, widen that muscle's
per-session cap to 3 **only on demonstrated tolerance** (soreness low + slope positive
— a signal already computed), or allow a second daily exposure for high-MRV muscles.
**Tradeoff:** bends the "low volume per session" tenet — but only for muscles that have
empirically earned it, which is the explore-when-tolerated behavior the rest of the
design espouses.

### 🟠 F6 — Per-muscle running-interference and cut-MRV are computed, then discarded

**Severity: Slows convergence** · `generate_weekly_program.py:717,723,728,730-736`

`volume_engine.learn_from_response` / `adjust_for_running` / `adjust_for_caloric_deficit`
all mutate the in-memory engine; the result `mrv_dict` is read only to fold in the
(dead, per F3) exploration delta and **never reaches the plan**. The live plan reads
`landmarks_lc` from `LANDMARK_PRIORS` + DB landmarks (the `update_mrv` path) — a
separate pipe. So the **per-muscle** lower-body running-interference model and the
**per-muscle** cut MRV reduction never affect allocation; only the systemic
`r_phase=0.8` cut scalar (`allocator.py:71`) survives.

**Fix:** apply these scalers to `landmarks_lc` before `plan_week`, or delete the dead
calls. **Tradeoff:** wiring them in re-introduces per-muscle cut/running effects (good)
but they'd stack on `r_phase` — reconcile to avoid double-counting the cut.

### 🟠 F7 — Duplicate, dead-end MRV learner

**Severity: Slows convergence (cleanup)** · `hypertrophy_volume.py:123-148` vs
`learners.py:21-61`

Two MRV learners run weekly on the same signals. The Bayesian `update_mrv` is
authoritative (its output is upserted to `athlete_landmarks` and read by the
allocator). The older deterministic `learn_from_response` (±1 MRV rule) writes only to
the discarded in-memory engine (F6) — wasted compute and a drift hazard. **Fix:**
remove `learn_from_response` and the `volume_engine` mutation block; keep `update_mrv`.

### 🟠 F8 — Two split engines decide the split independently and can fight

**Severity: Slows convergence / incoherent week-to-week programming** ·
`generate_weekly_program.py:272-280,529-539` · `mpc_prescriber.py:397-407,644-645`

The weekly path (`program_workouts.focus`) and the daily path
(`training_prescription`) share **weekly set targets** (via `weekly_plans`) but decide
the **split independently**, each from its own log classifier, and on **different
vocabularies** (`upper_a` vs `upper_volume`). The daily prescriber reads
`program_workouts` for `cardio_sessions` only (`:644-645`) — it **never reads the
planned `focus`** — so there is no read-back making the daily card inherit the weekly
plan's split. They agree only incidentally and **diverge on any deviation day**: the
moment a logged session differs from plan, the two classifiers see different history
and can prescribe contradicting splits for the same day. (This is the "unify split
engines" item noted in project memory; it remains unresolved.)

**Fix:** have `mpc_prescriber` read `program_workouts.focus` for TODAY (it already
queries that row) and pass it as authoritative `split` to `SessionGenerator.generate`,
re-deriving only when no plan exists; unify the classifier vocab. **Tradeoff:** the
daily card becomes subordinate to the weekly plan (less reactive to one deviation) —
the correct hierarchy, since the weekly plan carries the learned allocation.

### 🟠 F9 — No fatigue/cut masking → MRV ratchets DOWN during a cut

**Severity: Slows convergence (thrash-during-cut)** · `learners.py:43,48` ·
`strength_progression.py:46-77`

There is no deload by design, and no fatigue-masking handling. On a cut, e1RM slope
flattens or goes negative even when the muscle is adapting. That feeds `update_mrv` as
`e1rm_slope`; `responding = e1rm_slope > 0` reads False, and if soreness is also high,
`obs = weekly_sets − 1` (`learners.py:49`) **ratchets MRV down** — the engine strips
volume during a cut, mis-attributing energy-deficit masking to over-MRV. This is the
one place noisy input actively moves a posterior the wrong way.

**Fix:** the cut phase is already plumbed (`generate_weekly_program.py:901,964`) —
suppress the MRV-down branch and treat a flat slope as "hold" when `phase == "cut"`.
Also down-weight high-rep e1RM signals during a cut (raise `obs_var`), as
`ADAPTIVE_ENGINE_DESIGN.md §5` already prescribes but the code doesn't do.
**Tradeoff:** you stop learning MRV-down during cuts — correct, since you can't
separate over-MRV from deficit masking without a deload.

### 🟡 F10 — Total volume budget anchored to ΣMAV (a frozen prior)

**Severity: Slows convergence** · `allocator.py:67-72`

`recovery_budget = ΣMAV · r_recovery · r_phase`. MAV is nominally learned, but since
MRV rarely matures (F1/F2), ΣMAV stays at the prior, so **total** weekly volume is a
frozen prior scaled only by TSB (`r_recovery ∈ [0.80,1.15]`) and cut phase. The
`MAX_HARD_SETS_PER_DAY` recovery-capacity test that `ADAPTIVE_ENGINE_DESIGN.md §6.1`
specifies to learn the budget is **not implemented** (recovery-stress test is
scaffolding only, `controlled_tests.py:13`). **Fix:** implement the recovery-stress
test or accept ΣMAV as the budget and document it as un-learned.

### 🟡 F11 — Buried magic numbers that should be named knobs

**Severity: Minor → Slows** · various

The deliberate `[ENG]`/`[COACH]` knobs in `athlete_profile.py` are the _legitimate_
pattern. These are the illegitimate ones — values that bias the program but aren't
surfaced as a documented knob:

- Marginal-value curve coefficients `1.00 / 0.80 / 0.20` (`allocator.py:96-103`) —
  these _define_ the inverted-U shape (how aggressively junk-volume is discounted);
  untagged. → move to config; ideally the 0.20 junk-zone slope is **learnable**.
- `r_recovery` constants `0.80 / 1.15 / 0.02` (`allocator.py:70`) — inline, comment
  only. → central config.
- `baseline_weekly` divisors `8 / 12` (`session_generator.py:798-799` etc.) — the
  sets-per-session conversion denominators; uncommented. → name them.
- `program_synthesis._DEFAULT_WEIGHTS` (`program_synthesis.py:26-31`) — a **second**
  frozen copy of the emphasis table used by the MILP fallback; ignores
  `user_profiles.muscle_emphasis`. Drift hazard. → import `MUSCLE_EMPHASIS` or delete
  the fallback (the MILP `update_weights` is already correctly removed per §7).

### 🟡 F12 — Dead clamps that are landmines if ever wired

**Severity: Minor (latent)** · `guardrail.py:48-61,65-76,145-160` · `vdot_engine.py:254`

Four safety mechanisms are defined but have **no caller**: `gate_load_action` (hard
ACWR cap 1.30/1.50), `filter_value` (low-pass α=0.15), `confirmed_state` (3-day
hysteresis), and `mileage_cap` (computed, threaded into `SessionGenerator.generate`,
never read). None harms anything today, but two are traps: wiring `gate_load_action`
re-imposes a hard ACWR gate the design explicitly rejects ("he trains through it",
`mpc_prescriber.py:322`), and wiring `filter_value` onto learner output would smear a
learned step-change over ~7 days — **a Blocks-convergence clamp if ever applied to
`weekly_set_targets`.** → delete or clearly mark dormant; never low-pass the learners'
output. Separately, with `mileage_cap` dead **and** no mileage ramp implemented
(`vdot_engine.base_mileage` is a fixed 15.0, never incremented), **running volume is
essentially unmanaged** — the `+10%/wk` running-tolerance loop in the spec doesn't
exist yet.

### 🟡 F13 — Single-note pain veto can wipe a movement pattern (thrash)

**Severity: Minor** · `learners.py:165-167` · `generate_weekly_program.py:799-802`

`exercise_reward` returns a hard `PAIN_PENALTY = −1.5` floor on **any single** pain
note, and a session-level pain note is attributed to **every** logged exercise sharing
the cautioned muscle. One "shoulder cranky" note drives −1.5 into every pressing
movement at once, and `_is_cautioned` subtracts 8.0 from selection that week — a single
ambiguous datum reshapes the next program. **Fix:** require 2 mentions or severity ≥ 2
before the full veto; a first low-severity mention de-prioritizes, not vetoes.
(Severity ≥ 2 / sharp-strain words still fast-track.) **Tradeoff:** marginally slower
to react to a genuine injury — acceptable.

### Healthy loops (for contrast)

- **VDOT/running fitness** is the one fully-healthy learning loop: idempotent,
  HR-corrected, clamped sanely, feeds the same weekly program (`vdot_engine.py`,
  `generate_weekly_program.py:970-974`). Its only gap is the missing volume ramp (F12).
- **Cellular closed loop** is the one _correctly_ dead learner: `close_loop_update`
  has zero call sites (disabled per §7) while its AMPK/mTORC1 signal still feeds the
  interference penalty as intended.
- **Goal-lift e1RM** (squat/bench/dead) is informative and gets ≥3-session histories —
  but it still can't mature MRV passively (F1) and is corrupted during cuts (F9).
- **Anti-thrash guards** are genuinely good: `K_MAX=0.34`, one-off `SWAP_VOTE=0.5`,
  `already_ran` idempotency, 21-session floor before an exercise swap. The system errs
  toward _too stable_, not jumpy.

---

## Part 3 — Guardrails vs freedom (verdicts)

| Clamp                                                            | Location                            | Verdict                                                                                                                                    |
| ---------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Overreach → REST (HRV↓ **and** autonomic↑)                       | `guardrail.py:122`                  | **KEEP** — genuine 2-signal safety stop, correctly rare                                                                                    |
| Cut macro floors (protein 1.3 g/lb, fat, carb cycling, 6-wk cap) | `nutrition_modulator.py`            | **KEEP** — firm by design (TNF); within stated philosophy                                                                                  |
| `recovery_budget` ∈ [0.80, 1.15], cut ×0.8                       | `allocator.py:70-72`                | **KEEP** — soft, symmetric, deload-replacement                                                                                             |
| `THETA_BOUNDS`                                                   | `rls_learner.py:36`                 | **KEEP the bounds, disable consumption** — bounds are wide; the problem is the under-identified estimator feeding them (F4), not the rails |
| Accessory RIR 0 / strength RIR floor 1 / sets 1-2                | `athlete_profile.py:27-32`          | **KEEP** — the philosophy, centralized, applied last                                                                                       |
| ACWR soft penalty `2.0·(acwr−1.3)²`                              | `mpc_prescriber.py:289`             | **KEEP** — soft, quadratic, rarely binding                                                                                                 |
| RIR adjustments duplicated in `_scale` + soreness                | `session_generator.py:459-470,1166` | **MAKE CONSISTENT** — strength RIR can drift to 3-4 via paths outside the central knob                                                     |
| Frequency saturation at `days_available`                         | `allocator.py:160`                  | **MAKE ADAPTIVE** — see F5 (clips the focus muscles' learned MRV)                                                                          |
| `gate_load_action`, `filter_value`, hysteresis, `mileage_cap`    | dead                                | **DELETE / mark dormant** — see F12                                                                                                        |

No clamp on the nutrition or safety side is a disguised belief blocking exploration —
they're genuine rails. The over-clamps that block convergence are all on the
_training-volume delivery_ side (F5) and in the _learner-consumption_ path (F4).

---

## Part 1.3 — Exploration adequacy (years-in)

Independent of the seed bug (F3), the schedule anneals epsilon to **0.05 permanently by
week 13** with no re-warming (`exploration_manager.py:24`) and a **fixed seed 42**. For
an indefinitely-running N=1 system whose athlete keeps changing (new training age, new
cut, new equipment), this freezes a local optimum: ~1 probe every 20 weeks even if the
seed bug were fixed. The `+1 set` step is reasonable for a low-volume philosophy, but a
1-set probe on a 2-set muscle is a 50% jump — fine, just note the cap matters. **Fix:**
epsilon **floor** ~0.10 with periodic re-warming (e.g. bump to 0.20 after any phase
change), and drive the draw deterministically (F3).

---

## Verdict

**Can the system converge to optimal for these goals?** As built: **no — it converges
to the population prior and largely stays there.** The allocation/scheduling half is
sound and points at the goals (emphasis, goal-weighting, and the inverted-U all work).
But the personalization half is inert: MRV can't mature on passive data by construction
(F1); the priority hypertrophy muscles have no learning signal at all (F2); the active
exploration that was meant to break the deadlock never fires (F3); and the one
parameter learner that _is_ live (RLS τ) actively corrupts the state model under the
prescriber (F4). The system doesn't thrash — its guards are, if anything, too
conservative — so the failure mode is **silent stagnation at the prior**, not
instability. The good news: the priors are well-hand-tuned and the allocation is
correct, so the _prior_ program is a reasonable program. The system just can't discover
that the athlete's true MRV for side delts is 20 instead of 16, or that he grows better
at frequency 5 than 4 — the exact N=1 personalization that justifies the architecture.

## Top 3 highest-leverage changes

1. **Fix exploration (F3) — one-line-class fix, unblocks the most.** Drive the probe
   deterministically off `step_count` (or persist RNG) and add an epsilon floor. This
   is the cheapest change with the largest surface: it revives the only mechanism that
   actively gathers information, and it's the precondition for the starved muscles (F2)
   ever getting probed.
2. **Give the priority hypertrophy muscles a real signal (F2) + decouple the MRV
   maturity guard (F1).** Add a volume-load/rep-PR fallback slope for slope-less
   muscles and let strong passive weeks separate the posterior without a designed test.
   Together these turn the half-dozen most-prioritized muscles from open-loop to
   learnable. Pair with prioritizing them in `pick_volume_test_muscle`.
3. **Stop consuming clamp-pinned RLS θ (F4).** Comment out the hot-swap (or gate on
   `not _at_bounds`). Cheapest correctness win in the system — it removes active
   corruption of the fitness/fatigue model that every MPC decision rests on.

Honorable mention: unify the two split engines (F8) and wire the discarded per-muscle
cut/running modifiers (F6) — both are coherence fixes that stop the program from
quietly contradicting itself.
