---
type: technical-spec
project: OptiGains
status: authoritative
created: 2026-06-18
supersedes: [Science.md, sciencev2.md]
source: "Science.md; sciencev2.md; RESEARCH_VS_SCIENCE_2026-06.md (binding correction spec)"
origin: distilled
tags: [optigains, training-science, architecture, hypertrophy, strength, concurrent]
---

# OptiGainsOS: Unified System Architecture and Technical Specification

Provenance: this document supersedes `Science.md` and `sciencev2.md` as of 2026-06-18.
Where those two docs conflicted, the more defensible option was selected per the
comparison table in `RESEARCH_VS_SCIENCE_2026-06.md`. Where the research correction
spec conflicts with either original, the correction spec wins. The two originals are
retained for history but are no longer authoritative.

OptiGainsOS is a self-optimizing performance operating system for a single tactical
athlete. It coordinates high-frequency wearable telemetry, objective strength
diagnostics, running telemetry, and nutrition tracking into a closed-loop control
system that learns the individual athlete's physiology over years of use. It shifts
from passive tracking to active, closed-loop control while respecting the biological
constraints of human recovery and the owner's stated training style.

---

## Changelog vs Science.md + sciencev2.md

Substantive changes applied in this unified doc:

- **C1: Removed the hard MRV ceiling and the inverted-U logic.** The hard constraint
  (weekly sets <= MRV) and any logic treating "high volume + performance decline =
  MRV exceeded" are deleted at every site they appeared:
  - Recovery Profiling `update_bayesian_mrv` (inverted-U likelihood) replaced with a
    diminishing-returns + recovery-cost estimator.
  - Program Synthesis hard "MRV Constraint" (sum of sets <= MRV) replaced with a soft
    recovery-cost penalty in the objective.
  - Session Generation `clamp(MAV, MEV, MRV)` reframed: MRV is a soft upper guide, not
    a clamp that reverses gains.
  - Hypertrophy Volume +1 / -2 step rule reframed around marginal benefit vs rising
    recovery cost, not a ceiling at which growth reverses.
  MRV is now defined as a soft, recovery-limited boundary (the point where marginal
  recovery cost outweighs marginal benefit), not a point where additional volume
  reverses gains.
- **C2: Split the strength and hypertrophy volume curves.** Strength saturates near
  4 sets/muscle/week (steep diminishing returns); hypertrophy keeps climbing to
  10 to 25+ sets/muscle/week. The single shared "optimal volume" target is gone.
  Hypertrophy Volume, Strength Progression, Athlete Learning, and Resource Allocation
  each now carry separate strength-volume and hypertrophy-volume curves.
- **C3: Frequency demoted to a derived scheduling output.** The per-muscle
  peak-frequency table (Science.md) is removed. The standalone learned "Optimal
  Frequency 2.0/week" parameter (sciencev2.md) is reframed: frequency is computed
  from the hypertrophy volume target plus per-muscle recovery, not learned as an
  independent landmark.
- **C4: Proximity-to-failure / effective-reps drives hypertrophy stimulus only.**
  The fatigue-modulated RIR target `RIR = clamp(3.5 - 0.8 * F_index)` (which forced
  the athlete off failure on a readiness signal) is removed. Effective reps (5 - RIR)
  feed hypertrophy stimulus. Strength prescription is RIR-insensitive: RIR is used
  only as a measurement input for e1RM, never as a fatigue-driven load target.
- **C8: Learning convergence gated on mesocycle-length blocks.** Volume / hypertrophy
  parameters now require 8 to 12 week blocks to clear noise, replacing Science.md's
  4-session gate and reframing sciencev2.md's 12-observation gate so observations are
  read over mesocycles. Controlled Experimentation cadence widened to match.
- **C9: Landmarks and thresholds are wide-sigma learnable priors, not laws.** Every
  numeric landmark (MRV baselines, hazard 0.8, Mahalanobis 2.5, ACWR 1.3, Z-HRV -1.5,
  DF 0.65, VDOT 45, RIR targets) is labeled a coaching / engineering prior with a wide
  starting sigma that the learner converges. None is a fixed rule.
- **Load vs volume downregulation reconciled.** Bar load tracks measured performance
  (e1RM trend); that is normal progression and stays. But fatigue- or
  biomarker-triggered downregulation is expressed as a reduction in VOLUME, never a
  drop in bar load off a readiness signal. Every `FORCE_DELOAD` and load-cut on a
  hazard/Mahalanobis signal is converted to a reactive volume cut.
- **No scheduled deloads and no peaking taper.** Periodic scheduled deloads and the
  "program peaks years in advance" / taper language are removed. Downregulation is
  reactive, multi-signal, multi-day, and expressed as volume. Exactly one rare
  slow-tissue backstop remains for genuine non-functional overreaching.

Conflicts between the two originals, resolved (per the correction-spec table):

| Topic | Science.md | sciencev2.md | Chosen |
|---|---|---|---|
| Per-muscle frequency | Fixed table | Absent | Omit (derived output) |
| Volume optimum prior | Squat 14 sets | Generic 10, range [4,18] | Wide range [4,18], split by goal |
| Quads MRV baseline | N(18, 2.5) | N(15, 3^2) | Widened prior, labeled unsourced |
| Learning tool | Kalman + KL phases | Gaussian Process | Gaussian Process |
| State estimation | 4-state EKF | 3-state DEKF | DEKF (dual filter, learnable params) |
| Deload trigger | Hazard >= 0.8 | Mahalanobis > 2.5 | Both reactive priors; converted to volume downregulation |

---

## Standing design constraints (governing principles)

These owner constraints (Nolan, 2026-06-18) govern every engine below. Where an engine
formula would violate one, the formula is rewritten, not the constraint.

1. **Hypertrophy is the primary objective**, pursued through the squat, bench, and
   deadlift (SBD) as the primary movements. Volume allocation serves hypertrophy first.
2. **Concurrent strength and tactical/endurance readiness are real secondary goals.**
   Strength is harvested from the SBD work: it saturates early (near 4 sets), so the
   hypertrophy SBD volume drives most of the available strength and the two are not in
   tension at the volumes used. Separately, the athlete is building toward Navy SEAL PST
   readiness (1.5mi sub-9:00, 4mi sub-26:00, max push-ups/sit-ups/pull-ups, swimming) as a
   SOFT target around end of August 2026, pursued through CONTINUOUS readiness and NOT a
   peak or taper (constraint 4 still holds). PST and endurance work run concurrently with
   the hypertrophy emphasis rather than replacing it; the run plan builds toward a
   maintainable readiness plateau, not a spike. A long-horizon Ironman goal makes
   aerobic-base investment worthwhile now. Research (2026-06-18, verified) resolved the
   structure question: pursue hypertrophy + endurance TRUE YEAR-ROUND CONCURRENTLY, not in
   alternating blocks (both adaptations advance together at recreational volumes, umbrella
   review aerobic SMD 0.77, and the goal is continuous readiness, not a peak). Protect leg
   hypertrophy by making the high-volume aerobic base cycling and swimming (also 2 of 3
   Ironman disciplines) and confining running to PST-pace and HIIT; keep aerobic sessions
   short (interference scales with duration), lift before endurance on shared days, separate
   hard-leg from hard-run days, and hold the off-emphasis quality at maintenance dose (VO2max
   holds on ~2 quality sessions/wk; muscle holds on 1-3 hard sets 2-3x/wk). Intensity is
   polarized 80/20. See the Concurrent Interference and Running Adaptation engines and
   `SCIENCE_ALIGNMENT.md` E13.
3. **Training to failure / 0 RIR is the default style and is kept.** The engine does
   not force the athlete to stop short of failure or raise RIR. Instead it MODELS the
   extra fatigue cost that failure generates and manages it by autoregulating VOLUME
   (holding or trimming sets via the diminishing-returns + recovery-cost model). It
   never drops bar load off a readiness signal.
4. **No scheduled deloads and no peaking taper.** Downregulation is reactive,
   multi-signal, and multi-day, expressed as volume rather than load. Exactly one rare
   slow-tissue backstop exists for genuine non-functional overreaching.
5. **Learned priors over fixed rules.** Every landmark and threshold is a tunable prior
   the engine converges from the athlete's own data, not a law.
6. **Bounded self-experimentation (explore/exploit dosage).** The engine learns the
   athlete by experimenting on him, but experimentation is a minority of training, not
   the default. Governing rules:
   - Default posture is EXPLOIT: train at the current best-known optimum. A probe is the
     exception.
   - At most ONE active probe at a time (one muscle by one variable: volume, or
     frequency, or exercise selection). Everything else is held at its known-good value
     so the probe's effect is attributable. Never perturb multiple variables at once.
   - Probes are gated on uncertainty and DECAY as the model converges: run a probe only
     where the relevant posterior is still wide (Clues phase); stop and lock when it
     matures (Established). Re-probe an established parameter only at long intervals as a
     drift check, since physiology changes slowly.
   - Probe magnitude is bounded to a recovery-safe range and never overrides the
     recovery-cost guardrail or the slow-tissue backstop. A probe halts if fatigue
     signals fire (hazard gate, currently `exploration_manager` at hazard_score > 0.6).
   - Probe and evaluation window is one mesocycle (8-12 weeks) so a hypertrophy signal
     can clear noise before the posterior updates.

Recorded tension: routine 0-RIR failure is the main fatigue driver, and "always
failure + never scheduled deload" pull against each other. Reconciliation the engine
uses: the athlete trains to failure; the engine holds or trims VOLUME when
failure-driven fatigue accumulates, so a scheduled deload is never needed.

---

## Core Volume Model (referenced by every volume-bearing engine)

This block is the single source of truth for volume, frequency, and proximity-to-failure.
Engine sections reference it rather than re-deriving it.

### Unifying dose-response

The evidence reduces to one monotonic dose-response: more hard sets produce more
hypertrophy and more strength, with diminishing returns that are far steeper for
strength than for size, and no inverted-U or "too much hurts" cliff within the studied
range (to roughly 25 sets/muscle/week). There is no point inside the trained range
where added volume reverses gains.

### Diminishing-returns + recovery-cost formulation

For muscle group $m$, model the weekly hypertrophy benefit of volume $V$ (in hard sets)
as a saturating gain net of a convex recovery cost:

$$\text{Net}_m(V) = G_m \cdot \left(1 - e^{-V / \kappa_{h,m}}\right) - C_m(V, \text{state}_t)$$

Where $G_m$ is the achievable hypertrophy gain, $\kappa_{h,m}$ is the hypertrophy
saturation scale (large: size keeps climbing to 10 to 25+ sets), and
$C_m(V, \text{state}_t)$ is a convex (rising) recovery cost that scales with current
systemic and structural fatigue, sleep debt, caloric balance, and concurrent running
load. The recovery-limited soft boundary (the working definition of MRV) is the volume
where marginal benefit equals marginal cost:

$$\text{MRV}^{\text{soft}}_{m,t} = \arg\max_V \ \text{Net}_m(V), \quad
\text{equivalently} \quad \frac{d}{dV}\left[G_m(1 - e^{-V/\kappa_{h,m}})\right]
= \frac{d}{dV} C_m(V, \text{state}_t)$$

This is a soft optimum, not a clamp. Exceeding it costs recovery faster than it buys
size; it never reverses gains. Engines push toward it and trim back via volume when the
cost side rises.

### Split strength vs hypertrophy curves

Strength and hypertrophy have separate volume curves and separate optima:

- **Strength** saturates fast. Most of the strength benefit arrives by roughly
  4 sets/muscle/week; the curve is near-flat past that. Strength volume target
  $V^{\text{str}}_m$ has a small saturation scale $\kappa_{s,m}$.
- **Hypertrophy** keeps climbing well past strength saturation, to 10 to 25+ sets, with
  a large $\kappa_{h,m}$.

Because SBD supplies the strength stimulus cheaply, the hypertrophy-driven SBD volume
covers the strength requirement; the engine does not add separate high-volume strength
blocks. One shared "optimal volume" target is never used.

### Frequency is a derived scheduling output

Frequency is not a landmark and is not learned independently. For muscle $m$, weekly
frequency is computed from the hypertrophy volume target divided by the per-session
tolerable set load, bounded by recovery:

$$\text{Freq}_{m,t} = \left\lceil \frac{V^{\text{hyp}}_{m,t}}{s_{\max,m,t}} \right\rceil,
\quad s_{\max,m,t} = g(\text{per-muscle recovery}, \text{soreness clearance } \alpha_m)$$

At matched volume, frequency has no meaningful independent effect on hypertrophy or
(beyond a small skill component) on strength. The per-muscle peak-frequency table is
omitted entirely.

### Proximity to failure (effective reps): hypertrophy only

Effective reps drive hypertrophy stimulus and nothing else. For set $i$:

$$\text{Reps}_{\text{eff}, i} = \max(0, \ 5 - \text{RIR}_i)$$

At 0 RIR (failure) a set yields 5 effective reps; beyond 5 RIR a set contributes no
hypertrophic stimulus. The athlete's 0-RIR default therefore maximizes per-set
hypertrophy stimulus; the engine pays for it on the recovery-cost side and manages it
with volume. RIR does NOT modulate strength prescription. Strength load is
RIR-insensitive: RIR enters only as a measurement input to the e1RM estimate, never as
a fatigue-driven target. There is no `RIR = clamp(3.5 - 0.8 * F_index)` rule.

### Reactive downregulation: volume, not load

When a fatigue or biomarker signal fires, the engine reduces VOLUME (holds or trims
sets, multi-day). It never drops bar load off a readiness signal. Bar load is allowed
to track measured performance (e1RM trend) as normal progression. The single exception
is the slow-tissue backstop (below).

### Slow-tissue backstop (the one exception)

Exactly one rare backstop exists for genuine non-functional overreaching or connective-
tissue accumulation that the volume controller cannot resolve fast enough. It triggers
only on a persistent, multi-signal, multi-day structural breakdown (for example, rising
ground-contact asymmetry plus sustained velocity loss plus a structural-fatigue state
that does not clear with volume cuts). It is not a scheduled deload and not a taper.

---

## 1. State Estimation Engine

### Research summary

State estimation determines the athlete's latent physiological state (fitness, fatigue,
recovery, subsystem-specific readiness) from noisy, sparse, indirect telemetry. The
classic Banister impulse-response model uses TRIMP to estimate one long-lasting fitness
component and one short-lasting fatigue component, but it is ill-conditioned, assumes a
single homogeneous stress accumulator, and ignores real-world state noise (non-training
stressors, sleep disruption, sensor error). Readiness is multi-dimensional: distinct
sub-states for central nervous system (CNS) fatigue, localized structural muscle damage,
metabolic depletion, and cardiorespiratory fitness, with autonomic recovery decoupled
from peripheral structural recovery.

| Telemetry signal | Type | Target state | Predictive utility | Classification |
|---|---|---|---|---|
| Sleeping $\ln\text{RMSSD}$ | Autonomic | Parasympathetic vagal tone | Very high (leading) | Strong evidence |
| Sleeping RHR | Autonomic | Basal metabolic stress | High (leading) | Strong evidence |
| Warm-up bar velocity loss | Neuromuscular | Motor unit recruitment | Very high (leading) | Coaching consensus |
| Cumulative sleep debt | Systemic | Neuromuscular coordination | Moderate | Moderate evidence |
| Subjective soreness (DOMS) | Structural | Local tissue integrity | Low (lagging) | Coaching consensus |

ACWR is treated as a descriptive heuristic, not a deterministic injury predictor, because
mathematical coupling between the acute and chronic terms introduces spurious correlation.

### Recommended architecture

A Dual Extended Kalman Filter (DEKF). One filter estimates the time-varying
physiological states; a parallel filter continuously estimates the athlete's model
parameters (decay constants, gain coefficients). This is chosen over the single 4-state
EKF (Science.md) and over static neural networks because it handles sparse noisy
measurements, propagates uncertainty explicitly, converges fast in $N=1$, and feeds the
learnable-priors thesis: the parameter filter is itself a learner.

> **Implementation status (E7).** The shipped engine is a **2-state Banister Kalman
> filter** (`scripts/engine/banister_kalman.py`) tracking one fitness and one fatigue
> state — NOT the 3-state DEKF described above. The decoupled systemic-vs-structural
> split and the per-subsystem covariance/confidence are therefore aspirational, not
> implemented (structural fatigue is tracked separately and coarsely via per-muscle
> soreness/landmarks, not as an EKF state). A parallel RLS parameter learner
> (`rls_learner.py`) exists but is **disabled as a consumer**: it is under-identified from
> a single daily performance number, so a "mature" learner drives the decay constants to
> their clamp bounds and corrupts the A/B matrices; population defaults are demonstrably
> better (CONVERGENCE_AUDIT F4). The DEKF / joint state-parameter estimator is the upgrade
> path; until it exists, treat the parameter filter's output as NOT learned. E9 does feed
> a transient nutrition-driven `tau_fat` into the daily Banister step (deficit slows
> fatigue clearance) without overwriting the base constant.

### Mathematical model

Latent state vector at day $t$: $\mathbf{x}_t = [f_t,\ r_{neu,t},\ r_{str,t}]^T$, where
$f_t$ is metabolic fitness, $r_{neu,t}$ is neuromuscular fatigue, $r_{str,t}$ is
structural tissue damage.

$$\mathbf{x}_t = \mathbf{A}_t \mathbf{x}_{t-1} + \mathbf{B}_t w_{t-1} + \boldsymbol{\eta}_t, \quad
\mathbf{A}_t = \begin{bmatrix} e^{-1/\tau_f} & 0 & 0 \\ 0 & e^{-1/\tau_{neu}} & 0 \\ 0 & 0 & e^{-1/\tau_{str}} \end{bmatrix}, \quad
\mathbf{B}_t = \begin{bmatrix} k_f \\ k_{neu} \\ k_{str} \end{bmatrix}$$

$$\mathbf{y}_t = \mathbf{C}_t \mathbf{x}_t + \boldsymbol{\epsilon}_t, \quad
\mathbf{y}_t = [\text{RMSSD}_t,\ \text{RHR}_t,\ \bar{v}_{loss,t},\ \text{soreness}_t]^T$$

Process noise $\boldsymbol{\eta}_t \sim \mathcal{N}(0, \mathbf{Q}_t)$, measurement noise
$\boldsymbol{\epsilon}_t \sim \mathcal{N}(0, \mathbf{R}_t)$. Time constants and gains
($\tau_f, \tau_{neu}, \tau_{str}, k_f, k_{neu}, k_{str}$) are estimated by the parameter
filter, not fixed.

### Engineering design

`StateEstimationService` (Go) ingests daily telemetry, writes raw biometrics to
TimescaleDB, caches state in Redis. Data flow: webhook ingestion -> Kafka topic
`telemetry-events` -> `StateEstimationService` -> TimescaleDB/PostgreSQL -> Redis cache.

API: `POST /v1/state/estimate` accepts raw telemetry, returns the estimated state vector
and covariance. TimescaleDB columns: `timestamp` (PK), `state_fitness`,
`state_neuromuscular`, `state_structural`, `covariance_matrix` (JSONB).

### ML design

- **Priors (wide-sigma, C9):** $\tau_f \sim \mathcal{N}(30, 5^2)$,
  $\tau_{neu} \sim \mathcal{N}(11, 2^2)$, $\tau_{str} \sim \mathcal{N}(5, 1^2)$ days;
  initial state conservative with high covariance $\mathbf{P}_0 = \text{diag}(1,1,1)$.
  All are starting priors the parameter filter converges.
- **Features:** raw RMSSD, sleep RHR, daily session training volume
  (sets x reps x relative intensity), running training stress score (rTSS),
  7-day rolling sleep debt, $\ln\text{RMSSD}$ deviation from 14-day baseline.
- **Update rules:** standard Kalman predict/correct daily at end of sleep window.
- **Confidence:** $\text{Confidence}_t = 1 / (1 + \ln(1 + \det(\mathbf{P}_t)))$. High
  covariance determinant means low confidence.

```python
def predict_states(x_prev, P_prev, A, B, u, Q):
    x_pred = A @ x_prev + B @ u
    P_pred = A @ P_prev @ A.T + Q
    return x_pred, P_pred

def update_states(x_pred, P_pred, y, H, R):
    S = H @ P_pred @ H.T + R
    K = P_pred @ H.T @ np.linalg.inv(S)
    x_upd = x_pred + K @ (y - H @ x_pred)
    P_upd = P_pred - K @ H @ P_pred
    return x_upd, P_upd
```

### Failure modes

- **Sensor dropout:** run prediction-only ($x_t = A x_{t-1} + B u_{t-1}$), inflate
  $\mathbf{P}_t$ until telemetry resumes.
- **Acute non-training stressor (alcohol, illness):** if innovation
  $y_t - \mathbf{h}(x_{pred,t})$ exceeds a $3\sigma$ threshold or skin temperature
  deviates $> 1.5^\circ$C, throttle the measurement update via Huber-loss weighting
  (scale up $\mathbf{R}$) to prevent contamination.

### Confidence assessment

HRV-autonomic correlation: strong evidence. Decoupling of central and peripheral
fatigue: moderate evidence plus coaching consensus. DEKF for $N=1$ tracking: engineering
judgment.

---

## 2. Recovery Profiling Engine

### Research summary

Models the athlete's dynamic per-muscle training boundaries: minimum effective volume
(MEV), maximum adaptive volume (MAV), and recovery-limited soft boundary (MRV). These
shift continuously with concurrent running volume, energy balance, sleep, and training
age. Primary driver: the balance between mechanical tension (stimulus) and muscle damage
(recovery cost). High running volume induces lower-body eccentric damage; caloric deficit
and sleep debt suppress protein synthesis and glycogen resynthesis.

| Modifier | System | Effect on MEV | Effect on MRV (soft) | Classification |
|---|---|---|---|---|
| High running volume | Lower-extremity integrity | Elevated | Depressed (lower body) | Strong evidence |
| Caloric deficit | Systemic protein synthesis | Elevated | Depressed | Strong evidence |
| Sleep debt > 2h | Neuromuscular / endocrine | Unchanged | Depressed | Moderate evidence |
| Advanced training age | Damage resistance | Elevated | Roughly constant | Coaching consensus |

### Recommended architecture

A Hierarchical Bayesian Dynamic Linear Model (DLM) over per-muscle recovery rates. It
tracks the decay rate of performance output (velocity loss, e1RM change, soreness decay)
across sessions to converge MEV, MAV, and the soft MRV boundary. **C1: MRV is the
recovery-cost optimum from the Core Volume Model, not a ceiling.** The engine never
treats "high volume + performance decline" as proof MRV was exceeded; that inverted-U
likelihood is removed.

### Mathematical model

Performance degradation of muscle $m$:

$$\Delta P_{m,t} = \theta_{m,t} \left( \sum_{i=0}^{k} V_{m,t-i} \cdot e^{-\alpha_m (t-i)} \right), \quad
\theta_{m,t} = \mathbf{z}_t^T \boldsymbol{\beta} + \nu_{m,t}$$

Where $\alpha_m$ is the structural micro-damage clearance rate and $\mathbf{z}_t$ holds
systemic covariates (sleep, nutrition, concurrent running). The soft boundary is the
recovery-cost optimum from the Core Volume Model:

$$\text{MRV}^{\text{soft}}_{m,t} = \arg\max_V \ \text{Net}_m(V)$$

evaluated with the current $\alpha_m$ and covariates. The engine reports MEV, MAV, and
this soft optimum with a confidence interval; downstream engines treat it as a guide.

### Engineering design

`RecoveryProfilingService` (async Python) updates posteriors at end of each microcycle
via MCMC (NUTS / Gibbs) over the past 28 days. API: `POST /v1/recovery/evaluate-session`,
`GET /v1/recovery/volume-bounds`. Table `muscle_capacities`: `muscle_group` (PK),
`mev_estimate`, `mrv_soft_estimate`, `clearance_rate`, `confidence_interval` (JSONB).

### ML design

- **Priors (wide-sigma, C9; conflict resolved by widening):** baselines are unsourced
  coaching priors, labeled as such. Quads MRV widened from the two conflicting originals
  (N(18, 2.5) vs N(15, 3^2)) to a wide $\mathcal{N}(16, 4^2)$; biceps similarly widened.
  The learner converges them over mesocycles.
- **Features:** weekly sets per muscle, soreness-clearance duration, next-session e1RM
  delta, caloric balance, sleep efficiency, running rTSS, training-history length.
- **Update rules:** MCMC weekly on trailing 28 days.

```python
def estimate_soft_mrv(volume_hist, perf_hist, covariates):
    # Fit clearance rate alpha to the recovery curve (no inverted-U; no ceiling).
    best_loss, optimal_alpha = float('inf'), 0.1
    for alpha in np.linspace(0.05, 0.5, 50):
        pred = [sum(volume_hist[i] * np.exp(-alpha*(t-i)) for i in range(t+1))
                for t in range(len(volume_hist))]
        loss = np.sum((np.array(perf_hist)
                       - np.array(pred) * covariates['deficit_multiplier'])**2)
        if loss < best_loss:
            best_loss, optimal_alpha = loss, alpha
    # Soft boundary = volume where marginal hypertrophy benefit == marginal recovery cost
    return solve_net_benefit_optimum(optimal_alpha, covariates)
```

### Failure modes

- **Misattributing systemic fatigue to a local muscle:** check the systemic fatigue
  state first. If systemic fatigue is high, do not lower a muscle's parameters; scale the
  systemic modifier ($\delta_{sleep}$, $\delta_{nutri}$) instead.
- **Incomplete logs:** detect anomalous performance drops relative to logged volume,
  raise state noise, and prompt the user to confirm unlogged volume; freeze structural
  parameter updates during a confirmed acute lifestyle stressor.

### Confidence assessment

Per-muscle MEV/MAV/MRV concept: coaching consensus. Caloric-deficit suppression of
protein synthesis: moderate to strong evidence. Precise AMPK-mTOR cross-talk rates:
research gap.

---

## 3. Running Adaptation Engine

### Research summary

Concurrent training must balance cardiovascular development against mechanical load
tolerance while pursuing the tactical running targets. Jack Daniels' VDOT framework maps
aerobic performance to precise metabolic paces (Easy, Threshold, Interval, Repetition).
Running induces joint stress, tendon strain, and eccentric lower-body damage that
conflicts with lower-body hypertrophy and strength.

| Pace category | System | Primary adaptation | Neuromuscular cost |
|---|---|---|---|
| Easy / Zone 2 | Cardiovascular | Capillary density, mitochondrial volume, stroke volume | Low |
| Threshold | Metabolic clearance | Lactate threshold velocity | Moderate |
| Interval | Aerobic capacity | VO2 max, oxygen transport | Extreme |
| Repetition | Neuromuscular power | Running economy, anaerobic power | High |

### Recommended architecture

An adaptive VDOT-based feedback controller that prioritizes bone and tendon adaptation
over cardiovascular adaptation. It evaluates biomechanical stability (Garmin ground-
contact-time balance, vertical oscillation) and heart-rate-to-pace ratios to gate
progression. Volume escalation is bounded by structural readiness and ACWR (descriptive
heuristic). Mileage progression: increase weekly volume by at most 1 mile per weekly run
session (capped at 10 miles), hold the new ceiling at least 4 weeks for tendon/ligament
adaptation. Note: this 4-week hold is a structural-adaptation hold for connective tissue,
distinct from training deloads (which are not scheduled); it is a progression gate, not a
recovery cut.

### Mathematical model

VDOT from performance markers:

$$V = \frac{3.16 \cdot d \cdot t^{-1} + 0.133}{1 - 0.298 e^{-0.193 t} - 0.141 e^{-0.0414 t}}$$

Running training load via multi-factor TRIMP:

$$\text{TRIMP}_t = \text{Dur}_{\min} \cdot \frac{\text{HR}_{mean} - \text{HR}_{rest}}{\text{HR}_{max} - \text{HR}_{rest}} \cdot e^{1.92 \cdot \frac{\text{HR}_{mean} - \text{HR}_{rest}}{\text{HR}_{max} - \text{HR}_{rest}}}$$

Volume progression rule:

$$\Delta V_{run} = \begin{cases} \min(N_{runs}, 10) & \text{if } t_{hold} \ge 4\text{ wk} \ \land\ \bar{G}_{balance} \le 1.5\% \ \land\ \text{ACWR} \le 1.3 \\ 0 & \text{otherwise} \end{cases}$$

ACWR 1.3 and the 1.5% GCT-balance limit are wide-sigma priors (C9), not hard laws.

### Engineering design

`RunningAdaptationEngine` ingests Garmin/Apple Health GPS and HR, publishes VDOT and
TRIMP to Kafka. APIs: `POST /v1/running/session`, `POST /v1/running/vdot/calculate`,
`GET /v1/running/schedule`. Table `running_state`: `athlete_id` (PK), `current_vdot`,
`weekly_mileage`, `holding_weeks`, pace intervals.

### ML design

- **Priors (C9):** VDOT initialized to 45.0 (average fit tactical athlete), a wide prior.
- **Features:** pace-to-HR ratio, ground-contact-time balance, vertical oscillation,
  cadence, sleep debt, lower-body soreness.
- **Update rules:** recursive least squares with forgetting factor $\lambda = 0.95$ for
  aerobic detraining; Bayesian VDOT recalibration every 4 to 6 weeks on time trials.

```python
def compute_vdot_progression(current_vdot, mileage_hist, biomechanics,
                             holding_weeks, runs_per_week):
    gct_asym = abs(biomechanics['gct_left'] - biomechanics['gct_right'])
    if gct_asym > 1.5:                       # structural health proxy
        return "REGRESS_VOLUME", mileage_hist[-1] - runs_per_week
    if holding_weeks >= 4 and all(a < 1.3 for a in biomechanics['recent_acwr']):
        return "PROGRESS_VOLUME", mileage_hist[-1] + min(runs_per_week, 10)
    return "HOLD_VOLUME", mileage_hist[-1]
```

### Failure modes

- **Cardiac drift from heat:** integrate weather data; above 25 C, apply a temperature
  compensation multiplier to HR before updating VDOT.
- **Cardiovascular fitness outpacing biomechanical resilience:** rising GCT and
  asymmetric oscillation trigger an automated switch to low-impact cross-training
  (cycling) while holding running volume static.

### Confidence assessment

VDOT pacing: strong evidence. 4-week structural hold: coaching consensus. GCT balance as
a structural-health proxy: engineering judgment. Lower-body mechanical interference of
running on strength: strong evidence.

---

## 4. Nutrition Integration Engine

### Research summary

Nutrition is the primary controller of systemic recovery, fuel availability, and
metabolic adaptation. Static calculators (Harris-Benedict) ignore real-time TDEE change.
The MacroFactor dynamic-expenditure approach (daily intake plus trend-weight velocity)
is the gold standard. Energy balance reshapes the recovery-cost side of the Core Volume
Model: a deficit raises recovery cost (shrinking the soft MRV boundary); a surplus lowers
it (expanding the soft boundary). During a deficit, scale weight is noisy from water,
cortisol, and glycogen; rely on trend weight.

| Phase | Metric reliability | Effect via Core Volume Model |
|---|---|---|
| Aggressive cut | Low (scale weight noisy) | Recovery cost up; soft MRV down; hold load, trim volume |
| Moderate cut | Moderate | Slight cost up; mild soft-MRV reduction |
| Maintenance | High | Baseline |
| Lean bulk | High | Recovery cost down; soft MRV up; volume can climb |

### Recommended architecture

A deterministic energy-balance engine modeled on MacroFactor. Daily intake and scale
weight are double-exponentially smoothed into trend weight, which solves the energy-
balance equation daily. The resulting metabolic index feeds the recovery-cost term
$C_m(V, \text{state})$ in the Core Volume Model; it modulates VOLUME boundaries, never
bar load.

### Mathematical model

$$W_{trend,t} = W_{trend,t-1} + \alpha (W_{scale,t} - W_{trend,t-1}), \quad \alpha \approx 0.1$$

$$\text{TDEE}_t = \frac{1}{N} \sum_{i=0}^{N-1} \left( \text{Intake}_{t-i} - \Delta E_{mass,t-i} \right), \quad
\Delta E_{mass,t} = (W_{trend,t} - W_{trend,t-1}) \cdot \rho(F_t)$$

The energy density of weight change is NOT the fixed 7700 kcal/kg (that value is pure
adipose only). Use the Forbes-partitioned composition-aware density: with fat mass $F$ and
lean-partition $p = C/(C+F)$, $C = 10.4$ kg,

$$\rho(F_t) = p \cdot 1820 + (1-p) \cdot 9440 \ \text{kcal/kg} \quad (\text{lean } 1820, \text{ fat } 9440)$$

A lean lifter partitions more change to lean, lowering $\rho$ in a cut and raising the lean
share in a bulk. During the first 1 to 2 weeks of a phase change (deficit onset, refeed,
carb/sodium swing) discount this conversion: the early step is ~84% fat-free mass
(~2380 kcal/kg), ramping toward ~6000 kcal/kg by week 6, so the glycogen/water step must
not be attributed to fat. Re-deriving TDEE each rolling window captures adaptive
thermogenesis (~120 kcal/day, beta_AT=0.14, tau_AT=14d) automatically without hard-coding it.
Window $N$ is roughly 14 to 28 days. Reference: Hall/NIDDK dynamic model (Lancet 2011).

Metabolic adjustment index and its effect on the soft volume boundary:

$$\Phi_{nut} = \frac{\bar{C}_{intake} - \text{TDEE}}{\text{TDEE}}, \quad
\text{MRV}^{\text{soft}}_{adj,m} = \text{MRV}^{\text{soft}}_{m} \cdot
\left(1 + \text{sign}(\Phi_{nut}) \cdot \sqrt{|\Phi_{nut}|}\right)$$

Target calories for a weekly rate goal $G$ (percent bodyweight/week):
$\text{TargetCalories}_t = \text{TDEE}_t + (G \cdot W_{trend,t} \cdot \rho(F_t) / 7)$.

### Engineering design

`NutritionIntegrationService` syncs food logs and body weight. APIs:
`POST /v1/nutrition/log`, `GET /v1/nutrition/state`. Table `nutrition_state`:
`timestamp` (PK), `weight_lbs`, `caloric_intake`, `estimated_tdee`, `energy_balance_ratio`.

### ML design

- **Priors:** BMR via Cunningham ($370 + 21.6 \cdot \text{LBM}$) or Mifflin-St Jeor with
  activity multiplier.
- **Update rules:** solve TDEE over a rolling 14 to 28 day window. Do NOT lock or fall back
  to a static prior when logging is incomplete: under-logging is the dominant error channel
  (intake uncertainty explains ~48-61% of individual prediction variance). Treat logged
  intake as a noisy observation carrying a LEARNED per-person bias term (systematic
  under-report), and anchor the estimate on the trend-weight signal, which integrates true
  energy balance. A Kalman/Bayesian reconciliation of (noisy intake, trend-weight change)
  is the intended design and matches the learned-priors principle.

```python
def calculate_dynamic_tdee(cal_history, weight_history, rho, intake_bias=1.0):
    # rho: composition-aware energy density kcal/kg = p*1820 + (1-p)*9440, p = C/(C+F)
    # intake_bias: learned per-person under-report correction (>=1.0), not a hard gate
    n = min(len(cal_history), len(weight_history))
    if n < 14:
        return None  # defer; caller keeps prior estimate, does not overwrite the signal
    w_trend, trend = weight_history[0], []
    for w in weight_history:
        w_trend += 0.1 * (w - w_trend)   # EWMA, alpha ~0.1/day (~7-10 day half-life)
        trend.append(w_trend)
    delta_kcal_day = (trend[-1] - trend[0]) * rho / n
    return (sum(cal_history) / n) * intake_bias - delta_kcal_day
```

### Failure modes

- **Partial / inconsistent logging:** do not revert to a static baseline (that discards the
  signal). Update the learned intake-bias term and lean on the trend-weight anchor; widen the
  intake observation variance when logging is sparse rather than gating it out.
- **Water-weight flares / phase transitions:** the EWMA trend absorbs day-to-day
  glycogen/sodium noise, but a phase change is a step, not noise: discount the
  weight-trend-to-energy conversion for ~1 to 2 weeks after deficit onset, refeed, or a large
  carb/sodium swing so the early water step is not booked as fat.

### Confidence assessment

Energy-balance thermodynamics and trend-weight TDEE: strong evidence. Blunted protein
synthesis in a deficit: strong evidence.

---

## 5. Fatigue Detection Engine

### Research summary

Fatigue detection isolates adaptive overreaching from chronic maladaptive stress. It
relies on multi-layered leading indicators rather than single lagging ones.

| Signal | Class | System | Sensitivity |
|---|---|---|---|
| $\ln\text{RMSSD}$ deviation | Leading | Autonomic | High |
| Sleep respiratory rate | Leading | Autonomic / immune | High |
| Velocity loss | Leading | Neuromuscular | High |
| EWMA-ACWR | Descriptive heuristic | External workload | Moderate |
| RHR trend | Lagging | Cardiovascular | Moderate |
| Soreness (DOMS) | Lagging | Local tissue | Low |

### Recommended architecture

A multivariate anomaly detector computing a Mahalanobis distance of daily physiological
strain against a rolling 21-day healthy baseline, cross-checked against a composite
hazard score. **It alerts the execution engines to reduce planned training VOLUME (not
load), reactively and over multiple days (C-load-vs-volume).** Classifications: Optimal,
Systemic Fatigue, Structural Fatigue, Critical. There is no scheduled deload and no
`FORCE_DELOAD` load cut; "critical" means a multi-day reactive volume downregulation, and
only a persistent unresolved structural breakdown escalates to the single slow-tissue
backstop.

### Mathematical model

$$F_{index} = \sqrt{(\mathbf{v}_t - \boldsymbol{\mu}_t)^T \boldsymbol{\Sigma}_t^{-1} (\mathbf{v}_t - \boldsymbol{\mu}_t)}, \quad
\mathbf{v}_t = [\text{RMSSD}_t,\ \text{RHR}_t,\ \Delta\text{e1RM}_t,\ \text{ACWR}_t]^T$$

EWMA-ACWR with $\lambda_a = 0.25$, $\lambda_c \approx 0.069$. Composite hazard:

$$HS_t = w_1 \max(0, -\mathcal{Z}_{\text{HRV},t}) + w_2 \mathbb{I}(\text{ACWR}_t > 1.3)(\text{ACWR}_t - 1.3) + w_3 \frac{\text{SleepDebt}_t}{3600}$$

The thresholds (Mahalanobis 2.5, hazard 0.8, $\mathcal{Z}_{\text{HRV}} = -1.5$,
ACWR 1.3) are wide-sigma learnable priors (C9), each converged from the athlete's own
baseline, not fixed laws.

### Engineering design

`FatigueDetectionService` (async, Kafka) outputs warnings. Tables `fatigue_logs` /
`fatigue_assessments`: timestamp, `mahalanobis_distance`, `composite_hazard_score`,
`active_alert_level`, `contributing_factors` (JSONB), `action_directives`.

### ML design

- **Priors (C9):** normal physiological variance from population baselines; thresholds as
  wide priors.
- **Features:** sleeping $\ln\text{RMSSD}$, sleep respiratory rate, sleeping RHR, velocity
  output at 80% load, training monotony.
- **Update rules:** isolation forest / anomaly model retrained on the athlete's baseline;
  morning post-wake evaluation. A temporal persistence filter requires a 3-day trend
  before any downregulation (no single-day reaction).

> **Implementation status / sensing reality (E12).** The app does NOT currently collect
> several signals this spec lists: **sleep/sleeping respiratory rate**, **skin temperature**
> (the $1.5^\circ$C illness throttle), and **movement / warm-up bar velocity** (the
> velocity-loss and "velocity at 80% load" features, and the RIR-correction in §7). Treat
> these as FUTURE hardware, not active inputs. What is implemented: HRV ($\ln$RMSSD) and RHR
> enter as **Kalman measurement-noise scalers and z-score gates**, plus the EWMA-ACWR and a
> composite hazard score with a 3-day persistence filter — NOT the fixed linear fatigue
> blend (lnRMSSD 0.35 / RHR 0.15 / sleep-debt 0.20) some earlier text implied; the
> noise-scaling / z-score approach is more principled and is the one to follow. True sleep
> debt now comes from logged sleep DURATION (E11), not only the 0-100 sleep score. Velocity
> loss appears in the slow-tissue backstop description but is currently approximated by
> e1RM-trend + soreness, since bar velocity is not captured.

```python
def assess_fatigue_state(f_index, hazard, z_hrv, days_persisted):
    # Output is always a VOLUME directive (never a load cut).
    if days_persisted < 3:
        return "HOLD_OBSERVE"                  # persistence filter
    if f_index > 2.5 or hazard >= 0.8:
        return "DOWNREGULATE_VOLUME_MULTIDAY"   # reactive, multi-day, volume only
    if f_index > 1.8 or hazard >= 0.5:
        return "TRIM_VOLUME_30"
    return "CONTINUE_AS_PLANNED"

def structural_backstop(structural_state, gct_asym, velocity_loss, cleared_by_volume):
    # The one rare slow-tissue exception, NOT a scheduled deload.
    if (not cleared_by_volume) and structural_state == "HIGH" \
            and gct_asym_rising(gct_asym) and velocity_loss_sustained(velocity_loss):
        return "SLOW_TISSUE_BACKSTOP"
    return None
```

### Failure modes

- **Acute dehydration mimicking chronic fatigue:** the 3-day persistence filter prevents
  single-day reactions.
- **Sympathetic overtraining masking (anomalous HRV rise):** reconcile raw HRV elevation
  against performance drops (bar-velocity loss) to detect sympathetic overdrive.

### Confidence assessment

Autonomic changes in overreaching: strong evidence. EWMA-ACWR injury correlation:
strong evidence and coaching consensus (heuristic only). Training-monotony injury
correlation: moderate evidence.

---

## 6. Program Synthesis Engine

### Research summary

Program synthesis is high-dimensional, sequential decision-making balancing long-term
adaptation against short-term fatigue. Rule systems are brittle; pure linear programming
is rigid and struggles with temporal dependencies; genetic algorithms converge poorly;
RL + MCTS framed as a Markov Decision Process is the state of the art for long-horizon
sequencing; constraint programming (CP-SAT) is outstanding at discrete scheduling.

### Recommended architecture

A hybrid hierarchical framework: a Deep RL Policy-Value Network guided by Monte-Carlo
Tree Search (MCTS) proposes weekly training sequences, and a Constraint Programming
(OR-Tools CP-SAT) layer enforces safety boundaries (recovery windows, sequence
constraints). **C1: the CP layer no longer enforces a hard `sum(sets) <= MRV` ceiling.**
The soft recovery boundary is expressed in the objective as a rising recovery-cost
penalty, and the CP layer enforces only genuinely hard constraints (intraday recovery
windows, no back-to-back heavy SBD). Volume is allocated to maximize hypertrophy net
benefit (Core Volume Model) while harvesting SBD strength.

### Mathematical model

MDP $(\mathcal{S}, \mathcal{A}, \mathcal{P}, \mathcal{R}, \gamma)$ with daily state
$\mathbf{s}_t = [\mathbf{x}_t^T, \mathbf{y}_{mileage,t}^T, \mathbf{c}_{damage,t}^T, \mathbf{u}_{goals,t}^T]^T$.
Reward maximizes hypertrophy net benefit and protected strength/aerobic adaptation, minus
a convex recovery-cost penalty (replacing the hard MRV indicator):

$$R(\mathbf{s}_t, a_t) = w_1 \sum_{m} \text{Net}_m(V_{m}) + w_2 \sum_{g \in \text{SBD}} \Delta\text{e1RM}_g + w_3 \Delta V_{run} - w_4 \,\text{RecoveryCost}(\mathbf{s}_t, a_t)$$

MCTS selects via UCT:

$$\text{UCT}(s,a) = Q(s,a) + c_{puct} P(s,a) \frac{\sqrt{\sum_b N(s,b)}}{1 + N(s,a)}$$

Hard CP constraints (kept): if a strength and a running session share a day, separate by
at least 6 hours; no back-to-back heavy squat/deadlift days; at most 2 active sessions
per day. Soft (objective penalty, not constraint): per-muscle weekly volume past the
recovery-cost optimum.

### Engineering design

`ProgramSynthesisEngine` (Python, OR-Tools, gRPC, Celery workers). API:
`POST /v1/program/generate-week`. Table `synthesized_programs`: `program_id` (PK),
dates, `workout_sequence` (JSONB), `expected_fatigue_curve` (JSONB).

```python
def execute_mcts_synthesis(root_state, policy_net, constraint_solver, budget=1000):
    root = MCTSNode(state=root_state)
    for _ in range(budget):
        node = root
        while node.is_fully_expanded() and not node.is_terminal():
            node = node.select_uct_child()
        action_probs, _ = policy_net.evaluate(node.state)
        # CP filters only HARD constraints (windows, SBD spacing); volume is soft-penalized
        valid = constraint_solver.filter_actions(node.state, action_probs)
        node.expand(valid)
        node.backpropagate(node.simulate_rollout())
    return root.get_best_action()
```

### Failure modes

- **Policy exploiting model gaps:** the hard CP layer (recovery windows, SBD spacing)
  overrules the network. Note the hard layer no longer includes a volume ceiling; the
  recovery-cost penalty in the reward bounds volume instead.
- **Infeasible constraints:** progressive relaxation. Relax secondary volume first, then
  non-priority accessories; never bypass core recovery-window constraints.

### Confidence assessment

CP for scheduling and MDP for sequential planning: mathematical fact. RL + MCTS for
individualized planning: engineering assumption. Sequence constraints: coaching consensus.

---

## 7. Session Generation Engine

### Research summary

Sessions convert macro targets into concrete movement selection, set distribution, and
rep/intensity targets. Heavy neural compound lifts (SBD) go first to maximize mechanical
output and protect technique under fatigue. Isolation and hypertrophy work can use
Doggcrapp rest-pause and Meadows pump methods, which are fatigue-efficient (high
effective-rep count at lighter absolute loads). Sequencing draws on Meadows' 4-phase
system (pre-activation, explosive compound, supramaximal pump, loaded stretch) and
stretch-mediated hypertrophy (loading in the lengthened position).

### Recommended architecture

A movement-taxonomy sequence compiler. Each exercise is tagged with joint-tax rating,
recruitment profile, loading bias (lengthened/shortened/mid-range), and a stimulus-to-
fatigue ratio. Sessions route movements through the 4-phase pipeline and size sets from
the hypertrophy volume target. **C4: RIR is not modulated by fatigue.** The athlete's
0-RIR default is preserved; per-set hypertrophy stimulus is the effective-reps count
(5 - RIR) from the Core Volume Model. There is no `RIR = clamp(3.5 - 0.8 * F_index)`.
**C1: set count is guided toward the soft recovery optimum, not clamped to MRV.**

### Mathematical model

Stimulus-to-fatigue ratio:

$$SFR(e, m) = \frac{\mathbb{E}[\text{Stimulus}_{hyp}(e, m)]}{\mathbb{E}[\text{Fatigue}_{sys}(e)] + \mathbb{E}[\text{JointStrain}(e)]}$$

Session set target for muscle $m$ is guided toward (not clamped at) the recovery-cost
optimum from the Core Volume Model:

$$S_{target, m} = \text{toward}\big(\text{MEV}_m,\ \text{MRV}^{\text{soft}}_{m,t}\big)$$

Rest-pause stimulus load $SL = \text{Reps}_{init} + \text{Reps}_{mini1} + \text{Reps}_{mini2}$
(all at RPE 10); progression when $SL_t > SL_{t-1}$ at the same load. Strength prescription
remains RIR-insensitive (see Strength Progression).

### Engineering design

`SessionGenerationService` compiles JSON workouts cached in Redis. APIs:
`POST /v1/session/generate-daily`. Tables `exercise_taxonomy` / `exercises`:
`exercise_id` (PK), `name`, muscles, `movement_pattern`, `loading_bias`,
`joint_stress_index`, `neuromuscular_tax_rating`, `axial_loading_factor`,
`supports_rest_pause`.

```python
def generate_workout_session(target_muscle_volumes, structural_state, exercises_db):
    plan = []
    for muscle in sorted(target_muscle_volumes, key=target_muscle_volumes.get, reverse=True):
        sets_needed = target_muscle_volumes[muscle]      # toward soft optimum, not a clamp
        avail = [e for e in exercises_db if muscle in e['target_muscles']]
        if structural_state.get(muscle) == "HIGH":       # joint protection only
            avail = [e for e in avail if e['axial_loading_factor'] < 0.5]
        ex = max(avail, key=lambda x: x['sfr_score'])
        # RIR target is the athlete's chosen default (0 RIR); NOT modulated by fatigue.
        protocol = "REST_PAUSE" if (sets_needed <= 4 and ex['isolation']) else "STRAIGHT_SETS"
        plan.append({"exercise": ex['name'], "protocol": protocol,
                     "sets": sets_needed, "rir_target": 0})
    return plan
```

### Failure modes

- **Incompatible substitution:** substitutions are bound by taxonomic matching, within
  the same phase bracket and equivalent compound/isolation class, with systemic-load
  recalculation.
- **Same-day heavy deadlift + squat in a high-fatigue cycle:** a static-collision layer
  checks combined axial load and swaps a secondary heavy compound for a machine
  alternative; this reduces VOLUME / movement load, not bar load on the primary lift.

### Confidence assessment

Exercise-order prioritization: coaching consensus. Effective-reps model: moderate
evidence. Stretch-mediated hypertrophy: strong evidence.

---

## 8. Concurrent Interference / High-Frequency Concurrent Training

### Research summary

The core challenge is coordinating high-frequency hypertrophy lifting (4 to 6x/week)
with high-frequency running (4 to 5x/week). The interference effect runs through
AMPK-mTOR crosstalk (endurance AMPK acutely inhibits mTOR) and through neuromuscular
fatigue / eccentric damage / glycogen depletion in the lower body. It is dose-dependent
and manageable: separate sessions by a recovery window, prioritize lifting, keep running
intensity controlled (Zone 2) in heavy blocks, and micro-dose lifting (1 to 3 sets per
muscle per session) to recover within 24 hours.

| Combination | Local interference | Systemic | Strategy |
|---|---|---|---|
| Zone 2 run + upper-body lift | None | Low | No separation needed |
| VO2 intervals + heavy squat | Extreme | Extreme | Min 6h window; separate days |
| Zone 2 run + lower hypertrophy | Moderate | Moderate | Runs < 45 min; cardio after lifting |

### Recommended architecture

A decoupled multi-domain scheduler that models systemic and localized lower-body
structural fatigue. When running load is high, it compresses lower-body lifting toward
minimum effective floors while preserving upper-body volume. **C1: lower-body volume is
throttled by recovery cost, not clamped to a ceiling**; the throttle is a volume
reduction, never a bar-load change.

### Mathematical model

Localized interference index and lower-body recovery index:

$$\mathcal{I}_{local,m,t} = \sum_{i \in \text{Runs}_t} \chi_m \cdot \text{ImpactIndex}_i \cdot e^{-\Delta t_i / \tau_{rec}}, \quad
I_{met,t} = \sum_{d=0}^{7} \text{TSS}_{run,t-d} \, e^{-\alpha_{aer} d}$$

with $\chi_{quads} \approx 1.0$, $\chi_{chest} \approx 0.0$, $\tau_{rec} \approx 12$h.
Lower-body volume target is throttled (floored, not zeroed):

$$V^{\text{hyp}}_{lb,adj,t} = V^{\text{hyp}}_{lb,t} \cdot \max\left(0.4,\ 1 - I_{met,t} \cdot R_{lb,t}\right)$$

### Engineering design

`ConcurrentTrainingScheduler` runs during daily scheduling. APIs:
`POST /v1/concurrent/evaluate`, `GET /v1/training/concurrent-feasibility`. Table
`concurrent_constraints`: `systemic_interference_factor`, `lower_body_recovery_index`,
`last_updated`.

```python
def check_concurrent_interference(running_load_tss, hrv_recovery):
    coeff = (running_load_tss / 1000.0) * (1.0 - hrv_recovery)
    if coeff > 0.75:                  # priors (C9), learnable
        return 0.50, "EASY_ZONE_ONLY"   # scale lower-body VOLUME, clamp running pace
    if coeff > 0.40:
        return 0.80, "THRESHOLD_CLAMPED"
    return 1.0, "FREE"

def resolve_concurrent_conflict(strength, run):
    if abs(run.start - strength.start).total_seconds()/3600.0 < 6.0 \
            and strength.muscle_group in ("quads", "hamstrings", "calves"):
        strength.start = strength.start.replace(hour=8)   # AM strength
        run.start = run.start.replace(hour=16)            # PM run
        return "SCHEDULE_ADJUSTED_TO_6H_GAP", [strength, run]
    return "NO_ADJUSTMENT_REQUIRED", [strength, run]
```

### Failure modes

- **Athlete ignores the separation constraint:** next-day biometrics detect high local
  structural fatigue; the system scales down the next lower-body session's VOLUME (about
  20%), not its load.
- **Accumulated connective-tissue damage despite stable HRV:** rising GCT asymmetry or
  oscillation drift regression-scales lower-body lifting and running volume; if it does
  not clear, escalate to the slow-tissue backstop.

### Confidence assessment

AMPK-mTOR interference: strong evidence. 6-hour separation efficacy: strong evidence and
coaching consensus. High-frequency concurrent feasibility under low-volume compound
clusters: coaching consensus (Tactical Barbell, SOF prep).

---

## 9. Two-A-Day Decision Engine

### Research summary

Running and lifting on the same day requires managing the inter-session window. A minimum
3 to 6 hour interval lets transient metabolic disturbances (glycogen depletion, acidosis,
AMPK activation) return to baseline. Sequence priority: high-priority neural adaptation
(maximal strength) is best first in the day; if running performance is the target, run
first. High-intensity running immediately after heavy lifting must be avoided (acute
spinal and lower-body fatigue raise injury risk).

| Systemic readiness | Sleep debt | Decision | Sequence |
|---|---|---|---|
| Optimal (>70%) | < 1h | Split (two-a-day) | AM strength / PM run |
| Compromised (50-70%) | 1-2h | Consolidate (low volume) | Single short session |
| Suppressed (<50%) | > 2h | Single low-intensity or rest | N/A |

Consolidation reduces session VOLUME, not bar load, and is reactive (not a scheduled cut).

### Recommended architecture

A circadian session splitter evaluating sleep architecture, cumulative fatigue, and daily
readiness. It splits, consolidates, or reduces secondary-session volume.

### Mathematical model

Two-a-day feasibility:

$$DF_t = w_{read}\,\text{Readiness}_t - w_{debt}\frac{\text{SleepDebt}_t}{3600} - w_{def}\,\text{CaloricDeficit}_t$$

Split permitted if $DF_t \ge 0.65$ (a wide-sigma prior, C9, converged per athlete).
Inter-session rest: $T_{rest} = \max(3.0,\ 3.0 + 1.5 \cdot \text{TSS}_{s1})$ hours.

### Engineering design

`TwoADayScheduler` in the daily pipeline. APIs: `GET /v1/scheduler/split-decision`,
`GET /v1/schedule/two-a-day-check`. Table `daily_schedule`: `date` (PK), session ids,
`planned_separation_hours`, `feasibility_status`.

```python
def optimize_double_session(readiness, sleep_debt_h, caloric_deficit):
    feasibility = 0.5*readiness - 0.2*(sleep_debt_h/8.0) - 0.3*(caloric_deficit/1000.0)
    if feasibility >= 0.65:   # learnable prior
        return {"split": True, "sequence": "STRENGTH_FIRST", "separation_hours": 8.0}
    # Consolidate / reduce VOLUME of the secondary session (never cut bar load on a signal)
    return {"split": False, "sequence": "CONSOLIDATE_OR_REDUCE_VOLUME", "separation_hours": 0.0}
```

### Failure modes

- **Late session harming sleep:** if sleep-onset latency rises more than 30 min after
  evening running, enforce a hard cutoff time for high-intensity work.
- **Inadequate inter-session refueling:** monitor session-2 power/pace degradation;
  trigger carbohydrate/electrolyte targets for the inter-session window.

### Confidence assessment

Minimum 3-hour window for molecular interference: strong evidence. Strength-before-
endurance sequencing: moderate evidence and coaching consensus. Sleep deprivation impact
on high-intensity capacity: strong evidence.

---

## 10. Athlete Learning Engine

### Research summary

The engine treats the athlete as an $N=1$ system, using serial observations over weeks
and months to learn individual response to volume, frequency, running load, and recovery.
The headline gap the meta-analyses cannot fill (individual volume tolerance) is exactly
this engine's thesis. Bayesian updating combines population priors with individual
telemetry; a Gaussian Process surrogate maps the non-linear diminishing-returns response
surface (locating the inflection of the benefit-vs-cost curve).

### Recommended architecture

An adaptive learning loop using a Gaussian Process (GP) surrogate plus dynamic Bayesian
parameter updates. **The GP is chosen over Science.md's Kalman + KL phase thresholds**
because the problem is locating the inflection of a diminishing-returns curve. The
learned parameters are split by goal and gated on mesocycle-length blocks.

### Mathematical model

GP over a multi-dimensional workload input $\mathbf{w}$ with an anisotropic Matern-5/2
kernel:

$$f(\mathbf{w}) \sim \mathcal{GP}(m(\mathbf{w}), k(\mathbf{w}, \mathbf{w}')), \quad
d_{len}(\mathbf{w}, \mathbf{w}') = \sqrt{\sum_i \frac{(w_i - w'_i)^2}{\ell_i^2}}$$

where $\ell_i$ is the learned sensitivity (lengthscale) for input $i$. Parameters update
sequentially via Bayes:
$P(\boldsymbol{\theta} \mid \mathcal{D}_t) \propto P(\mathcal{D}_t \mid \boldsymbol{\theta}) P(\boldsymbol{\theta} \mid \mathcal{D}_{t-1})$.

Learned parameters (all wide-sigma priors, C9; volume split by goal, C2; frequency
removed as a landmark, C3; convergence gated on mesocycles, C8):

| Parameter | Prior mean | Interval | Required observations (mesocycle-gated) |
|---|---|---|---|
| Hypertrophy volume (sets/muscle/wk) | 10 | [4, 25] | 8 to 12 week blocks |
| Strength volume (sets/muscle/wk) | 4 | [2, 8] | 8 to 12 week blocks |
| Optimal mileage (mi/wk) | 25 | [15, 45] | 16 running activities over a mesocycle |
| Exercise selection | balanced | multi-class | 6 logged attempts/movement |
| Recovery clearance rate $\alpha$ | 0.15/day | [0.08, 0.28] | 14 baseline days |

Frequency is not in this table: it is derived from the hypertrophy volume target plus
recovery (Core Volume Model). The RIR target is not learned as a prescription landmark;
the athlete's 0-RIR default stands and only feeds effective-reps for hypertrophy.

Stability is read over mesocycles. KL divergence between posteriors a mesocycle apart
must fall below $\tau_{KL}$ before a parameter is considered converged; a 4-session or
single-block signal is never sufficient for volume/hypertrophy parameters.

### Engineering design

`AthleteLearningEngine` runs nightly PyMC/Stan routines, versioned in MLflow. API:
`POST /v1/learning/update-posterior`, `GET /v1/learning/parameters`. Table
`athlete_priors`: `parameter_name` (PK), prior/posterior mean and variance,
`observations_count`, plus a `goal` discriminator (strength vs hypertrophy).

```python
def update_athlete_priors(volumes, performances, goal, mesocycle_weeks):
    if mesocycle_weeks < 8:          # C8: do not converge volume params on short windows
        return "INSUFFICIENT_BLOCK_LENGTH"
    with pm.Model():
        alpha = pm.Normal('alpha', mu=100.0, sigma=15.0)
        # separate beta per goal (C2): strength saturates fast, hypertrophy climbs
        beta_vol = pm.Normal(f'beta_vol_{goal}', mu=(2.5 if goal=='strength' else 4.0), sigma=1.0)
        sigma = pm.HalfNormal('sigma', sigma=5.0)
        mu = alpha + beta_vol * volumes
        pm.Normal('y_obs', mu=mu, sigma=sigma, observed=performances)
        trace = pm.sample(1000, tune=1000, progressbar=False, return_inferencedata=True)
    return trace.posterior[f'beta_vol_{goal}'].mean().item()
```

### Failure modes

- **Covariate shift (seasonal heat):** integrate weather into the baseline regression to
  normalize performance against ambient temperature.
- **Parameter drift from chronic telemetry change:** restrict latent parameters to
  physiologically valid bounds; if a parameter shifts more than $\pm 3\sigma$ in 7 days,
  lock the model and flag for audit.

### Confidence assessment

Bayesian inference and GP modeling: strong evidence. Utility of $N$-of-1 design in
individualizing parameters: moderate evidence.

---

## 11. Controlled Experimentation Engine

### Research summary

To map the athlete's true tolerances, the system runs active controlled experiments
rather than relying on passive observation. Aggressive exploration risks injury;
conservative exploration is too slow. Safe Bayesian Optimal Experimental Design
(Safe-BOED) maximizes expected information gain (EIG) while constraining the search to
regions where the probability of exceeding a safety boundary stays below $\delta_{safe}$.

### Recommended architecture

A Safe-BOED active learner that coordinates structured training blocks into safe testing
protocols, terminating tests if fatigue spikes. **C8: experiment blocks run over
mesocycle-length horizons** for volume/hypertrophy parameters, not short windows.

### Mathematical model

$$\mathbf{d}_{t+1} = \arg\max_{\mathbf{d}} \ \mathbb{E}_{\mathbf{y}}\left[D_{KL}\big(P(\boldsymbol{\theta} \mid \mathbf{d}, \mathbf{y}) \,\|\, P(\boldsymbol{\theta})\big)\right]
\quad \text{s.t.} \quad P\big(F_{index}(\mathbf{d}) > 2.5 \mid \mathcal{D}_t\big) \le \delta_{safe}$$

with $\delta_{safe} = 0.05$ (a prior, C9). Implementation timeline (mesocycle-paced):

| Horizon | Focus | Strategy |
|---|---|---|
| Weeks 1-4 | Baseline mapping | Establish base metrics; 4-week structural holds |
| Weeks 5-16 | Local volume exploration | Step volume per muscle under Safe-BOED, read over full blocks |
| Weeks 17-28+ | Concurrent limit mapping | Escalate running mileage slowly while tracking joint stability |

The volume-exploration phase is widened (versus the originals' weeks 5 to 12) so each
hypertrophy-volume read spans a mesocycle (C8).

### Engineering design

`ExperimentationEngine` maintains an experiment ledger. APIs: `POST /v1/experiment/propose`,
`POST /v1/experiment/evaluate`. Tables `experiments` / `active_experiments`:
`experiment_id` (PK), `phase_name`, `independent_variable`, `target_value`,
`safety_probability`, `status`.

```python
def propose_safe_volume_experiment(gp_model, current_volume, max_risk=0.05):
    candidates = np.linspace(current_volume, current_volume + 6, 20)
    best, max_eig = current_volume, -1.0
    for d in candidates:
        mean, std = gp_model.predict(d)
        p_over = 1.0 - norm.cdf(2.5, loc=mean, scale=std)
        if p_over <= max_risk:
            eig = estimate_entropy_reduction(gp_model, d)
            if eig > max_eig:
                max_eig, best = eig, d
    return best
```

### Failure modes

- **Non-compliance (extra sets, running too fast):** flag the deviation, mark the block
  invalid, enter a conservative maintenance window. Note this is data hygiene, not a
  scheduled deload.
- **Experiment triggers joint pain before systemic metrics move:** a daily joint-pain
  check above 3/10 terminates the experiment and registers the current volume as the
  measured threshold.

### Confidence assessment

Safe Bayesian optimization under constraints: established statistical principle.
Broad multi-variable athletic application outside clinical settings: speculative.

---

## 12. Strength Progression Engine

### Research summary

Strength comes from systematic, autoregulated loading of the SBD lifts. Fixed linear
progression stalls advanced lifters; RPE/RIR autoregulation manages daily readiness; VBT
(bar velocity) is the most objective readiness signal. Fatigue masking: high systemic
volume and running fatigue can depress measured e1RM while a productive block is running;
the engine must not misread this as a need to cut load.

**C4 applies here: strength prescription is not modulated by fatigue-derived RIR.**
RIR enters as a measurement input to e1RM and as a fixed scheme constant
($\text{RIR}_{target}$ in a planned rep scheme), never as a readiness or fatigue signal
that moves the load. The load does not shift off a daily readiness reading. **Load-vs-volume
reconciliation applies here:** bar load tracks measured performance (e1RM trend), which
is normal progression and stays. Fatigue- or biomarker-triggered downregulation is
expressed as a volume cut, not a load cut on a readiness signal.

### Recommended architecture

An autoregulated feedback loop on e1RM. The warm-up velocity check sets the day's load
target relative to measured readiness; intra-session fatigue stops (terminate sets when
performance drops by a set threshold) autoregulate VOLUME. Strength volume targets the
fast-saturating curve (about 4 sets) from the Core Volume Model, harvested from SBD.

### Mathematical model

e1RM via Epley/Brzycki form:

$$\text{e1RM}_t = \frac{W}{1 - 0.0225 (R + \text{RIR})}, \quad
W_{target} = \text{e1RM}_{t-1} \cdot \big(1 - 0.0225 (R_{target} + \text{RIR}_{target})\big)$$

Bar load follows e1RM trend (measured performance). A fatigue signal does NOT cut load;
it cuts volume. The slow-tissue backstop is the only path that pauses loading, and only
on a persistent unresolved structural breakdown.

### Engineering design

`StrengthProgressionService` processes daily logs. APIs: `POST /v1/strength/log-set`,
`GET /v1/strength/overload-target`. Tables `strength_logs`, `lift_progression_states`:
`current_e1rm`, `rolling_e1rm_slope`, `consecutive_plateau_days`.

```python
def calculate_next_session_load(state, last_sets, target_reps=5, target_rir=0):
    # RIR is a MEASUREMENT input to e1RM only; load is RIR-insensitive in prescription.
    best_e1rm = max(s["weight"] / (1 - 0.0225*(s["reps"] + s["rir"])) for s in last_sets)
    smoothed = kalman_smooth(state.e1rm_history + [best_e1rm])
    # Load tracks measured performance (normal progression). No readiness-driven load cut.
    next_load = smoothed * (1 - 0.0225*(target_reps + target_rir))
    return next_load, best_e1rm

def fatigue_response_strength(fatigue_signal):
    # Reactive downregulation is VOLUME, never load.
    return "TRIM_STRENGTH_VOLUME" if fatigue_signal else "PROCEED"
```

### Failure modes

- **Ego / miscalibrated RIR:** cross-reference reported RIR with concentric velocity. If
  a reported 2-RIR set shows velocity < 0.15 m/s (near failure), correct the logged RIR
  for the e1RM estimate. This corrects a measurement, it does not change prescription
  philosophy.
- **Fatigue masking:** detect the pattern (depressed e1RM under high volume with a
  productive block) and respond by trimming VOLUME, not by cutting load or forcing a
  deload.

### Confidence assessment

e1RM formulas: strong mathematical evidence. RPE/RIR and VBT autoregulation correlation
with strength adaptation: strong evidence. Fatigue masking: strong evidence.

---

## 13. Hypertrophy Volume Engine

### Research summary

Mechanical tension is the primary hypertrophy stimulus; effective reps (high motor-unit
recruitment under fatigue) drive growth. More hard sets produce more growth with
diminishing returns and no inverted-U to about 25 sets/muscle/week (Core Volume Model).
Per-muscle recovery timelines differ (running depletes lower-body recovery; upper body is
largely unaffected; training age raises MEV).

**C1, C2, C3 all apply here.** No hard MRV ceiling and no inverted-U; volume is pushed
toward the recovery-cost optimum. Strength and hypertrophy curves are separate (this
engine owns the hypertrophy curve, which climbs to 10 to 25+ sets). The per-muscle
peak-frequency table is removed; frequency is derived.

### Recommended architecture

A decoupled volume allocator. Muscle groups are independent recovery nodes. Volume scales
toward the per-muscle recovery-cost optimum based on soreness clearance and next-session
performance, using effective reps as the stimulus currency. Frequency is computed, not
prescribed from a table.

### Mathematical model

Effective reps and weekly effective volume:

$$\text{Reps}_{eff,i} = \max(0, 5 - \text{RIR}_i), \quad V_{eff,m} = \sum_{i \in W} \text{Reps}_{eff,i} \cdot w_{e,m}$$

Weekly target scales toward the recovery-cost optimum (not clamped at a ceiling), modulated
by recovery state and nutrition:

$$V^{\text{hyp}}_{target,m} = \text{toward}\big(\text{MEV}_m,\ \text{MRV}^{\text{soft}}_{m,t}\big)
\cdot \frac{\text{HRV}_{smooth}}{\text{HRV}_{baseline}} \cdot (1 + \Phi_{nut})$$

Weekly step (diminishing-returns + recovery-cost, no ceiling that reverses gains):

$$V_{m,t} = \begin{cases}
V_{m,t-1} + 1 & \text{if soreness clears < 24h and } \Delta\text{e1RM}_m \ge 0 \text{ and marginal benefit} > \text{marginal cost} \\
V_{m,t-1} & \text{if soreness clears 24-48h or marginal benefit} \approx \text{marginal cost} \\
V_{m,t-1} - 2 & \text{if soreness clears > 48h (recovery cost exceeds benefit)}
\end{cases}$$

The down-step is a recovery-cost response (the cost side rose), not a "you passed MRV and
will now lose gains" response. The floor is MEV; there is no hard MRV cap, only the soft
optimum the step climbs toward.

### Engineering design

`HypertrophyVolumeService` manages per-muscle state. APIs: `GET /v1/hypertrophy/volume`,
`GET /v1/hypertrophy/muscle-status`. Table `hypertrophy_state`: `muscle_group` (PK),
`accumulated_effective_reps`, `current_mev_target`, `current_mrv_soft_target`,
`derived_frequency`, `last_updated`.

```python
def adjust_hypertrophy_volume(muscle, last_volume, soreness_clear_h, perf_delta,
                              marginal_benefit, marginal_cost):
    # No inverted-U, no hard ceiling: respond to recovery COST, not a "too much" cliff.
    if soreness_clear_h > 48.0 or marginal_cost > marginal_benefit:
        return max(last_volume - 2, mev_floor(muscle))      # cost rose; trim volume
    if soreness_clear_h < 24.0 and perf_delta >= 0.0 and marginal_benefit > marginal_cost:
        return last_volume + 1                              # benefit still exceeds cost
    return last_volume

def derive_frequency(weekly_volume, per_session_tolerable_sets):
    return math.ceil(weekly_volume / per_session_tolerable_sets)   # C3: derived, not a table
```

### Failure modes

- **Unrealistic soreness reporting:** require stable or improving performance (e1RM or
  velocity) over a 14-day window before increasing volume.
- **Inaccurate RIR on high-rep sets:** down-weight RIR confidence on sets above 15 reps
  and widen the confidence interval on the resulting parameter updates.

### Confidence assessment

Effective-reps theory: moderate evidence. Proximity-to-failure correlation with
hypertrophy: strong evidence. Per-muscle recovery variation: coaching consensus.
Localized concurrent endurance impact on lower-body recovery: strong evidence.

---

## 14. Resource Allocation Engine

### Research summary

Recovery capital is finite; an athlete training concurrently cannot maximize all domains
at once. Adaptations decay at different rates: aerobic capacity decays in 4 to 7 days
(needs a maintenance floor), maximal strength decays slowly over 2 to 3 weeks, hypertrophy
is most resilient (3 to 4 weeks). Hypertrophy volume is the most recovery-demanding and is
scaled first under high fatigue.

| Attribute | Detraining onset | Maintenance floor | Priority |
|---|---|---|---|
| Tactical run | 4-7 days | 1-2 runs/wk | High (protected) |
| Maximal strength | 14-21 days | 1 heavy SBD session/wk | High (protected) |
| Hypertrophy | 21-28 days | 1/3 of MAV | Moderate (scaled first) |

Within the owner's constraints, hypertrophy is the primary objective; the SBD volume that
drives it also harvests the strength requirement, so "scaled first" applies to accessory
hypertrophy volume above the SBD base, not to the SBD work itself.

### Recommended architecture

A recovery-capital knapsack / multi-objective optimizer. It quantifies recovery assets
(sleep, nutrition, autonomic state) and distributes them across strength, hypertrophy, and
running by priority. **C2: separate strength and hypertrophy volume curves feed separate
costs.** All adjustments are VOLUME adjustments; the allocator never cuts bar load.

### Mathematical model

$$\text{Maximize} \ U = U_h H_{adapt} + U_s S_{adapt} + U_r R_{adapt}
\quad \text{s.t.} \quad \sum_{\text{domain}} \text{Cost}_{sys} \le \text{Capacity}_{rec,t}$$

$$\text{Capacity}_{rec,t} = \text{Capacity}_{base} \cdot \frac{\text{HRV}_{smooth}}{\text{HRV}_{baseline}} \cdot S_{sleep,t}$$

Hypertrophy carries the dominant utility weight $U_h$ (primary objective); strength is
harvested from SBD at low marginal volume cost (fast-saturating curve), so it rarely
competes with hypertrophy for capital.

### Engineering design

`ResourceAllocationEngine` runs during schedule generation. APIs: `POST /v1/resource/allocate`,
`GET /v1/allocation/current-budget`. Tables `priority_allocations` / `priority budget`:
`domain` (PK), `utility_weight`, `allocated_volume`, `minimum_floor`.

```python
def allocate_recovery(recovery_index, goals_priority):
    a = {"hypertrophy": "MAV", "strength": "SBD_BASE", "running": "MAINTENANCE"}
    if recovery_index < 0.60:
        # Scale accessory hypertrophy VOLUME first; protect SBD (strength harvest) and aerobic floor.
        a["hypertrophy"] = "MEV_FLOOR"
        a["running"] = "CLAMPED_ZONE2"
        # SBD base volume held: it carries both the primary hypertrophy stimulus and strength.
    elif recovery_index > 1.10:
        a["hypertrophy"] = "TOWARD_SOFT_OPTIMUM"
        a["strength"] = "SBD_BASE"        # already near saturation; no extra strength block
        a["running"] = "PROGRESSIVE_VOLUME"
    return a
```

### Failure modes

- **Prioritizing running until hypertrophy detrains:** enforce a minimum-volume floor; no
  primary muscle stays below MEV for more than two consecutive weeks.
- **Resource contamination (unlogged running):** strength-engine performance drops reduce
  the recovery budget index and trim subsequent hypertrophy VOLUME (not load).

### Confidence assessment

Detraining decay timelines: strong evidence. Priority-based allocation in multi-sport
cycles: coaching consensus. Knapsack optimization for recovery distribution: engineering
assumption.

---

## 15. Model Orchestration

### Research summary

The core intelligence rejects single-model designs. It layers an EKF/DEKF for real-time
state, hierarchical Bayesian models (and a GP surrogate) for parameter learning, Safe-BOED
for experimentation, and RL + MCTS guarded by CP-SAT for sequence generation. The Banister
model is rejected as standalone (useful only as an initial prior source).

| Model class | Role |
|---|---|
| DEKF | Core daily state estimation (fitness, neural/structural fatigue) |
| Hierarchical Bayesian + GP | Athlete parameter learning (volume curves, recovery, VDOT), mesocycle-gated |
| Safe-BOED | Controlled experimentation |
| RL + MCTS | Macro sequence generation |
| CP-SAT | Hard-constraint safety guard (recovery windows, SBD spacing) |

### Recommended architecture

A hybrid multi-model orchestration layer. Daily biometrics flow through the DEKF; states
feed the Bayesian/GP learner; learned parameters (split by goal, mesocycle-gated, all wide
priors) feed the RL + MCTS planner; the CP-SAT guard enforces only hard constraints (no
volume ceiling, per C1). The unified state-parameter coupling lets transition parameters
adapt as the athlete's tolerance shifts.

### Mathematical model

$$\mathbf{x}_t = \mathbf{f}(\mathbf{x}_{t-1}, a_{t-1}, \boldsymbol{\theta}_t) + \boldsymbol{\eta}_t, \quad
\mathbf{y}_t = \mathbf{h}(\mathbf{x}_t) + \boldsymbol{\epsilon}_t, \quad
\boldsymbol{\theta}_t \sim P(\boldsymbol{\theta} \mid \mathcal{D}_{t-1})$$

where $\boldsymbol{\theta}_t$ are the learned individual posteriors (decay constants,
gains, goal-split volume curves).

### Engineering design

`ModelOrchestrationService` coordinates data flow: DEKF (latent state) -> Bayesian/GP
(parameters) -> RL+MCTS/CP-SAT (schedule). APIs: `POST /v1/orchestrator/run`,
`POST /v1/models/synchronize`. Table `unified_model_state`: `athlete_id` (PK),
`state_vector`, `parameter_posterior_means` (JSONB), `covariance_matrix`,
`last_calibrated`.

```python
def run_nightly_model_synchronization(athlete_id, raw_telemetry, logged_workouts):
    s = db.get_model_state(athlete_id)
    x_pred, P_pred = prediction_step(s.x, s.P, logged_workouts[-1])
    x_upd, P_upd = measurement_update(x_pred, P_pred, raw_telemetry)
    if mesocycle_boundary_reached():            # C8: heavy calibration on block boundaries
        params = run_mcmc_calibration(athlete_id, logged_workouts)  # goal-split, wide priors
        db.save_parameter_posteriors(athlete_id, params)
    db.save_model_state(athlete_id, x_upd, P_upd)
```

### Failure modes

- **Parameter divergence / corrupt telemetry:** hard validation bounds; if estimates
  deviate more than $\pm 40\%$ from baseline, isolate the calculation, hold recommendations
  at the last safe profile, and flag for audit.
- **Covariance blow-up:** monitor the trace of $\mathbf{P}_t$; on a critical-variance
  breach, reset covariance to baseline population priors.

### Confidence assessment

Kalman + Bayesian + GP integration: mathematical fact. Physiological application to
concurrent training: engineering assumption with moderate evidence.

---

## Supporting Architecture

These sections appeared in both originals and are retained for engineering completeness.
They are not among the 15 core engines but support them.

### Product Architecture

Event-driven microservices in Go (API gateway, relational engines, high-throughput
telemetry ingestion) and Python (PyMC, JAX, OR-Tools, model orchestration), deployed on
Kubernetes with gRPC inter-service communication. Stack: TimescaleDB (biometrics),
PostgreSQL with pgvector (relational + exercise semantic search), Redis (state cache),
Apache Kafka (telemetry streaming), MLflow (model registry/versioning), Dagster/Celery
(orchestration), Feast (feature store).

Latency target: $\mathcal{T}_{latency} = t_{gateway} + t_{ingest} + t_{kalman} + t_{cache} < 250$ms.
Queue dynamics modeled as M/M/1: $W_q = \lambda / (\mu(\mu - \lambda))$. Historical data
older than 28 days is rolled up and compressed.

Failure modes: out-of-order telemetry triggers schedule re-compilation bound to UTC date
indices; telemetry write spikes are absorbed by Kafka partition buffers and micro-batched
to the database to avoid deadlocks.

### UX/UI Architecture

A declarative, progressive-disclosure mobile interface. The primary dashboard shows a
single high-level readiness header plus a horizontal multi-dimensional status matrix
(no infinite vertical scroll); deeper metrics are disclosed via sliding drawer cards. A
command palette and voice action bar enable sub-3-second logging via on-device NLP
(lightweight transformer parsing natural language into structured set logs). Bottom-sheet
workout logging optimized for one-thumb use per Fitts's Law
($\text{MT} = a + b \log_2(1 + 2D/W)$, buttons $W \ge 60$px at $D \le 120$px).

Cognitive-load index $\mathcal{C} = N_{visible} \cdot \ln(1 + N_{clicks})$ is minimized by
disclosing 3 primary metrics instead of 30+. Front end: Swift/SwiftUI (iOS),
Kotlin/Compose (Android), WebSockets for real-time updates, predictive pre-population of
log targets. Fallback: on parse confidence below 80% (or a struggling user), open a
minimalist one-tap selector.

### Evolutionary Roadmap

- **V1 (foundation):** DEKF state tracking, deterministic CP-SAT scheduling guard,
  deterministic energy-balance nutrition (trend-weight TDEE), e1RM strength progression.
  Establishes a clean telemetry feedback loop and collects baseline data.
- **V2 (personalization, after ~90 days of consistent data):** Bayesian/GP recovery
  profiling replacing template MEV/MRV; Safe-BOED controlled experimentation (mesocycle-
  paced); NLP voice logging.
- **Long-term (orchestrated):** RL + MCTS macro-planner running simulations on the
  athlete's digital twin, fully coupled with state estimation and the constraint guard,
  to maximize long-term adaptation. The long-term system anticipates injury risk and
  manages reactive volume downregulation. It does not schedule deloads and does not
  program a peaking taper (the "program peaks years in advance" / taper language from the
  originals is removed per the owner's constraints).

Executive summary: build the hybrid multi-model architecture (DEKF state, Bayesian/GP
parameter learning, RL+MCTS sequence generation behind a CP-SAT hard-constraint guard),
not single-model or rule-based templates. Volume is bounded by the diminishing-returns +
recovery-cost model rather than a hard MRV ceiling; downregulation is reactive and
expressed as volume; the athlete's failure-based style is preserved and its fatigue cost
managed through volume autoregulation.
