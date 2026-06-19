# Science.md Alignment Report

How OptiGainsOS's actual implementation maps to the engines specified in `Science-Unified.md` (the merged source-of-truth spec, which superseded `Science.md` + `sciencev2.md` on 2026-06-18), and where the **frontend cannot close the gap alone** (engine/backend work). Page-fixable gaps were addressed in the UX/UI fix pass; this document is the report-only backlog.

> Framing: `Science-Unified.md` describes an idealized research backend (Go microservices, Kafka, OR-Tools CP-SAT, PyMC/JAX, GRPO RL, gRPC). This repo is React+Vite+Supabase + simplified Python in `scripts/engine/`. "Alignment" means the app faithfully surfaces each engine's *intended user-facing output*, not that it reimplements that infrastructure.

## Downregulation policy (binding: read before building any fatigue, deload, or auto-regulation surface)

The athlete trains hard and rejects scheduled/calendar deloads as a programming crutch. There is no competition or event, so **no peaking taper applies** anywhere in this app. The athlete also **trains to failure / 0 RIR by choice**: the engine does NOT raise his RIR or push him off failure as a fatigue lever. It accounts for the extra fatigue that failure generates (see Engine change E2) and manages it by trimming VOLUME. Any surface that reduces prescribed work must follow the rules below. Build to this policy, not to a generic "readiness app" pattern that backs the user off on a single bad HRV reading.

1. **Train-as-prescribed is the default.** Downregulation is the earned exception, never the resting posture. A surface that nudges "take it easy" on weak or single-signal evidence is a defect, not a feature.
2. **Volume is the only downregulation lever. Never drop the bar load, never force RIR up.** Load is the stimulus and the athlete chooses to train to failure. When fatigue is genuinely confirmed, the engine cuts SETS (and may insert rest), holding both load and his chosen proximity-to-failure. A `DELOAD` concept must mean "cut ~30-50% of volume for 3-5 days at held load and held RIR," never "lower the weight" and never "back off to higher RIR."
3. **Require converging, sustained evidence before any cut.** At least two independent signals (e1RM or rep-velocity decrement AND autonomic suppression: HRV down with RHR or all-day stress up), sustained 3-5 days. One signal or one day is noise. This matches `HYSTERESIS_DAYS = 3` and the existing gate in `strength_progression.process_strength_progression` (slope < -0.10 AND hrv_z_3d < -1.2).
4. **Thresholds are learned priors, not fixed law.** The hardcoded z-score limits (`HRV_Z_OVERREACH` etc. in `guardrail.py`) are population defaults the Athlete Learning Engine should refine toward this athlete's tolerance. If his data shows he progresses through a given dip, the engine learns to stop flagging it and converges to his recoverable ceiling. Do not surface a fixed textbook threshold as if it were truth.
5. **Keep exactly one mandatory reduction: the slow-tissue backstop.** If e1RM declines over *weeks* with sustained autonomic suppression, force a *volume* cut (never a load drop) as non-functional-overreaching / connective-tissue protection. This is the catch-the-fall rail the good programming is meant to never trigger, not a routine event. Frame it to the user as what lets him train hard without self-policing.

No scheduled deloads. No peaking taper. Any "deload" concept elsewhere in this doc (the `/train` and `/workout-detail` progression commands, the `DELOAD` daily-prescription label in Model Orchestration) must conform to rules 2-5.

## Engine behavior changes (make it train the way Nolan wants)

This section is the actionable backend backlog. It is grounded in an audit of the
current Python engine (file:line refs below) and in two verified deep-research passes
(`RESEARCH_VS_SCIENCE_2026-06.md`). `Science-Unified.md` is the merged source-of-truth
spec; this section is the diff between that target and what the code does today.

Standing goals: **hypertrophy is primary, pursued through SBD (squat/bench/deadlift),
with concurrent strength as a real secondary goal.** Train-to-failure stays. No
deloads. Landmarks/thresholds are learnable priors, not laws.

### [DONE] E1 [high]: Flip the default goal priorities to hypertrophy-primary
- *Current:* `allocator.default_goal_priorities` (allocator.py:67-71) returns
  `{strength 0.40, hypertrophy 0.30, pst 0.30}` for the default phase, weighting
  strength above hypertrophy. This contradicts the stated primary goal.
- *Change:* hypertrophy should carry the top weight but PST/endurance must stay
  MAINTAINED, not crushed (the athlete wants concurrent PST readiness toward a soft
  end-of-August 2026 target). Use e.g. `{hypertrophy 0.40, strength 0.30, pst 0.30}` for
  the default phase: hypertrophy-led, strength and PST held. Keep the BUD/S-prep branch as
  is. The run plan should build toward a maintainable PST readiness plateau by August
  WITHOUT a peak/taper (steady build, not spike), consistent with the no-peaking policy.
  Resolved (concurrent-training research, 2026-06-18, verified): TRUE YEAR-ROUND CONCURRENT,
  not blocks. Keep ONE blended weight set (no rotating phase profiles); both adaptations
  advance together at these volumes. See E13 for the concurrent-structure engine changes.

### [DONE] E2 [high]: Model the fatigue cost of training to failure
- *Done:* `log_ingest.proximity_fatigue_factor` scales the volume-fallback session
  TSS (Banister fatigue channel) by proximity to failure (RIR<5 → >1.0×, 0 RIR →
  1.30×), so a 0-RIR and a 3-RIR session no longer cost the same. Multiplier is
  always ≥1.0 (never discounts load / raises RIR). Coeff `EFFORT_COST_PRIOR=0.06` is
  a wide prior, override-able per athlete via the `effort_cost_coeff` engine param
  (online learning of it deferred, consistent with RLS/cellular being persisted-but-
  inert). Garmin EPOC path untouched (already a measured load). Tolerant of string
  reps / malformed RIR.
- *Current:* Fatigue accrues only from a fixed per-session TSS constant
  (`mpc_prescriber.ACTION_TSS`, STRENGTH=70, mpc_prescriber.py:91-102) fed into the
  2-state Banister model. RIR is used ONLY to back-calculate e1RM and scale load
  (`strength_progression.compute_e1rm` 18-20; `session_generator` 1311). There is NO
  effective-reps term and NO proximity-to-failure fatigue term: a 0-RIR set and a
  3-RIR set on the same lift produce identical fatigue (audit dim 4).
- *Change:* add a per-set/per-session fatigue contribution that scales with proximity
  to failure (lower RIR → higher fatigue), feeding the Banister fatigue channel and/or
  the recovery budget. This is what makes "he trains to failure, the engine manages it
  by trimming volume" actually function. Failure is preserved; its cost becomes
  visible to the allocator. Effort-cost should be a learnable coefficient (his real
  recoverability from failure work), not a fixed constant.

### [DONE] E3 [high]: Replace the hard MRV ceiling with diminishing-returns + recovery-cost
- *Done:* Greedy `allocator` now uses NET marginal value = `marginal_benefit` (small-but-
  positive past MRV, no cliff) − convex `recovery_cost` (≈0 below MAV, rising past it,
  scaled by `recovery_cost_mult`). Hard `>= mrv: continue` replaced by a numeric backstop
  at `mrv·SOFT_MRV_OVERSHOOT` (1.30). MILP `_milp_solve` hard `sum<=MRV` replaced by a
  two-tier piecewise-concave overshoot (overshoot var `o[i]`, discounted at OVERSHOOT_VALUE).
  `plan_week`/`allocate` thread `recovery_cost_mult` (default 1.0; E9 wires the deficit/
  fatigue value). learners.py MRV-down ratchet relabeled recovery-limited (not inverted-U).
- *Current:* HARD cap. `allocator.allocate` stops funding a muscle at MRV
  (allocator.py:145-146); `marginal_value` returns 0 at/above MRV (allocator.py:111-122);
  the fallback MILP enforces `sum(sets) <= MRV` (program_synthesis.py:158-165). The
  marginal-value curve already tapers (1.0 → 0.80 → 0.20 → 0.0), which is the right
  *shape*, but the hard zero at MRV is the cliff the evidence does not support
  (inverted-U refuted; no plateau to ~25 sets).
- *Change:* let marginal value stay small-but-positive past the old MRV, offset by an
  explicit rising **recovery-cost** term (informed by E2's fatigue accounting), so the
  allocator naturally stops adding volume when the recovery cost outweighs the
  shrinking benefit, not at a fixed wall. Relax/remove the MILP hard cap to match.
- *Reframe (learners.py:75-78):* the MRV-down ratchet (stall + soreness ≥ 7 → MRV−1)
  is defensible but should be documented as a **recovery-limited** signal ("cost too
  high here"), NOT as "more volume reverses gains." Keep it; relabel the rationale.

### [DONE] E4 [med]: Separate the strength and hypertrophy volume curves
- *Done:* The blended `w[m]` no longer drives volume all the way up. New
  `strength_weights` exposes the strength share; `effective_weight`/`marginal_value`
  saturate that share past `STR_SAT_SETS≈5` (exp decay), so the fast-saturating strength
  demand is funded from the early SBD sets (credited to both goals below saturation) and
  hypertrophy/PST carry the high-volume tail. Verified: a strength-heavy muscle yields
  less marginal value than a pure-hypertrophy muscle of equal blended weight past
  saturation. Strength prescription stays RIR-insensitive (volume-curve change only).
- *Current:* a SINGLE combined weekly set target per muscle. `allocator.goal_weights`
  (allocator.py:93-108) folds strength/hypertrophy/pst into one `w[m]`; one scalar
  target per muscle (audit dim 3). SBD compounds already get FULL multi-muscle set
  credit (muscle_map.py:20-106; audit dim 8), which is correct for concurrent work.
- *Change:* recognize the two curves have different shapes (strength saturates ~4-6
  hard sets on the SBD prime movers; hypertrophy keeps climbing). The allocator should
  fund the small, fast-saturating strength requirement from the SBD work first, then
  let hypertrophy volume climb on top, crediting the SBD sets toward both. This is how
  "hypertrophy-primary via SBD + concurrent strength" becomes real rather than a single
  blended number. Strength prescription must stay RIR-insensitive (research: RIR has a
  null relationship with strength); only hypertrophy benefits from proximity to failure.

### [DONE] E5 [med]: Gate volume/MRV convergence to mesocycle timescales; fix Banister personalization
- *Done:* Added `MESOCYCLE_MIN_OBS=8` floor to BOTH MRV maturity sites (`update_mrv`,
  `apply_mrv_observation`): a volume parameter now requires CI-separation AND ≥8 weekly
  observations to be declared mature, so a low-`obs_var` designed test (which tightens the
  CI in ~2 weeks) can no longer mature a slow hypertrophy signal prematurely. F1 maturity
  still reached (~week 9). Frequency learner already gated on `FREQ_MIN_N`.
- *Banister personalization:* already DISABLED as a Kalman consumer (CONVERGENCE_AUDIT F4,
  documented at compute_athlete_state.py:1104-1117 — under-identified, kept persisted but
  NOT consumed). Per E5's "or stop presenting its output as learned," that disable already
  resolves it; re-enabling needs a structural joint state-parameter estimator (out of scope).
- *Current:* MRV/frequency learners are Kalman-style Normal posteriors with a maturity
  gate (95% CI excludes prior; learners.py:86, K_MAX=0.45). RLS personalization of the
  Banister constants (rls_learner.py) is guarded to stay near population defaults and is
  effectively **advisory/non-functional** (identifiability problem, audit dim 7).
- *Change:* verify the maturity gate + `OBS_VAR` cannot let a hypertrophy-volume
  parameter "mature" on under ~8-12 weeks of noisy data (hypertrophy signal is slow;
  research). Either make Banister personalization actually work (structural/EKF joint
  state-parameter estimation, as Science.md originally specified) or stop presenting its
  output as learned.

### [DONE] E6 [low / doc]: Frequency table is stale; code is already correct
- *Done:* No code change (the allocator already derives frequency from set target ÷
  per-session cap with a learned override). The fixed per-muscle peak-frequency table is
  already ABSENT from `Science-Unified.md` — the merge removed it (changelog C3; see lines
  ~53, ~214 "the per-muscle peak-frequency table is omitted entirely", ~1265). Nothing to
  remove; satisfied by the unified spec.
- *Current:* code DERIVES frequency from set target ÷ per-session cap with a learned
  override (`allocator.frequency_targets` 157-182; bandit in learners.py 117-143). This
  already matches the evidence (frequency is a volume-distribution lever, not a driver).
- *Change:* none in code. Remove the fixed per-muscle peak-frequency table from the
  science spec (handled in `Science-Unified.md`); it misrepresents how the engine works.

### [DONE] E7 [note]: State estimation is 2-state Banister, not the 4-state EKF the spec claims
- *Done (doc):* Added an "Implementation status (E7)" callout to `Science-Unified.md` §1
  (State Estimation) stating the shipped engine is the 2-state Banister Kalman, the DEKF /
  decoupled systemic-vs-structural split is aspirational, and the RLS parameter learner is
  disabled-as-consumer (F4). Per the recommendation, the doc is aligned to reality and the
  EKF is deferred. No code change.
- *Current:* `banister_kalman.py` is a 2-state (fitness/fatigue) model; the decoupled
  systemic-vs-structural 4-state EKF in Science.md is NOT implemented (audit divergence 1).
  This is the root cause of several frontend "decoupled readiness / confidence" gaps below.
- *Decision needed:* either build the EKF or align the spec to the Banister reality.
  Given the priorities above, this is lower urgency than E1-E4; recommend aligning the
  doc now and deferring the EKF.

### [DONE] E8 [med]: Enforce bounded self-experimentation dosage (the "how much to experiment" policy)
- *Done:* `select_exploration_parameter`/`get_exploration_delta` gained an `eligible`
  filter; the orchestrator now (a) suppresses the bandit probe entirely while a
  volume-tolerance controlled test is active (one probe at a time), and (b) restricts
  eligible arms to muscles whose MRV posterior is still WIDE (not `mature` = Clues/Patterns
  phase), so as posteriors converge to Established the eligible set shrinks and exploration
  DECAYS to silence (empty eligible → no probe). Probe magnitude stays +1 set (recovery-safe);
  the hazard halt is unchanged. Probe computation moved after the landmark/test state is known
  so the gate sees fresh maturity flags. Mesocycle window: maturity now needs ≥8 weeks (E5),
  which is what gates an arm out of eligibility.
- *Current:* `exploration_manager.py` + `controlled_tests.py` run probes and halt on
  `hazard_score > 0.6` (audit), but there is no explicit guarantee of one-probe-at-a-time,
  no uncertainty gate that decays exploration as posteriors mature, and no enforced
  mesocycle evaluation window.
- *Change:* implement governing constraint 6 in `Science-Unified.md`: at most one active
  probe (one muscle by one variable) with everything else held at known-good; gate probe
  initiation on posterior width (explore only in the Clues phase, lock at Established);
  decay exploration as the model converges; bound probe magnitude to a recovery-safe
  range; keep the hazard-halt; use an 8-12 week probe/evaluation window. This is the
  direct answer to "how much should the engine experiment on me": rarely, one thing at a
  time, aggressively early and near-silent once converged.

## Data-flow changes (make ingested data actually drive the engine)

From the data-ingestion audit. Most inputs are properly used (HRV, RHR, sleep score, body
battery, Garmin stress, training load, logged sets/RIR/e1RM, soreness, energy, bodyweight
trend all feed real engine paths). The items below are the exceptions.

### [DONE] E9 [high]: Wire the nutrition modulation outputs into the engine (currently dead code)
- *Done:* (1) `tau_fat_adj` now feeds the Kalman fatigue-decay: nutrition modulation moved
  BEFORE the daily Kalman step, and `BanisterKalman.predict/step` gained a TRANSIENT
  `tau_fat_eff` (deficit slows clearance for that step only — never overwrites/compounds the
  learned base tau_fat). (2) `mrv_adj`'s deficit feeds the allocator via E3's
  `recovery_cost_mult = 1/(1−ETA·deficit_ratio)` in generate_weekly_program → plan_week,
  complementary to the systemic r_phase budget cut (mult bounded ≤1.356 at max deficit).
  Volume-only; bar load/RIR untouched. Safe when nutrition data absent (→ neutral).
- *Current:* `nutrition_modulator` computes `tau_fat_adj` (deficit slows fatigue clearance)
  and `mrv_adj` (`base_mrv_sets * (1 - 0.75 * deficit_ratio)`), writes them to
  `athlete_state` for the UI, but **neither is consumed**. The Kalman filter always uses
  static/RLS `tau_fat` (compute_athlete_state.py ~1149), and the session generator reads
  only the nutrition *phase* (to suppress the MRV-down ratchet), never `mrv_adj`. The
  `0.75 * deficit_ratio` formula is effectively dead.
- *Change:* feed `tau_fat_adj` into the Kalman fatigue-decay update and feed `mrv_adj`
  into the volume allocator's recovery-cost term (E3), so "a caloric deficit compresses
  recoverable volume" is real rather than displayed. This is the highest-value data fix:
  the deficit/recovery coupling the spec promises does not currently happen.

### [DONE] E10 [med]: Harden the TDEE / trend-weight method
- *Done:* New pure, tested `engine/tdee.py`; `compute_athlete_state.estimate_tdee` delegates
  to it. Implements all five points: (1) EWMA trend weight (alpha~0.10/day) replaces the raw
  linear regression in `compute_nutrition` (slope taken as OLS of the smoothed series to keep
  magnitude unbiased); (2) rolling-window `adaptive_tdee` re-derived each call (captures
  adaptive thermogenesis without hard-coding β_AT); (3) composition-aware Forbes energy density
  `p·1820+(1-p)·9440`, `p=C/(C+F)`, C=10.4kg, replacing the fixed ~3500 kcal/lb; (4)
  early-transient discount (`energy_density_kcal_per_lb(..., weeks_in_phase)`) so the wk1-2
  water/glycogen step isn't booked as fat; (5) the 25% trust GATE replaced by a trust BLEND +
  sanity CLAMP and a learned `intake_bias` term anchored on the trend-weight signal (logs are
  corrected, never discarded). Guards bodyweight≤0 → clean prior fallback. Feeds the E9
  nutrition modulation. Refinement available: pass real physique bodyfat (currently an 18%
  prior) and a phase-start date for `weeks_in_phase` at the call site (both default safely).
- *Current:* `estimate_tdee` blends a 15.5 kcal/lb bodyweight prior 50/50 with an
  energy-balance estimate using a 500 kcal/lb constant, and falls back entirely to the
  prior when logged calories sit outside 75-125% of it. Weight trend is a plain linear
  regression over 3-14 entries (no exponential smoothing).
- *Change (concrete spec, from verified research R1):* the single fixed constant is
  indefensible because the energy density of weight change is composition-dependent and
  time-varying (fat ~4280 kcal/lb / 9440 kcal/kg vs lean ~825 kcal/lb / 1820 kcal/kg, a
  ~5x gap; short-window 2-week change is ~84% fat-free mass at only ~2380 kcal/kg).
  Reference model: Hall/NIDDK dynamic energy-balance (Lancet 2011), validated to -0.47 kg
  bias over 2 years. Implement:
  1. **Trend weight:** replace the linear regression with an EWMA on daily scale weight,
     alpha ~0.10/day (~7-10 day half-life; the public Hacker's-Diet analog of MacroFactor's
     proprietary recency-weighted average). Derive the slope from the EWMA series.
  2. **Adaptive TDEE:** rolling-window (trailing ~14-28 days) reconciliation:
     `TDEE = mean_intake - (delta_trend_weight * energy_density) / days`. Re-derive every
     window so adaptive thermogenesis (~120 kcal/day, beta_AT=0.14, tau_AT=14d) is captured
     automatically without hard-coding it.
  3. **Composition-aware energy density (not a constant):** use the Forbes partition
     `p = C/(C+F)`, C=10.4 kg, F = current fat mass, to split weight change into lean
     (~1820 kcal/kg) and fat (~9440 kcal/kg): `density = p*1820 + (1-p)*9440`. A lean
     lifter partitions more change to lean, so the effective density is lower in a cut and
     a real consideration in a bulk.
  4. **Early-transient handling:** on a phase change (deficit onset, refeed, carb/sodium
     swing) discount or widen-smooth the weight-trend->energy conversion for ~1-2 weeks, or
     carry a separate glycogen/water compartment (Hall: ~500 g glycogen, 2.7 g water per g),
     so the week 1-2 water step is not attributed to fat. Energy density ramps from ~2380
     (wk2) toward ~6000 kcal/kg by ~wk6 of a sustained deficit.
  5. **Replace the 25% trust gate:** under-logging is the dominant error channel (ΔEI
     uncertainty explains ~48-61% of individual prediction variance). Do NOT discard logs
     and fall back to a static prior. Treat logged intake as a noisy observation with a
     **learned per-person bias term** (systematic under-report), and anchor TDEE on the
     weight-trend signal (which integrates true energy balance). A Kalman/Bayesian
     reconciliation fits and matches the learned-priors stance.
- *Caveats / limits:* all source studies are in overweight/weight-stable adults under
  restriction, not lean trained lifters in a surplus, so the bulk/recomp energy-density
  numbers are extrapolations from the Forbes function. Recomposition (simultaneous fat
  loss + muscle gain) breaks simple energy-balance bookkeeping outright; during recomp/
  lean-bulk, lean more on intake-vs-weight-stability than on composition inference. R1
  sources: Hall Lancet 2011 + NIDDK Web Appendix; Heymsfield/Thomas Obesity Reviews 2014
  (PMC3970209); Bhutani/Schoeller 2017 (PMC5506524); Muller/Heymsfield Metabolism 2012;
  Guo/Hall AJCN BWP validation; MacroFactor published method (constants proprietary).

### [DONE] E11 [low]: Resolve collected-but-unused signals (use or drop)
- *Done — per field:* `sleep_duration_min` is now USED — new `engine/sleep_debt.py`
  (`sleep_debt_hours`, `is_poor_night`); `compute_recovery` surfaces `sleep_debt_7d_hours`
  and `_consecutive_poor_sleep` now prefers actual duration (a night < 6h) over the 0-100
  score (score kept as fallback). `tss_cycling`/`tss_swim` → cycling/swim DISTANCE is now
  consumed by the modality-aware interference (E13). Remaining fields decided as DROP-
  candidates (no active wiring, left collected for possible future use): `vo2max_cycling`,
  `steps`, `active_calories`, `tss_run`, Apple-Health `ah_*`, `daily_readiness.mood`, and
  the redundant scalar `daily_readiness.stress` (Garmin `stress_score` is the one used).
  Dropping their collection is a frontend/DB change out of engine scope.
- *Current, never read by any engine:* `sleep_duration_min`, `vo2max_cycling`, `steps`,
  `active_calories`, `tss_run/cycling/swim`, Apple-Health `ah_*` fields, `daily_readiness.mood`,
  and a redundant scalar `daily_readiness.stress` (Garmin `stress_score` is used instead).
  `food_entries.carbs/fats` feed only the weekly meal planner, not the daily compute.
- *Change:* decide per field. `sleep_duration_min` is the obvious one to actually use
  (true sleep debt vs. the 0-100 sleep_score). Drop or stop collecting the rest, or wire
  them deliberately. Don't leave ingested-but-dead fields implying coverage that isn't there.

### [DONE] E12 [note]: Reconcile the spec to the sensing reality
- *Done (doc):* Added an "Implementation status / sensing reality (E12)" callout to
  `Science-Unified.md` §5 (Fatigue Detection): marks respiratory_rate, skin_temperature, and
  movement/bar velocity as uncollected/future hardware; states the engine uses HRV/RHR as
  Kalman noise-scalers + z-score gates and EWMA-ACWR/hazard (not the fixed 0.35/0.15/0.20
  linear blend); notes true sleep debt now derives from logged duration (E11). The fixed
  weighting is NOT forced into code. No code change.
- *Current:* `Science-Unified.md` still inherits sensor claims the app does not collect
  (`respiratory_rate`, `skin_temperature`, `movement_velocity` / bar velocity), and a
  fixed fatigue-weighting (lnRMSSD 0.35, RHR 0.15, sleep debt 0.20). The engine instead
  uses HRV/RHR as Kalman noise-scalers and z-score gates, which is more principled than a
  fixed linear blend.
- *Change (doc):* update `Science-Unified.md` to describe the noise-scaling/z-score approach
  actually used and to drop the uncollected sensors (or mark them as future hardware).
  Do not force the 0.35/0.15/0.20 weighting into code; the current approach is defensible.

## Concurrent-training structure (E13, from verified research 2026-06-18)

The hypertrophy + endurance goal is pursued TRUE CONCURRENTLY year-round (resolved; see E1).
These changes make the engine manage the interference instead of treating running as one
generic penalty.

### [DONE] E13 [med]: Modality-aware interference, lift-first scheduling, polarized base, maintenance levers
- *Done:* (1) Modality-weighted interference: `MODALITY_INTERFERENCE` (running 1.0 ≫
  cycling 0.25 > swimming 0.10; continuous>HIIT) + `apply_endurance_interference`;
  generate_weekly_program now queries cycling/swim km and feeds a modality dict, so the
  bike/pool aerobic base barely dents leg MRV. `apply_running_interference` kept as
  backward-compat wrapper. (2) Duration: run sessions carry `max_minutes` caps (continuous
  capped longer than short hard intervals). (3) Lift-before-endurance: `evaluate_two_a_day_split`
  returns an explicit `LIFT_BEFORE_ENDURANCE` sequence; caller stamps lift AM / cardio PM on
  both halves. (4) Polarized 80/20: `build_run_plan` floors hard quality at a maintenance dose
  (never zero), caps it, scales by PST gap (no taper), tags intensity. (5) Maintenance floors:
  leg MRV floored at mev+1 (running never zeros legs); run quality floored. Partial: full
  cross-day hard-leg/hard-run separation in the MPC sequencer is not deepened (the two-a-day
  6h separation + lift-first ordering covers the shared-day case).
- *Current:* `hypertrophy_volume.apply_running_interference` applies one generic per-km
  lower-body MRV reduction (`RUNNING_OMEGA`); the engine does not distinguish endurance
  MODALITY (running vs cycling vs swimming) or continuous vs HIIT running. `build_run_plan`
  is already "lightweight polarized," which is correct. The 6h-separation / two-a-day logic
  exists but does not encode lift-before-endurance ordering or a maintenance-dose floor.
- *Changes:*
  1. **Modality-weighted interference:** running interferes with leg hypertrophy far more
     than cycling (Type I fiber SMD -0.81 vs no significant cycling effect); swimming is
     mechanistically low-interference (non-weight-bearing, concentric-biased). Weight the
     interference term by modality (running high, cycling low, swimming lowest) and make
     CONTINUOUS running cost more than HIIT/PST-pace running. Prefer cycling/swimming for the
     high-volume aerobic base (also 2 of 3 Ironman disciplines).
  2. **Duration over frequency:** interference scales most steeply with session DURATION, so
     penalize long continuous aerobic sessions more than session count. Cap continuous-run
     duration; keep aerobic sessions short.
  3. **Lift-before-endurance on shared days:** protects ~6.9% lower-body dynamic strength at
     no cost to hypertrophy/aerobic. Encode in the two-a-day / scheduling sequence; keep hard-
     leg and hard-run days separated.
  4. **Polarized 80/20 run/aerobic intensity:** mostly easy Zone 2 (serves the Ironman base),
     small hard fraction at threshold/VO2 (PST speed). `build_run_plan` already leans this way;
     make the 80/20 split explicit and scale the hard fraction by the PST readiness gap, not by
     a peak/taper.
  5. **Maintenance-dose floors (the key to concurrent-without-blocks):** VO2max holds on ~2
     quality sessions/wk at maintained intensity; muscle holds on 1-3 hard sets 2-3x/wk. When
     one quality is de-emphasized, drop it to its maintenance floor rather than zero. Under
     concurrent fatigue (his train-to-failure, no-deload style), the engine cuts VOLUME toward
     these floors as the downregulation lever, never load, never RIR (ties to the
     Downregulation policy and E2/E3).
- *Caveats:* most sources are recreationally trained, not resistance-trained hybrid athletes;
  swimming's low-interference profile is mechanistic inference, not measured; the running-vs-
  cycling subgroup rests on ~3 studies. Treat modality weights as learnable priors (per the
  learned-priors principle), not fixed constants. R2 sources: umbrella review PMID 41762427
  (2026); Lundberg/Schumann 2022 (PMC9474354); Wang/Lu 2024 NMA (S1728869X23000679); Eddens
  2017/2018 (PMC5752732); Hickson 1981 (PMID 7219129); Androulakis-Korakakis 2020 (PMID
  31797219); Stoggl/Sperlich 2014 (fphys.2015.00295).

## Engine → implementation map

| Engine | Implemented | Python module | Surfaced on |
|---|---|---|---|
| State Estimation Engine | ✅ | `engine/banister_kalman.py (+ engine/rls_learner.py for param` | /athlete-state, /today, /dashboard, /recovery |
| Recovery Profiling Engine | ✅ | `engine/hypertrophy_volume.py + engine/learners.py (Bayesian ` | /recovery, /athlete-state, /weekly-schedule |
| Running Adaptation Engine | ✅ | `engine/vdot_engine.py` | /athlete-state, /today, /weekly-schedule, /insights |
| Nutrition Integration Engine | ✅ | `none (dynamic TDEE = src/utils/coachingUtils.js calculateAda` | /fuel, /food-tracker, /physique, /dashboard |
| Fatigue Detection Engine | ✅ | `engine/guardrail.py (overreaching + ACWR caps + hysteresis) ` | /athlete-state, /recovery, /today, /dashboard |
| Program Synthesis Engine | ✅ | `engine/program_synthesis.py (MILP) + engine/allocator.py (gr` | /weekly-schedule, /program/:id, /program-builder, /today |
| Session Generation Engine | ✅ | `engine/session_generator.py (+ engine/strength_progression.p` | /today, /train, /workout-detail, /program/:id |
| Concurrent Interference Engine | ✅ | `engine/hypertrophy_volume.py apply_running_interference (the` | /weekly-schedule, /recovery, /today, /athlete-state |
| Two-A-Day Decision Engine | ✅ | `engine/session_generator.py evaluate_two_a_day_split (consum` | /weekly-schedule, /today |
| Athlete Learning Engine | ✅ | `engine/learners.py (Normal posteriors w/ maturity gating) + ` | /insights, /athlete-state, /brief-history |
| Controlled Experimentation Engine | ✅ | `engine/controlled_tests.py + engine/exploration_manager.py (` | /insights, /athlete-state, /weekly-schedule |
| Strength Progression Engine | ✅ | `engine/strength_progression.py (+ engine/log_ingest.py e1RM ` | /athlete-state, /insights, /workout-detail, /today |
| Hypertrophy Volume Engine | ✅ | `engine/hypertrophy_volume.py + engine/allocator.py` | /recovery, /weekly-schedule, /insights |
| Resource Allocation Engine | ✅ | `engine/resource_allocator.py (reserve-based scaling` | /today, /weekly-schedule, /athlete-state |
| Model Orchestration Engine | ✅ | `scripts/mpc_prescriber.py (MPC over Banister) + scripts/comp` | /today, /dashboard, /brief-history |
| UX/UI Architecture | ❌ | `none (frontend` | /today, /dashboard |
| Product Architecture | ❌ | `none` |  |

## Engine-level gaps (need backend/engine work — report only)

### State Estimation Engine (EKF / decoupled systemic vs structural readiness)
- **[high]** `/today` — A single primary readiness verdict backed by DECOUPLED systemic fitness/fatigue vs localized STRUCTURAL fatigue, EACH with a confidence score derived from filter covariance, plus a degraded-confidence flag when wearable data is missing.
  - *Current:* Only one undifferentiated recovery.score drives the ring and band. The decoupled systemic-vs-structural split is never shown, and the banister confidence value (banister_state.confidence, which the hook exposes via selectBanister) is never read or displayed. No degraded-confidence flag.
- **[high]** `/mind` — Subjective inputs captured here should contribute to systemic readiness estimation; at minimum the page should let the user log the subjective signals (sleep quality/duration, stress, soreness/mood) that the state estimator consumes.
  - *Current:* No subjective-readiness capture exists on this route. There is no sleep, stress, mood, or soreness input and no display tying back to readiness/recovery budget. The route was repurposed for PersonalOS life-OS content unrelated to the State Estimation Engine.
- **[high]** `/brief-history` — Past readiness verdicts (systemic vs structural, with confidence) should be visible per day so the user can see how readiness evolved.
  - *Current:* daily_briefs.brief_json contains no readiness/systemic/structural/confidence fields, so the page cannot display any past readiness verdict — it only shows prose that may or may not mention readiness.
- **[medium]** `/dashboard` — A single primary readiness verdict backed by DECOUPLED systemic vs structural states, each with a confidence score, plus a degraded-confidence flag when wearable data is missing.
  - *Current:* Readiness is a single composite 0-100 from body_battery/sleep/energy (recoveryUtils), with no systemic-vs-structural decoupling and no per-state confidence on the dashboard. A staleness banner exists but the readiness tile itself shows no confidence/degraded flag.
- **[medium]** `/athlete-state` — Systemic fitness/fatigue vs localized STRUCTURAL fatigue presented as a decoupled pair, each with its own confidence score (filter covariance), plus a 'which subsystem is limiting' verdict.
  - *Current:* Systemic state (Banister) and localized structural state (per-muscle hypertrophy.fatigue_score) both exist but live in separate, unlabeled sections; they are not presented as a decoupled systemic-vs-structural pair, and there is no second (structural) confidence/covariance value. The unification/labeling is frontend-fixable; per-state confidence appears not to be emitted by the engine.

### Concurrent Interference Engine (run × lift conflict)
- **[high]** `/weekly-schedule` — 'Running is shrinking quad recoverable volume' messaging and trimmed lower-body targets with a 6h-separation recommendation for same-day hard run + heavy lower lift.
  - *Current:* No interference messaging at all. Lower-body volume may be trimmed upstream but the page gives no indication that running affected the week, and no 6h-separation guidance is shown even on two-a-day days.

### Program Synthesis Engine (weekly volume allocation / scheduling under MRV + recovery constraints)
- **[high]** `/program-builder` — An editable weekly volume allocation / split that the synthesis engine produced — the user edits the auto-generated week, seeing per-muscle weekly set targets the engine allocated toward their goals.
  - *Current:* The builder is a blank-slate manual wizard. There is no entry point to load or edit an engine-synthesized week; the only pre-fill paths are JSON import and editing a previously hand-built program (editId). No synthesis output (engine/program_synthesis.py / allocator.py / generate_weekly_program.py) is ever fetched or rendered. The user hand-builds every day from scratch.
- **[high]** `/program/:id` — Per-muscle weekly volume vs MRV for the block — which muscles are near their recoverable ceiling.
  - *Current:* No per-muscle volume display at all. The MRV/MEV/MAV landmarks are not present in the program/enrollment payload (only used on Workouts.jsx and AthleteState.jsx). However enrollment.progression_state._muscle_groups[m].hard_sets_this_week (actual weekly hard sets) IS available and unused.
- **[medium]** `/program/:id` — Rationale for the block's structure vs goals (why this split / these volumes for the athlete's goals).
  - *Current:* Only a single goal Badge (Muscle Gain / Strength / etc.) and an optional free-text program.description are shown. No engine-derived rationale field exists in the payload.

### Session Generation Engine (concrete set-by-set workout compilation)
- **[high]** `/train` — Per-set target LOAD/reps/RIR with progressive-overload targets shown on the day ready to execute and log.
  - *Current:* The upcoming program card shows only sets×reps (e.g. '4×8-10'); no target load and no target RIR are rendered anywhere on /train. The underlying getProgramSchedule entry data carries no rir/load/weight/target fields, so the values are not merely hidden — they are absent from this surface. Load/RIR/progression appear only after navigating into /workout-detail via 'Start Session'.
- **[medium]** `/train` — Exercise selection honoring blocked/preferred movements plus sticking-point assistance, visibly reflected in the prescribed session.
  - *Current:* No indication on /train that any exercise was selected/swapped for preferences or sticking-point assistance; exercises are listed as plain name + reps with no rationale, badge, or 'assistance for sticking point' tag.
- **[medium]** `/train` — Today's prescribed session ready to execute and log.
  - *Current:* Partially met: the upcoming card with a 'Start Session' CTA does provide an execute/log entry point for the active enrollment's scheduled day, but only for the day selected in the week grid and only when an active program enrollment exists. With no active enrollment, /train shows a Rest Day / empty state and offers no prescribed session even if the MPC/orchestrator would have one for /today.

### Strength Progression Engine (e1RM auto-regulation / deload trigger)
> Implementer note: the `deload` arm of every progression command below means **volume/RIR cut at held load**, gated by converging multi-day evidence; see the Downregulation policy at the top. Never render a command that lowers the prescribed bar weight off a readiness score.
- **[high]** `/train` — Live fatigue-stop / auto-regulation cues and a progression command (increase/hold/deload/swap) on the session about to be performed.
  - *Current:* No readiness/fatigue flag, no volume-damping note, no progression command, and no auto-regulation cue is surfaced on /train. The page has no awareness of today's readiness verdict or hazard state at all; it only shows the static scheduled session.
- **[high]** `/workout-detail` — A next-session load/RIR command (increase / hold / deload / swap) the user can see after the session.
  - *Current:* The only progression feedback is an ephemeral toast-style nudge (nudgeMessage) that auto-dismisses after 8s and only fires in PROGRAM mode when RIR is logged (ExerciseCard.jsx:115-128). There is no persistent post-session 'next time: increase to X / hold / deload / swap' summary, and free (non-program) workouts get no progression command at all.
- **[low]** `/quick-workout` — Logged sets feed e1RM trend; RIR captured for auto-regulation.
  - *Current:* SATISFIED for capture. RIR is collected per set (ExerciseCard showRIR defaults true), weight/reps logged, and the WorkoutLog write is the e1RM source. The page does not itself surface an e1RM trajectory, but that is by design for a quick-log surface (the intention map routes e1RM display to /workout-detail and /today, not /quick-workout).

### Fatigue Detection Engine (leading vs lagging, composite hazard, ACWR)
- **[high]** `/mind` — Per the /mind intention, the page should surface subjective wellness / stress / sleep inputs that feed systemic-fatigue and recovery-budget estimation (e.g. a quick stress/sleep/mood check-in whose values flow into the hazard verdict).
  - *Current:* The page contains zero wellness/stress/sleep inputs. It is a personal learning tracker (reading log, study sessions, skills proficiency, free-text capture). Nothing it collects feeds fatigue detection.
- **[medium]** `/brief-history` — The rationale/flags that drove each day's recommendation (hazard verdict, ACWR, overreaching warning, volume-damp directive) should be traceable in history.
  - *Current:* No structured flags or hazard fields exist in the brief payload; the page renders no flag/rationale chips, only narrative text.

### Model Orchestration Engine (EKF -> Bayesian -> scheduler pipeline + MPC prescriber)
- **[high]** `/brief-history` — Each historical day should surface the daily prescription the pipeline chose (REST/CARDIO/STRENGTH/MIXED/TWO-A-DAY/DELOAD) and the narrative that stitches every engine's output together.
  - *Policy:* a `DELOAD` day here is the rare slow-tissue backstop (volume cut at held load), not a scheduled or readiness-triggered event; see the Downregulation policy at the top. It should be conspicuous *because* it is rare.
  - *Current:* Cards show only six free-text coach-persona strings (performance/endurance/nutrition/body_comp/learning/career) plus an insight and today_actions. There is no structured prescription/action label and no explicit per-engine stitch; the 'narrative' is whatever the LLM wrote, not engine-derived fields.

### Resource Allocation Engine (recovery-capital knapsack / protect priorities)
- **[medium]** `/recovery` — When recovery is low, a visible reprioritization ('low reserve today — isolation trimmed, squats protected').
  - *Current:* No reprioritization or reserve messaging is shown. The reserve scaling lives in engine/resource_allocator.py and is not surfaced as a discrete per-day field this page can simply read, so wiring would require engine-side exposure.
- **[low]** `/today` — A visible reprioritization message when recovery is low ('low reserve — isolation trimmed, squats protected').
  - *Current:* The page shows focus-split percentages and interference/overreach warnings but never surfaces a recovery-reserve reprioritization narrative; if the engine emits it, it is not displayed here.

### UX/UI Architecture (progressive disclosure, single readiness header, command-palette/NLP logging)
- **[medium]** `/quick-workout` — Low-friction <3s logging, ideally via natural-language/command-palette or voice capture.
  - *Current:* Logging is entirely tap-based: add exercise via combobox, then per-set number inputs and a checkbox. No command palette, NLP, or voice entry exists.
- **[low]** `/today` — Low-friction (<3s) logging ideally via natural-language/command-palette or voice.
  - *Current:* Logging entry is tap-only ('Begin Session' Link to /quick-workout). This is an acknowledged not-implemented gap (NLP/voice not built), so the page meets the current fallback intent.
- **[low]** `/food-tracker` — Low-friction food entry, ideally via natural-language/command-palette or voice (<3s capture).
  - *Current:* Entry is tap/search-based (USDA search, barcode, recent/custom foods, manual form). No NLP or voice logging path exists.

### Concurrent Interference Engine (run x lift mechanical/metabolic conflict)
- **[medium]** `/athlete-state` — Running interference effect on lower-body state ('running is shrinking quad recoverable volume').
  - *Current:* Only a coarse interference_level chip is shown in the Adaptive Engine panel; the per-muscle lower-body recoverable-volume compression caused by running is not called out in the Muscle Volume section.

### Recovery Profiling Engine (dynamic landmarks shift with running load/deficit/sleep)
- **[medium]** `/recovery` — Landmarks that visibly SHIFT with running load, caloric deficit, and sleep debt (not static Israetel tables).
  - *Current:* Even if landmarks were displayed, athlete_state.hypertrophy uses static MUSCLE_TARGETS (LANDMARK_PRIORS); the deficit/sleep/running modulation (nutrition_modulator.py, hypertrophy_volume.apply_running_interference) runs only in the weekly orchestrator, not in athlete_state. Surfacing the dynamic-shift narrative on this page would need engine output (guardrail_state landmarks reflect learned MRV but the per-phase deficit/sleep modulation is not exposed in a per-day field this page reads).

### Program Synthesis Engine (goal-priority weighting that drives allocation)
- **[medium]** `/program-builder` — Goal-priority weighting (strength / hypertrophy / PST) that visibly drives the volume allocation across muscles and days.
  - *Current:* A Goal Select exists (lines 690-708) but it is pure metadata: its value is saved as program.focus and used only for a Confirm-step label. It does not weight, allocate, or change any set/volume distribution — there is no allocation for it to drive because no allocation engine is wired in. The dropdown's GOALS list (muscle_gain/fat_loss/strength/endurance/general) also doesn't match the Science.md strength/hypertrophy/PST priority axes.

### Hypertrophy Volume Engine (per-muscle volume scaling on soreness/performance)
- **[medium]** `/create-workout` — Per-muscle volume bounds (MEV/MAV/MRV) should act as guardrails while building — e.g. a hint when the sets being added push a muscle over MRV or under MEV for the week.
  - *Current:* No per-muscle volume awareness whatsoever. Sets are entered as raw integers with no muscle attribution (the form has no muscle-group field), so the page literally cannot relate input to any volume bound.

### Athlete Learning Engine (N-of-1 Bayesian posteriors, Clues/Patterns/Established phases)
- **[medium]** `/workout-detail` — Personalized learned guidance with a confidence PHASE (Clues / Patterns / Established) influencing logging-time feedback.
  - *Current:* No learning-phase indicator or posterior-driven guidance appears. The one hook that could carry it (Phase-3 between-set coaching) is dead because coachingPhase/workoutLogs are never passed to ExerciseCard, so it can never reach the coachingPhase>=3 branch.
- **[medium]** `/brief-history` — A trace of how recommendations shifted as the engines learned (e.g. learning phase progression, changing posteriors over the history window).
  - *Current:* There is no cross-brief diff, learning-phase indicator, or trend; each day is rendered in isolation with no 'what changed vs prior days' view, and the payload carries no learning-phase data to drive one.

### Recovery Profiling Engine (dynamic per-muscle MEV/MAV/MRV)
- **[medium]** `/fuel` — The current diet phase and HOW it modulates recovery/volume (e.g. caloric deficit compressing recoverable volume / MRV) should be surfaced on /fuel.
  - *Current:* The diet-phase badge (cut/bulk/reverse + weekly rate) and a recovery-gated deficit % + rationale (WeeklyPlanCard, behind the Week-plan modal) are shown, but the page never connects the phase to recovery/volume (MEV/MAV/MRV) effects. That per-muscle MRV-compression data is not queried anywhere on this page; only nutrition gates/deficit_ratio are available here.
- **[low]** `/physique` — Listed as a related engine for this route (bodyfat/deficit context that modulates recoverable volume).
  - *Current:* No recovery/volume modulation context appears; this is arguably out of scope for a physique-photo page and would require pulling nutrition-modulated recovery data that does not naturally belong here.

### Athlete Learning Engine / Model Orchestration (convergence narrative)
- **[medium]** `/insights` — A fatigue-masking and convergence narrative explaining how recommendations shifted as the engines learned.
  - *Current:* Absent from /insights. The AI Daily Brief is free-text coaching prose, not a structured convergence/fatigue-masking narrative tied to the learning engines.

### Strength Progression Engine / Running Adaptation Engine (goal lifts + PST targets)
- **[medium]** `/profile` — Science.md /profile intention: 'goal lifts/PST targets that prime every engine's priors.' Per the intention map these are the 315/450/500 lifts and PST targets (1.5mi<9:00, 4mi<26:00).
  - *Current:* Goal lifts are hardcoded engine constants (log_ingest.py:100-102) and PST targets are hardcoded constants in PSTTracker.jsx:14-27; neither is read from the profile row nor displayed/editable on /profile. The page does not even show the athlete what their goal targets are.

### Running Adaptation Engine (VDOT / TRIMP / mileage cap)
- **[low]** `/today` — VDOT estimate vs PST targets, Daniels pace zones, and mileage-cap awareness ('safe to progress mileage?').
  - *Current:* VDOT and a vdot_gap-to-PST sub-caption are shown in a state tile, and run pace appears inside the session card when a run is prescribed, but there is no explicit mileage-cap / 'safe to progress mileage' signal on this page.
- **[low]** `/athlete-state` — VDOT vs PST targets and a mileage-cap / 'safe to progress mileage?' signal.
  - *Current:* VDOT, pace zones, and VDOT gap-to-target are surfaced (VdotZonesCard + AdaptiveEnginePanel); PST targets via PSTTracker. The weekly mileage cap / safe-to-progress signal is not shown on this page.
