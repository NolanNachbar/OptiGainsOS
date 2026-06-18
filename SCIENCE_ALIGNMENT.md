# Science.md Alignment Report

How OptiGainsOS's actual implementation maps to the engines specified in `Science.md`, and where the **frontend cannot close the gap alone** (engine/backend work). Page-fixable gaps were addressed in the UX/UI fix pass; this document is the report-only backlog.

> Framing: `Science.md` describes an idealized research backend (Go microservices, Kafka, OR-Tools CP-SAT, PyMC/JAX, GRPO RL, gRPC). This repo is React+Vite+Supabase + simplified Python in `scripts/engine/`. "Alignment" means the app faithfully surfaces each engine's *intended user-facing output* — not that it reimplements that infrastructure.

## Downregulation policy (binding: read before building any fatigue, deload, or auto-regulation surface)

The athlete trains hard and rejects scheduled/calendar deloads as a programming crutch. There is no competition or event, so **no peaking taper applies** anywhere in this app. Any surface that reduces prescribed work must follow the rules below. Build to this policy, not to a generic "readiness app" pattern that backs the user off on a single bad HRV reading.

1. **Train-as-prescribed is the default.** Downregulation is the earned exception, never the resting posture. A surface that nudges "take it easy" on weak or single-signal evidence is a defect, not a feature.
2. **Never auto-drop the bar load from a readiness/HRV signal.** Load is the strength/hypertrophy stimulus. When fatigue is genuinely confirmed the levers are volume (cut sets) and RIR (move one step from failure), holding intensity. A `DELOAD` command must mean "cut ~30-50% of volume and add ~1 RIR for 3-5 days at held load," never "lower the weight."
3. **Require converging, sustained evidence before any cut.** At least two independent signals (e1RM or rep-velocity decrement AND autonomic suppression: HRV down with RHR or all-day stress up), sustained 3-5 days. One signal or one day is noise. This matches `HYSTERESIS_DAYS = 3` and the existing gate in `strength_progression.process_strength_progression` (slope < -0.10 AND hrv_z_3d < -1.2).
4. **Thresholds are learned priors, not fixed law.** The hardcoded z-score limits (`HRV_Z_OVERREACH` etc. in `guardrail.py`) are population defaults the Athlete Learning Engine should refine toward this athlete's tolerance. If his data shows he progresses through a given dip, the engine learns to stop flagging it and converges to his recoverable ceiling. Do not surface a fixed textbook threshold as if it were truth.
5. **Keep exactly one mandatory reduction: the slow-tissue backstop.** If e1RM declines over *weeks* with sustained autonomic suppression, force a *volume* cut (never a load drop) as non-functional-overreaching / connective-tissue protection. This is the catch-the-fall rail the good programming is meant to never trigger, not a routine event. Frame it to the user as what lets him train hard without self-policing.

No scheduled deloads. No peaking taper. Any "deload" concept elsewhere in this doc (the `/train` and `/workout-detail` progression commands, the `DELOAD` daily-prescription label in Model Orchestration) must conform to rules 2-5.

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
