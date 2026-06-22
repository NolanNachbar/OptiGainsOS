# OptiGains Product Roadmap — 67 Findings Triaged

The whole audit clusters around one truth: **the engine is smarter than the UI lets the athlete see, and logging has too much friction.** Almost every high-value item is either (a) surfacing intelligence that already runs server-side, or (b) closing a recovery/readiness loop that's computed but never feeds prescription. Both directly serve trust + adherence + results.

---

## Build These First (Top 5, ranked by impact ÷ effort)

1. **Photo + voice/text food logging (analyze-meal edge fn)** — *impact 5, effort M.* The single biggest adherence lever. The whole adaptive-TDEE engine starves on incomplete logs; Cal AI's entire wedge is snap-to-macros. The vision pipeline (`analyze-physique`) is line-for-line reusable. Build once, get photo + text + voice from the same function. **This is the highest-ROI item in the entire audit.**

2. **Set-by-set autoregulation cue (RIR → next-set load)** — *impact 5, effort M.* The engine already computes load commands server-side; the lifter executing the set sees none of it. One inline chip ("RIR 1 — +2.5 lb next set") with one-tap apply turns silent intelligence into behavior change at the exact moment it matters. Core to the high-intensity philosophy.

3. **Recovery → session prescription loop** — *impact 5, effort M.* HRV/sleep/soreness are displayed but never feed prescription. `compute_athlete_state.py` already has HRV z-score, sleep debt, soreness logs. Wire a load-modifier into `training_prescription` + show the reason. This is the difference between a dashboard and a coach.

4. **Stall Monitor + 1-click deload** — *impact 5, effort M.* Plateaus are the #1 quit trigger. `athlete_state.strength[lift].stall_risk` already exists and is never surfaced. Show ETA-to-deload + one-tap volume-only deload (held load — philosophy-compliant). Turns the buried stall bit into a results-saving intervention.

5. **Weekly Coach Review (Sunday auto-gen)** — *impact 5, effort M.* This is where retention + trust live — the Friday-call equivalent. Pure aggregation of existing `athlete_state` + `recovery_metrics` + `workout_logs`. Ties adherence, recovery trajectory, strength deltas, and goal ETA into one narrative that makes the engine legible.

---

## Quick Wins (S effort, impact ≥ 3)

| Item | Spec | Leverages | Impact |
|---|---|---|---|
| **Pre-session readiness gate** | Optional inline energy slider + notes before "Start Logging"; advisory only, pipes into session notes for `notes_parser`. | MorningCheckin NumberPicker, session notes | 4 |
| **RIR auto-focus nudge** | Auto-focus RIR field on set-complete + gentle toast if skipped; feeds the autoregulation loop. | ExerciseCard RIR field, handleSetCompleted | 4 |
| **Recovery diagnosis line in brief** | Brief names the PRIMARY limiter ("5h sleep debt + ACWR 1.4") + one tip; descriptive, not prescriptive. | generate-daily-brief, athlete_state.recovery | 4 |
| **Personalization maturity card** | Per-muscle "personalized vs still calibrating" using `athlete_landmarks.mature`; tells user when the engine actually knows them. | athlete_landmarks, allocator confidence | 4 |
| **Body-comp trend narrative** | 7d rolling-avg weight line + ETA-to-goal + "strength maintained = sustainable cut" line. | body_weight_entries, diet_phases, athlete_state.nutrition | 4 |
| **Goal ETA dashboard** | Per active goal: current value, ETA days, confidence %, status bar. | athlete_goals, athlete_state.{endurance,strength}, vdot_zones | 4 |
| **Physique check-in reminder** | Phase-aware push (cut + early phase → 3x/wk) to log physique. | send-weekly-checkin-reminder pattern, athlete_state.nutrition.phase | 4 |
| **Lapsed-logging re-engagement** | Detect 3-day readiness gap → warm high-touch push (capped 2/wk). | daily_readiness, send-reminder-push | 4 |
| **RecoveryDetail "Connect Wearable" CTA** | Empty-state button actually launches the pairing modal + live refetch. | reusable `<WearableSetup>`, recovery hook | 4 |
| **PR detection toast + logbook** | Toast on set save when load/e1RM beats history; per-exercise history + e1RM sparkline. | WorkoutDetail history fetch, Epley helper, local notification | 4 |
| **Carb-cycle context in daily log** | Training/rest-day label + carb-cycle line + carb ring equal to protein/cal. | useDailyTargets (knows train-day), MacroGoalsEditor labels | 3 |
| **Inline plate calculator** | Contextual plate-calc bottom sheet when weight input focused, pre-filled. | CalculatorsModal logic, useProfile bar weight | 3 |
| **Swap preserves set progress** | `replaceExercise` carries forward completed set count instead of resetting to 1. | replaceExercise (useWorkoutExercises) | 3 |
| **Daily readiness quick-capture** | 3-slider readiness card on Today above prescription, persist on blur. | daily_readiness, useDailyReadiness | 3 |

---

## High-Impact Bets (impact 4–5, M/L effort)

| Item | Spec | Leverages | Effort | Risk |
|---|---|---|---|---|
| **Real-time macro-filler** | After each log, compute remaining macros + suggest 3–5 high-impact foods that close the gap (phase-aware). | useDailyTargets, custom_foods, MealPlanIdeas pool | M | low |
| **Soreness → volume routing** | Daily prescriber reads `soreness_logs`; high-soreness muscle → swap to lower-eccentric variant or lighter RIR, shows reason. | soreness_logs, muscle_map substitution, training_prescription | M | low |
| **Exercise reorder mid-session** | Drag-to-reorder ExerciseCards (@dnd-kit), log swaps to notes for engine learning. | @dnd-kit (ProgramBuilder), useWorkoutExercises, notes_parser | M | low |
| **Post-workout fuel push + quick-meal picker** | Garmin strength-completion → push → meal_templates filtered post-workout, ranked by remaining macros, 1-tap log. | garmin-sync, send-reminder-push, MealTemplates apply-dialog | M | low |
| **Weekly plan rationale + deviation bar** | Surface allocator `rationale` + planned-vs-logged volume ("logged 94%, chest −2 sore Tue") on WeeklySchedule. | weekly_plans.rationale, deviation_tracker, workout_logs | M | low |
| **"Why this load" progression explainer** | Tap exercise → 1-line: daily-min, RIR avg, increment reasoning, sets progress. | enrollment.progression_state, strength_progression.py | M | low |
| **Stall-vs-plateau diagnostic** | On 2+ wk stall: RIR/soreness pattern → "strength ceiling vs underrecovery" + specific reset suggestion; consumes failure_reason. | failure_reason in workout_logs, notes_parser, stall_suggestion | M | 5/low |
| **Exercise-reaction feedback into brief** | Brief reads 7d `exercise_reactions`, flags high-severity patterns, suggests review/sub. Make reaction log mandatory post-note. | exercise_reactions, exercise_preferences, brief fn | S→M | low-med (pattern, not single event) |
| **Overreach escalation gate** | On multi-metric overreach: `override_lock` → "Recovery Mode" light session, athlete can override (audited). | overreach_signal, training_prescription, audit table | M | **higher** — frame as "protecting progress," never medical; keep override + audit trail |
| **In-set autoregulation cue + technique panel** | One-line engine cue in ExerciseCard ("trending up — +2.5 lb") + tap-to-expand exerciseLibrary cues + prior e1RM delta. | strength_progression command, exerciseLibrary.js, notes_parser | M | low |
| **Expenditure dashboard + weekly "what changed"** | TDEE trend line + intake overlay + "expenditure rose 90 kcal, targets adjusted" narrative; surface diet-break/reverse triggers. | tdee.py (in athlete_state), nutrition_modulator, phase_recommender | M | low |
| **Streak tracking + celebration** | Streaks for readiness/weigh-in/physique/workout + celebration modal + 24h re-engagement. | push suite, daily_readiness/physique/weight tables | M | low |
| **Missed-session re-engagement** | 22:00 no-log-exists → push with "log it" / "skip (engine adjusts)" deep links; skip is first-class. | training_prescription, workout_logs, send-reminder-push | M | low |
| **PR/milestone celebration** | Detect lift PR / weight milestone → dismissable banner + push + permanent Insights card. | athlete_state, workout_logs, exercise_reactions | M | low |
| **First-run wearable pairing** | 3-step post-signup OAuth/HealthKit flow + initial sync + dashboard status card. | garmin-sync, health-webhook, recovery_metrics | M | low |
| **Scheduled daily health re-sync** | pg_cron daily Garmin pull + "last synced" timestamp so recovery data stays fresh. | pg_cron, garmin-sync, health-webhook | M | low |
| **Onboarding boost (week 1–2)** | Phase-gate push cadence for new users + tip-of-day first 7d; cement habit. | user_profiles.onboarding_phase, send-* fns | M | low |

---

## v2 / Wow (bigger swings, do after the core loops land)

| Item | Why it's later | Effort | Impact |
|---|---|---|---|
| **Adaptive Engine Control Panel** | The full "why this session" dashboard (budget decomposition, candidate scoring). High wow, but the per-card explainers above deliver 80% of the trust at lower cost — build those first, aggregate later. | L | 4 |
| **Ask-your-coach chat** | On-demand conversational coach. Real value but **hallucination risk vs the daily brief** — must cite data + disclaim. Land the deterministic surfaces first so chat has ground truth to reference. | M | 4 |
| **Recovery-budget "strain target" card** | Whoop-style recovery → recommended volume/RIR band → achieved-vs-band. Strong, but overlaps heavily with #3 + Stall Monitor; ship as a visualization layer once those land. Must stay volume/RIR band, never bar-load cuts. | M | 3–4 |
| **Restaurant menu integration (Nutritionix)** | Real eating-out gap, but net-new external API + auth/rate-limit + ±15% data variance. Photo/text logging covers most restaurant cases first — revisit if logging-completeness data shows a restaurant hole. | L | 4 |
| **Copy-previous-day food log** | Genuine travel-friction win but lower impact (2); photo/text logging blunts the need. Cheap enough to bundle later. | S | 2 |
| **Offline write queue** | Table-stakes reliability for basement gyms, but **medium implementation risk** (sync conflicts) and the current path mostly works. Scope to set-save + food-insert only when you tackle it. | L | 3 |
| **Controlled-test scheduler visibility** | Consent/transparency for MRV tests is right, but the test system itself is nascent — surface it once tests actually run regularly. | M | 3 |
| **Exercise-value feedback (upvote/downvote)** | Showing learned per-exercise value is cool and builds the mental model, but it's inward-facing; lower adherence ROI than the loops above. | M | 3 |
| **Wind-down / sleep-hygiene protocol** | New `evening_readiness` table + behavioral protocol. Good results lever but heaviest new surface; do after recovery loop proves out. | M | 3 |

---

## Skip / Not Worth It

- **Recipe ingredient-level scaling** *(impact 2)* — niche meal-prep power-user feature; photo/text logging + recipe scaling-by-servings already covers the common case. Vanity complexity.
- **Nutritional baseline capture on onboarding** *(impact 2)* — restrictions are weak signal; adds onboarding friction (the thing we're fighting). Capture diet type passively if at all.
- **Physique baseline guided 6-shot** *(impact 2)* — pure UX wrapper; nice but not results/adherence-moving. Fold into onboarding polish later, not a standalone bet.
- **Coaching intake form (training age/injury/prior programs)** *(impact 2)* — engine recalibrates from deviation within ~2 weeks anyway; cold-start prior is marginal vs the onboarding-friction cost. A few fields in Profile suffice.
- **Auto-sync body weight from wearable** *(impact 3 but)* — most users don't own a smart scale; manual weigh-in is already low-friction and the Weekly Ritual covers cadence. Low reach. Fold into health-sync if free.

---

## Merges Applied (dedup notes)

- **Photo logging** (#benchmark) + **voice/text estimation** (#nutrition) + **NL food logging** (#benchmark) → one `analyze-meal` function (photo/text/voice modes).
- **Set-by-set autoregulation** (#logging) + **in-set autoregulation cue + technique** (#benchmark) → one in-set cue feature.
- **RIR enforcement nudge** (#logging) kept separate (it's the S-effort enabler for the above).
- **Sleep+HRV → load** + **recovery_budget_adjustment** + **recovery-linked brief adjustment** (3 near-identical recovery→prescription findings) → one **Recovery → prescription loop**.
- **Recovery budget band visibility** + **Whoop strain-target card** → one v2 visualization layer.
- **Stall Monitor** (#insights) + **stall-vs-plateau diagnostic** (#programming) → kept as two (Monitor = surfacing+action; diagnostic = the reasoning); both feed the same card.
- **Weekly Coach Review** + **weekly progress summary push** + **weekly ritual** → one Weekly Review surface with a pre-plan summary push.
- **Three onboarding wearable findings** (first-run pairing, RecoveryDetail CTA, scheduled re-sync) → kept distinct (different surfaces) but share one `<WearableSetup>` component.
- **Intra-day deviation alerts** folded into **real-time macro-filler** (same logic, push-triggered).
- **Adherence tracking** + **accountability** folded into **Weekly Coach Review** scorecard.