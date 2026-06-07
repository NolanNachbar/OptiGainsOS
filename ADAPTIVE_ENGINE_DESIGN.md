# OptiGainsOS — Adaptive Program-Synthesis Engine (Implementation Spec)

Status: implementation-grade design. The state-estimation layer (Kalman, ACWR,
VDOT, fatigue, recovery, adaptive TDEE) is built. This spec covers the
**synthesis + learning + exploration** layers that sit on top, written so a
software engineer can build them without inventing the missing math.

Format per subsystem follows the requested template: **Scientific support /
Coaching support / Engineering assumptions / Mathematical formulation /
Pseudocode / DB inputs / Daily update / Weekly update / Failure modes /
Confidence scoring.** Every chosen constant is tagged:
`[SCI]` strong science · `[COACH]` coaching consensus · `[ENG]` engineering
judgment (tunable, not a principle) · `[SPEC]` speculative.

Athlete constraints (fixed inputs to every subsystem): high frequency
(4-6x/muscle/wk) + frequent running; NOT splits/PPL/low-freq powerlifting;
goals = PST by 2026-08-31 (100 push/100 sit/20 pull, 1.5mi<9:00, 4mi<26:00) and
strength 315/450/500; data = per-set weight/reps/RIR, Garmin run+recovery, daily
cals/protein, weekly bodyweight.

---

## 0. Data model changes (build these first — everything depends on them)

```sql
-- 0.1 Canonical muscle landmarks + learned posteriors -------------------------
-- One row per (user, muscle). Replaces the two contradictory hardcoded tables.
create table athlete_landmarks (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users not null,
  muscle text not null,                 -- canonical taxonomy (see §1)
  mev numeric not null,                  -- current working landmarks (sets/wk)
  mav numeric not null,
  mrv numeric not null,
  mrv_mean numeric not null,             -- Bayesian posterior for MRV
  mrv_var  numeric not null,
  n_obs int default 0,
  mature boolean default false,          -- credible interval excludes prior
  updated_at timestamptz default now(),
  unique (created_by, muscle)
);

-- 0.2 Generic learned parameters (frequency, exercise response, two-a-day, run ceiling)
create table athlete_params (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users not null,
  param_key text not null,               -- e.g. 'freq.chest', 'exgrowth.bench_backoff',
                                          --      'running_ceiling_mi', 'twoaday_benefit'
  mean numeric not null,
  variance numeric not null,
  n_obs int default 0,
  mature boolean default false,
  meta jsonb,                            -- bandit arm stats, etc.
  updated_at timestamptz default now(),
  unique (created_by, param_key)
);

-- 0.3 Controlled tests (probes that gather information)
create table controlled_tests (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users not null,
  test_type text check (test_type in
    ('recovery_stress','volume_tolerance','running_tolerance','pst_diagnostic')),
  target_key text,                       -- param it informs (e.g. 'mrv.chest')
  status text check (status in ('scheduled','active','complete','aborted')) default 'scheduled',
  scheduled_date date,
  started_at date,
  baseline jsonb,                        -- pre-test state to compare against
  result jsonb,
  created_at timestamptz default now()
);

-- 0.4 Weekly plan produced by the allocator (the program)
create table weekly_plans (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users not null,
  week_start date not null,
  set_targets jsonb not null,            -- {muscle: sets}
  frequency_targets jsonb not null,      -- {muscle: sessions/wk}
  run_plan jsonb not null,               -- [{type, count}]
  two_a_day_days int[],
  rationale text,
  created_at timestamptz default now(),
  unique (created_by, week_start)
);

-- 0.5 Equipment + goal priorities on the profile (column adds)
alter table user_profiles
  add column if not exists goal_priorities jsonb;   -- {strength:0.4, hypertrophy:0.3, pst:0.3}
-- available_equipment already exists (text[]); empty = gym+bodyweight, no pool.

-- RLS: all tables `for all using (auth.uid() = created_by)` (match existing single-user pattern).
```

`engine_params` (existing jsonb blob) stays for Kalman/VDOT state; the new tables
hold the *learned program parameters* so they're queryable and trend-able.

---

## 1. Volume-landmark taxonomy unification (was gap #4)

**Problem:** `hypertrophy_volume.py` uses {chest, upper_back, lats, quads,
hamstrings, glutes, shoulders, triceps, biceps, calves, core} (11); `compute`'s
`MUSCLE_TARGETS` uses {quads, hamstrings, glutes, chest, back, shoulders,
rear_delts, biceps, triceps, abs, lower_back, traps, calves} (13). They disagree
on names and numbers.

**Decision [ENG]:** canonical taxonomy = the 13-muscle `compute` set (more
granular maps cleanly onto exercise `muscles` lists). Single source of truth in
`engine/muscle_map.py`:

```python
CANONICAL_MUSCLES = ["chest","back","lats","traps","shoulders","rear_delts",
                     "biceps","triceps","quads","hamstrings","glutes","calves","abs"]

# Landmark PRIORS (sets/wk). [COACH] Israetel population defaults, per-muscle.
# These are PRIORS only — the Bayesian learner (§4) overrides per athlete.
LANDMARK_PRIORS = {
  "chest":{"mev":8,"mav":14,"mrv":20}, "back":{"mev":10,"mav":16,"mrv":22},
  "lats":{"mev":8,"mav":14,"mrv":20},  "traps":{"mev":4,"mav":10,"mrv":16},
  "shoulders":{"mev":6,"mav":12,"mrv":18}, "rear_delts":{"mev":6,"mav":12,"mrv":18},
  "biceps":{"mev":6,"mav":12,"mrv":18},"triceps":{"mev":6,"mav":12,"mrv":18},
  "quads":{"mev":8,"mav":14,"mrv":20},"hamstrings":{"mev":6,"mav":12,"mrv":16},
  "glutes":{"mev":6,"mav":12,"mrv":16},"calves":{"mev":8,"mav":16,"mrv":24},
  "abs":{"mev":0,"mav":12,"mrv":16},
}
# Alias: exercise-catalog muscle -> canonical (front_delt/side_delt->shoulders,
# rear_delt->rear_delts, core->abs, upper_back->back).
MUSCLE_ALIAS = {"front_delt":"shoulders","side_delt":"shoulders",
                "rear_delt":"rear_delts","core":"abs","upper_back":"back"}
```

`compute` and `hypertrophy_volume` both import `LANDMARK_PRIORS`/`MUSCLE_ALIAS`.
Seed `athlete_landmarks` from the priors on first run.

- **Failure modes:** an exercise muscle not in the alias/canonical set → log + map to nearest; never crash.
- **Acceptance:** grep shows zero remaining hardcoded landmark dicts outside `muscle_map.py`; daily hypertrophy display and weekly allocator read identical numbers for every muscle.

---

## 2. Weekly volume allocator (gap #1, the keystone)

**Scientific support:** dose-response of volume on hypertrophy is an inverted-U
between MEV and MRV [SCI/COACH]; ACWR>1.5 raises injury risk [SCI]; concurrent
interference is real but attenuated by separation + fueling [SCI].
**Coaching support:** MEV/MAV/MRV landmarks [COACH, Israetel]; high-frequency
viability for advanced lifters [COACH, Jewers/Twinem/Sheiko].
**Engineering assumptions:** greedy marginal-value allocation under a systemic
budget is sufficient at N=1; MILP only if greedy proves inadequate [ENG].

### Mathematical formulation

Decision variables: `sets[m]` per muscle, `runs[type]` (easy/threshold/interval/long), `two_a_day_days`.

**Systemic recovery budget** (total weekly hard sets the athlete can recover from):
```
B = B_prior * r_recovery * r_phase
B_prior      = days_per_week * MAX_HARD_SETS_PER_DAY      # [ENG] default 6 -> tune via §5 test
r_recovery   = clamp(1 + 0.04*TSB_banister, 0.6, 1.15)    # [ENG] TSB from Kalman
r_phase      = 1.0 normal | 0.8 aggressive cut            # [COACH] §6 nutrition
```
`B_prior`'s `MAX_HARD_SETS_PER_DAY` is itself a learned param (§4 recovery
capacity); 6 is the prior.

**Per-muscle goal weight** (priority × deadline urgency):
```
w[m] = Σ_goal goal_priority[goal] * muscle_relevance[goal][m] * deadline_mult[goal]
```
`goal_priority` from profile (default strength .4 / hypertrophy .3 / pst .3);
`muscle_relevance` is a fixed map ([COACH], e.g. squat→quads/glutes for the
strength goal, push muscles for PST); `deadline_mult` rises for PST as Aug 31
nears (reuse existing `deadline_weights`).

**Marginal value of the next set** for muscle m currently at s sets (the
inverted-U made concrete) [ENG curve, COACH landmarks]:
```
def marginal_value(m, s, w, lm):   # lm = learned landmarks for m
    if s < lm.mev:           base = 1.00                       # below threshold: top priority
    elif s < lm.mav:         base = 0.80*(1 - (s-lm.mev)/(lm.mav-lm.mev))
    elif s < lm.mrv:         base = 0.20*(1 - (s-lm.mav)/(lm.mrv-lm.mav))  # junk-volume zone
    else:                    base = 0.0                        # hard cap at MRV
    return w[m] * base
```

**Greedy allocation:**
```
def allocate(B, weights, landmarks, run_need, equipment):
    sets = {m: 0 for m in CANONICAL_MUSCLES}
    # 1. fund MEV for every prioritized muscle first (threshold is non-negotiable)
    for m in sorted(weights, key=weights.get, reverse=True):
        need = landmarks[m].mev
        take = min(need, remaining(B))
        sets[m] += take; B -= take
    # 2. spend remaining budget on highest marginal value, one set at a time
    while B > 0:
        m = argmax(marginal_value(m, sets[m], weights, landmarks[m]) for m in muscles)
        if marginal_value(m, sets[m], ...) <= MV_FLOOR: break    # [ENG] 0.05, stop wasting budget
        sets[m] += 1; B -= 1
    # 3. running: allocate run_need sessions by VDOT gap + deadline; drop modalities
    #    with goal weight 0 or no equipment (no pool -> no swim)
    runs = allocate_runs(run_need, equipment, vdot_gap, deadline_mult["pst"])
    # 4. frequency: spread each muscle's sets across ceil(sets[m]/MAX_SETS_PER_MUSCLE_PER_SESSION)
    #    days, honoring the 4-6x preference when sets allow                       # [COACH]
    freq = {m: distribute_frequency(sets[m]) for m in muscles}
    return WeeklyPlan(sets, freq, runs, two_a_day_days=pick_two_a_days(...))
```

- **DB inputs:** `athlete_landmarks`, `athlete_state` (TSB, ACWR, VDOT gap), `user_profiles` (goal_priorities, available_equipment, days_per_week), `engine_params`.
- **Daily update:** none (allocator runs weekly). Session gen (§3) consumes the plan daily.
- **Weekly update:** run every Sunday → write `weekly_plans` row.
- **Failure modes:** B too small to fund all MEVs → fund highest-weight muscles' MEV first, log the deficit (don't silently drop); empty equipment → conditioning = runs/ruck only.
- **Confidence scoring:** plan confidence = mean maturity of the landmarks/params it used (surface "program is N% personalized" in UI).
- **Acceptance:** with empty `available_equipment`, plan contains zero swims; total sets ≤ B and each muscle ≤ its MRV; every prioritized muscle ≥ MEV unless B-limited (then logged); high-frequency preference honored (each muscle's freq ≥ 3 when sets ≥ 6).

---

## 3. Session generation (consume the weekly plan)

**Math:** `remaining[m] = plan.set_targets[m] − sets_done_this_week[m]`. Today's
capacity `C_today = round(B/days_remaining_in_week)`. Distribute `C_today` across
muscles by `remaining[m]` descending, ≤ `MAX_SETS_PER_MUSCLE_PER_SESSION` ([ENG]
default 4, supports high frequency), filtered by equipment and today's split.

```
def build_session(plan, week_to_date, readiness, action, soreness, equipment):
    if action == "REST": return mobility_only()
    remaining = {m: plan.set_targets[m] - week_to_date[m] for m in muscles}
    cap = session_capacity(action, readiness)         # LIGHT/DELOAD cut SET COUNT, not just load
    todays = waterfall(remaining, cap, max_per_muscle=4)
    todays = apply_soreness_trim(todays, soreness)    # already shipped
    exercises = select_exercises(todays, equipment, learned_exercise_value)  # §4
    return attach_rep_rir(exercises, readiness)       # existing strength-progression engine
```

- **Key fix vs today:** LIGHT/DELOAD reduce `cap` (fewer sets), not the load — addresses the "light day = 7 high-RIR lifts" bug.
- **Acceptance:** sum of session sets over the week == plan targets (±1 rounding); LIGHT day has strictly fewer sets than a normal day; no exercise needs absent equipment.

---

## 4. Bayesian per-athlete learning (gap #2)

**Scientific/Coaching:** landmarks and frequency tolerance are individual [COACH];
N=1 sparse data favors Bayesian shrinkage to population priors [ENG/SCI].
**Engineering assumptions:** each parameter is `Normal(mean, var)`; update with
Kalman-style gain; act on a learned value only once its credible interval
excludes the prior (else keep the prior + explore) [ENG].

### Per-parameter observation models (the missing math)

**MRV[m]** — observed from weekly response:
```
# weekly, per muscle, given this week's sets s, e1RM slope g (lbs/wk on the lift
# that loads m), and mean soreness sor (0-5):
responding   = g > G_MIN            # [ENG] G_MIN = 0 (any positive slope)
recoverable  = sor <= SOR_OK        # [ENG] SOR_OK = 2.5
if responding and recoverable:  obs = s + 1   ; obs_var = OBS_VAR_HI   # MRV is at least s, likely higher
elif (not responding) and sor >= SOR_HI:  obs = s - 1 ; obs_var = OBS_VAR_HI  # over MRV
else:  obs = None                                                       # uninformative week
# Kalman update when obs is not None:
K = var / (var + obs_var)                       # OBS_VAR_HI=9 (sets^2) early, ->4 later [ENG]
mean += K*(obs - mean);  var *= (1-K);  n_obs += 1
mature = abs(mean - prior_mean) > 1.96*sqrt(var)
```
MAV ← clamp(mean − 2, mev+1, mean); MEV ← prior (rarely individualized).

**Frequency[m]** — bandit over arms {3,4,5,6}x/wk; reward = e1RM slope for m that
week; Thompson sample arm each block. Prior mean = 4 (athlete preference).

**Exercise→growth[ex]** — hierarchical Normal; reward = e1RM slope while ex is in
the program; shrinks to the muscle's mean. Drives `select_exercises` value (§3).

**Running ceiling (mi/wk)** — Normal; observation from running-tolerance test (§6)
or weekly: mileage with stable quad soreness + non-negative VDOT → ceiling ≥ that.

**Two-a-day benefit** — paired comparison: perf delta on split vs combined days;
sign of posterior mean decides whether the allocator schedules two-a-days.

- **DB inputs/outputs:** reads `workout_logs`, `athlete_state` (e1RM slopes, soreness, VDOT), `garmin_activities`; writes `athlete_landmarks`, `athlete_params`.
- **Daily update:** none (needs weekly aggregation).
- **Weekly update:** Sunday — compute weekly aggregates, update every posterior, recompute `mature` flags.
- **Failure modes:** confounded weeks (sick, traveled) → mark uninformative (obs=None); never let one week swing a posterior more than `K_MAX`=0.34 [ENG].
- **Confidence scoring:** `confidence = 1/var`, normalized; `mature` gates whether the allocator uses the learned value or the prior. Surface per-muscle "personalized vs population."
- **Acceptance:** with synthetic responding data, MRV mean rises and `mature` flips after the documented #weeks; with noise-only data, mean stays within 1 set of prior and `mature` stays false.

---

## 5. Nutrition → programming coupling (already partially shipped)

Phase scales `r_phase` (§2) and the volume ceiling: aggressive cut → MRV×0.8,
protect intensity/strength, trim hypertrophy volume first [COACH, TNF — see
`[[Nolan's Cutting Philosophy]]`]. Deficit unreliability: down-weight high-rep
e1RM signals during a cut when feeding §4 (raise `obs_var`). Already live:
adaptive TDEE, macro floors, strength-gated + duration-capped deficit.

---

## 6. Controlled-testing framework (gap #3)

General mechanic: a test writes a `controlled_tests` row, the allocator/session
gen honor an `active` test, results update a §4 posterior. Schedule one at a time;
never overlap a stress test with a cut.

**6.1 Recovery stress test** → learns `MAX_HARD_SETS_PER_DAY` / fatigue τ.
- Trigger [ENG]: TSB>+5 and no active test and ≥14d since last.
- Protocol: one deliberately high-load day (≈1.3× normal session sets), then
  monitor HRV/RHR for 5 days. Fit rebound: days-to-baseline = τ_observed.
- Writes: `athlete_params['recovery_tau']`, feeds `B_prior`.
- Guardrail: abort if HRV crash + RHR spike beyond overreach threshold.

**6.2 Volume-tolerance test** → learns `MRV[m]`.
- Trigger: a muscle's MRV `mature=false` and TSB ok.
- Protocol: ramp that muscle +2 sets/wk above current MAV for ≤3 wks, gated by
  the §4 responding/recoverable rule; then a planned deload. Highest
  non-stalling volume → MRV observation (obs_var low because it's a designed test).
- Guardrail: stop on stall+soreness immediately.

**6.3 Running-tolerance test** → learns running ceiling.
- Protocol: +10%/wk mileage while quad soreness ≤ 2 and VDOT non-decreasing;
  back off when the existing ortho-load budget trips.

**6.4 PST diagnostic** (every 4 wks): insert a real PST as a first-class session;
write `pst_tests`; recompute readiness % and validate conditioning weighting.

- **Confidence scoring:** test-derived observations carry low `obs_var` (designed > passive). 
- **Acceptance:** scheduler never runs two tests at once or during a cut; a completed volume-tolerance test moves the target MRV posterior and flips maturity faster than passive weeks.

---

## 7. Dead-loops decision (gap #5)

**MILP Bayesian weight update (`program_synthesis.update_weights`):** REMOVE.
It's never called and is superseded by §2's `w[m]` (goal priority × deadline) and
§4's learned values. Delete the dead method; the allocator owns weighting.

**Cellular interference closed loop (`cellular_model.close_loop_update`):** keep
the AMPK/mTORC1 computation as a *signal* feeding the §2 interference penalty and
the existing session attenuation, but DISABLE the closed-loop parameter learning
(`[SPEC]`, flagged unsound). Mark it speculative in the UI. Revisit only if a
designed test can identify the coefficient.

**RLS τ-learner:** already inert by design; replace its role with the §6.1
recovery stress test feeding `recovery_tau`. Remove the `is_mature()` hot-swap path.

- **Acceptance:** grep shows no caller of the removed MILP method; cellular closed-loop is behind a disabled flag; no engine path depends on RLS τ.

---

## 8. Function contracts (where each piece plugs in)

```
engine/muscle_map.py          + CANONICAL_MUSCLES, LANDMARK_PRIORS, MUSCLE_ALIAS
engine/landmarks.py    (new)  load/seed athlete_landmarks; marginal_value()
engine/allocator.py    (new)  allocate(B, weights, landmarks, run_need, equip) -> WeeklyPlan
engine/learners.py     (new)  update_mrv(), bandit_frequency(), update_exercise_value(),
                              update_running_ceiling(), update_two_a_day()
engine/controlled_tests.py (new) schedule(), active_test(), record_result()
generate_weekly_program.py    call allocator weekly -> weekly_plans; call learners (Sunday)
session_generator.py          consume weekly_plans (remaining-volume waterfall, §3)
compute_athlete_state.py      seed/read athlete_landmarks; emit weekly aggregates for learners
```

---

## 9. Build order (each increment ships behind the state layer + is verified on real data)

1. **§0 schema + §1 taxonomy unification** (foundation; data-integrity).
2. **§3 real volume reduction on LIGHT/DELOAD** + equipment filter in session gen.
3. **§2 greedy weekly allocator** writing `weekly_plans`; session gen consumes it.
4. **§4 MRV + frequency learners** + surface confidence.
5. **§6 controlled-test scheduler** (recovery + volume-tolerance first).
6. **§4 exercise-value + two-a-day learners**, §6.3/6.4 tests.
7. **§7 cleanup** (remove dead MILP, gate cellular).

Acceptance per increment is defined in its section. Nothing advances until the
prior increment passes on real data through `compute` + `prescriber`.

---

## 10. Evidence-tier summary

- **[SCI]:** ACWR↔injury, volume inverted-U, Z2 aerobic base, protein for LBM in deficit, progressive overload.
- **[COACH]:** MEV/MAV/MRV (Israetel), RIR autoregulation, high-frequency viability (Jewers/Twinem/Sheiko), polarized running (Daniels/Magness), deload cadence, cut macros (TNF).
- **[ENG]:** greedy allocation, Bayesian Normal posteriors + Kalman gain, Thompson-sampling exploration, the specific constants flagged `[ENG]` above (all tunable, none are principles).
- **[SPEC]:** cellular interference ODE, exact individual two-a-day benefit until matured.
```
