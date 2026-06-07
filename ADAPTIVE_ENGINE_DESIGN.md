# OptiGainsOS — Adaptive Program-Synthesis Engine (Design)

Status: design / not yet built. This is the methodology for the layer the audit
found missing: the system has a good **state-estimation** brain (Kalman, ACWR,
VDOT, fatigue) but the layer that answers *"what workout today / what program
next week, and how does that change as I respond"* is still static templates.
This doc specifies how to build it incrementally behind the existing state layer.

The north star (your framing): how would Netflix, a fighter pilot, an endurance
coach, and a powerlifting coach build the SAME decision engine. The answer is a
**three-layer control system**: estimate state → synthesize program under
constraints → learn the athlete's parameters from outcomes.

---

## 0. What's wrong today (root cause of the dashboard complaints)

- LIGHT day still emits 7 lifts at high RIR/light weight → session gen scales
  load on a fixed template instead of cutting volume.
- Prescribes a 500m swim with no pool, and Z1 runs you've deprioritized →
  no equipment/access model, no goal-priority weighting.
- Volume landmarks are fixed Israetel constants (two contradictory tables), the
  MILP weight Bayes update is dead code, exploration is one slow bandit arm →
  nothing actually learns YOUR parameters.

All of it is the program-synthesis / session-generation / learning layer.

---

## 1. Architecture (three layers)

```
STATE (exists)            SYNTHESIS (build)              LEARNING (build)
─────────────────         ───────────────────────        ─────────────────────
Kalman F/f, TSB           Weekly allocator (constrained   Per-muscle MEV/MAV/MRV
ACWR (now real)           optimization): sets/runs        Frequency tolerance
VDOT, fatigue, recovery   across muscles+modalities       Exercise→e1RM response
per-muscle volume   ───▶  under a recovery budget   ───▶  Two-a-day benefit
nutrition/TDEE            Session generator: today's      Running load ceiling
                          session from week-to-date +     (all Bayesian, with
                          readiness + constraints         confidence intervals)
                                    │                              │
                                    └──────── controlled exploration ┘
                                     (probe to learn, exploit to perform)
```

Recommended model stack (answers your Part 1 / Part 10):
- **Weekly synthesis = constrained optimization** (greedy or small MILP), NOT
  RL/GA. RL needs thousands of episodes; you have one athlete. Constraints
  encode the science; the optimizer just allocates under them.
- **Per-athlete parameters = Bayesian + bandits.** Normal-inverse-gamma priors
  per landmark, Thompson sampling for exploration. Sparse-data friendly,
  confidence-aware, exactly the N=1 setting.
- **State = keep the Kalman.** It's the right tool and it's built.

This is the same pattern as adaptive control + recommender systems: a model that
plans under constraints, wrapped in a learner that updates the constraints from
observed response. Fighter-pilot MPC + Netflix Thompson sampling + the coaches'
volume landmarks as the constraint set.

---

## 2. Weekly Program Synthesis

Inputs (all already in `athlete_state` / profile):
strength readiness, running readiness, fatigue/TSB, ACWR, recovery, injury risk,
goal priorities, recent e1RM/VDOT trends, nutrition phase, **equipment/access**,
**training-preference** (high frequency, no splits).

Decision variables: weekly set count per muscle, sessions/week per muscle
(frequency), run sessions (easy/interval/long), two-a-day days.

Objective: maximize weighted goal progress
`Σ goal_weight_g · expected_progress_g(allocation)`
subject to:
- per-muscle weekly sets ∈ [MEV, MRV] (the LEARNED landmarks, §4)
- total systemic load ≤ recovery budget (from TSB/ACWR; shrinks when fatigued)
- frequency ≥ preference floor (4-6x/muscle) when recovery allows
- running volume ramp ≤ 10%/wk and ≤ learned ceiling
- concurrent-interference penalty when same-day lower lifting + hard running
- **hard constraints**: only equipment the athlete has; goal-deprioritized
  modalities get weight 0 (no junk Z1 if deprioritized)

`goal_weight_g` is time-to-deadline aware (PST weight rises as Aug 31 nears —
this already exists as `deadline_weights`). Phase (cut/bulk) scales the recovery
budget and the volume ceiling (§5).

Implementation: start **greedy** (sort muscles by goal-weighted marginal value,
allocate a set at a time until the recovery budget or per-muscle MRV binds).
Upgrade to MILP only if greedy proves insufficient. Either way the science lives
in the constraints, not the solver.

---

## 3. Session Generation

Given the week's targets and week-to-date completed work, build today:
1. **Remaining volume** = weekly target − sets already done this week, per muscle.
2. **Today's capacity** = f(readiness, prescribed action). On LIGHT/DELOAD this
   **cuts set count**, not just load — the current bug. REST = mobility only.
3. **Distribute** remaining volume across today honoring frequency (few sets per
   muscle, many muscles — your high-frequency preference).
4. **Exercise selection** = priority score that now includes the LEARNED
   exercise→e1RM response (§4), goal lifts, fatigue, and **equipment filter**.
5. **Rep/RIR** from the strength-progression engine per lift (§ existing).
6. **Conditioning** from running readiness + VDOT + equipment: prescribe the
   Garmin-style session that fits (e.g. 30 min @ VDOT easy pace), never a pool
   swim if `has_pool=false`; drop Z1 if the athlete has deprioritized it.

Exercise replacement trigger: stall_risk high for N weeks AND no e1RM slope →
swap to a variant; log the swap as an exploration arm (§6).

---

## 4. Learning Athlete-Specific Parameters (N=1)

Every parameter is a posterior with a confidence interval, not a constant.

| Parameter | Prior (mean) | Learning signal | Update | Data to mature |
|---|---|---|---|---|
| MEV/MAV/MRV per muscle | Israetel pop. defaults | weekly e1RM slope vs soreness vs sets | Bayesian (Normal-IG) | ~6-10 wk/muscle |
| Frequency tolerance | 4x (your pref) | slope at freq f vs f-1 | bandit arm per freq | ~8-12 wk |
| Exercise→growth | equal | e1RM slope while exercise in program | hierarchical Normal | ~8 wk/exercise |
| Two-a-day benefit | neutral | perf delta split vs combined | paired bandit | ~12-16 wk |
| Running ceiling | 15 mi/wk | soreness/VDOT response to mileage | Bayesian | ~8 wk |

Update rule shape (per landmark):
```
posterior_mean ← prior + K · (observed_response − predicted_response)
K = prior_var / (prior_var + obs_noise)         # Kalman-style gain
confidence ← 1 / posterior_var                   # surfaced to the user
```
Separate real effect from noise: require the credible interval to exclude the
prior before acting on a learned value; until then, use the prior and keep
exploring. This is the discipline the current `rls_learner` lacks (it's pinned
to defaults by design).

---

## 5. Nutrition Integration (cut/bulk → programming)

- TDEE is now adaptive (intake + bodyweight, under-logging guarded). Phase scales
  the **recovery budget** and the **volume ceiling**: aggressive cut → MRV ×0.8,
  protect intensity/strength, trim hypertrophy volume first (it's lost slowest in
  the short run; strength/skill protected).
- Metrics that get unreliable in a deficit: bodyweight-noise, and e1RM on high-rep
  work (CNS + glycogen). Weight strength signals from low-rep top sets more during
  a cut.
- Deficit magnitude → expect slower recovery: widen deload frequency, lower the
  ACWR ceiling. (Your cutting philosophy from the 3 videos feeds these constants —
  see the vault note this links to.)

---

## 6. Controlled Exploration (probe to learn)

Hybrid, not pure conservative or aggressive:
- **Weeks 0-4:** conservative ramp + establish baselines; one stress test
  (recovery rebound) to seed τ.
- **Weeks 4-12:** controlled stress tests — volume-tolerance ramp on one muscle
  at a time; running-tolerance ramp; periodic AMRAP/PST diagnostics.
- **Weeks 12-24:** exploit learned params; explore only where confidence is low.

Four tests (schema already supports all):
1. Recovery stress test → learn fatigue τ (replaces inert RLS).
2. Volume-tolerance test → learn per-muscle MRV (replaces fixed constants).
3. Running-tolerance test → learn mileage ceiling.
4. Scheduled PST diagnostic every 4 wk → validate the conditioning weighting.

Exploration vs exploitation = Thompson sampling: sample each parameter from its
posterior, act on the sample; high-variance params get probed naturally.

---

## 7. Build order (incremental, each verifiable against real data)

1. **Equipment/access + goal-priority profile** (kills the pool-swim and junk-Z1
   bugs immediately). Smallest, highest felt-value.
2. **Real volume reduction on LIGHT/DELOAD** in session gen.
3. **Unify volume landmarks** into one taxonomy/source of truth.
4. **Weekly greedy allocator** under the recovery budget + constraints.
5. **Bayesian landmark learner** + surface confidence.
6. **Controlled-test scheduler** (the four tests).
7. **Two-a-day / frequency bandits.**

Each step ships behind the existing state layer, runs through `compute` +
`prescriber`, and is validated on real data before the next.

---

## 8. Evidence tiers (per your request)

- **Strong science:** ACWR injury association, protein for LBM in deficit, Z2
  aerobic base, progressive overload.
- **Coaching consensus:** MEV/MAV/MRV landmarks (Israetel), RIR autoregulation,
  high-frequency viability for advanced lifters (Jewers/Twinem/Sheiko), deload
  cadence.
- **Engineering judgment:** Bayesian/bandit for N=1, greedy/MILP allocation,
  Thompson sampling for explore/exploit, confidence gating.
- **Speculative (flag in UI):** cellular interference ODE, exact two-a-day
  benefit per individual until enough data.

See also: state-estimation already implemented across `scripts/engine/` and
`compute_athlete_state.py`; this doc covers the synthesis + learning layers that
sit on top.
