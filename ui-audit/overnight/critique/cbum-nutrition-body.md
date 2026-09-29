# CBum review: nutrition, body, recovery, and everything that isn't the logger

Scope: /fuel (log, goals, week plan), /fuel?tab=body (Metabolism, Weight, Measurements, Photos), hydration/supplements, /physique, /recovery, /today, /coach, /mind, /athlete-state, /insights, /career. Training logger/programs are out of scope (another reviewer).

Method: code read (src, scripts/engine, supabase/functions, ADAPTIVE_ENGINE_DESIGN.md, AUDIT_2026-07-30.md, KNOWN_NON_ISSUES.md, areas/body + areas/fuel findings) plus a read-only walk of every screen as the test athlete via drive.mjs on 2026-09-28. No writes.

**Fixture caveat.** The test account is a frozen late-June snapshot, and the engine never writes to it. The screen numbers below (1800 kcal / 61 g carbs, "0 lift · 7 rest", HRV 64 on Sep 28) illustrate code paths. They are not claims about what Nolan sees on his real account. Each finding names the code path that produces it.

---

## 1. The critique (in his voice)

Look, the engine under the hood is legit. EWMA trend weight, adaptive TDEE with Forbes density, protein floors, a 4-6 week cut cap. Somebody read the right stuff. But I open the app and I can't *see* any of it. The first thing on the Body tab is today's raw scale weight in 34-point font, and I'm supposed to feel good or bad about that? That's water and sodium, bro. Show me the trend and the rate.

There are three different calorie numbers depending on which screen I'm on. The engine says one thing and the goals card says another. The "phase target" comes from a formula that literally can't switch to my real data. If I can't trust the number, I'm not hitting it.

I train every day, and the week plan tells me I've got seven rest days and 40 g of carbs. That's not carb cycling, that's a punishment. Leg day and arm day need different fuel. That should be the easiest thing in the world to program.

My physique photos average a front double bi and a relaxed back into one body-fat number. One session reads anywhere from 10% to 18%. Then that number helps decide when my cut ends. Nah. Relaxed poses, same light, same time, ghost overlay, and put my morning trend weight next to every photo.

And the big one. You told me the point is to find what works for *my* body and lock it in. Where's the experiment? I can run a volume test on training, but I can't run "300 more carbs on training days for three weeks" and see what happened to my weight, my lifts, my pump, and my waist. No before/after, no verdict. That's the whole game in the offseason. Without it you're just logging.

Oh, and why is a job-application tracker in my bottom nav?

---

## 2. Ranked improvements

Ranked by how much each one moves "find what works for me, then lock in" for a daily-training athlete, not by bug severity.

### 1. Nutrition blocks as experiments, with attribution against weight, strength and physique (L)
- **What's wrong now:** `controlled_tests` exists only for training variables (ADAPTIVE_ENGINE_DESIGN.md §6: recovery stress, volume tolerance, running, PST). Nutrition is never an experimental variable.
  - The only intake history view is a **7-day** calorie line (`FoodTracker.jsx:553-572`, "7-Day Trend" at `:2378`). Its goal line is recomputed from the client formula TDEE, not the target the engine actually set that day.
  - No screen overlays diet phases or intake blocks against trend weight, e1RM, waist, and photos.
  - `diet_phases` history exists (it's used for that goal line) but is never shown as a timeline.
- **Why it matters:** Without paired before/after readouts, "what works for me" is a feeling. Offseason progress lives in multi-week intake decisions: carb level, surplus size, meal timing. Those need 3-4 week windows to read, and you can't eyeball them from a 7-day chart.
- **Concrete change:** Add a `nutrition_experiment` type to `controlled_tests`, e.g. "training-day carbs +75 g for 21 days, calories otherwise held" or "surplus 250 vs 400 kcal".
  - The engine honors it through `nutrition_modulator.py`.
  - The scheduler refuses to overlap it with a training stress test. The design doc already says "never overlap a stress test with a cut".
  - At the end, write a verdict card: Δ trend-weight rate, Δ e1RM slope on 3 anchor lifts, Δ waist, pump/energy check-in average, adherence %, and a before/after photo pair from the same relaxed pose.
  - Add a long-horizon **Block timeline** on Body → Metabolism: phase bands shaded behind trend weight, with e1RM and waist lines on a shared date axis.
- **Serves find-what-works:** This *is* the loop. Run one variable, read the paired outcome, keep the winner as the new default, then test the next one. It pairs directly with the training-side controlled tests: a volume ramp during a matched carb block tells you whether the extra food is what let the extra volume stick.

### 2. One calorie truth: kill the formula and profile targets that contradict the engine (M)
- **What's wrong now:** Three competing numbers.
  1. The rings use `useDailyTargets` (engine `athlete_state.nutrition` → manual override → profile → defaults).
  2. The Nutrition Goals card's hero is `profile.daily_calorie_goal` (`FoodTracker.jsx:4023`).
  3. "Phase target" is `calculatePhaseCalories(tdee.tdee, …)` from the client `getBestTDEE` (`FoodTracker.jsx:551`, `:3997-4001`).
  - The client adaptive path **can never activate**. `calculateAdaptiveTDEE` defaults to a 14-day window (`coachingUtils.js:279-296`), so `daySpan` is ≤14. "medium" confidence needs ≥21 days (`:318-319`), and `getBestTDEE` only uses adaptive at medium/high (`:355`). So the phase target is always Mifflin plus an activity factor.
  - The "Sync goals" button then writes that formula number with `calculateMacroSplit`, which splits the remainder **50/50 carbs/fat by calories** (`coachingUtils.js:365-377`, invoked at `FoodTracker.jsx:4043-4046`). That's far too much fat for a physique athlete and contradicts the engine's fat-floor-and-carbs-absorb-the-rest model.
  - Body → Metabolism's "Expenditure Engine" card shows 7-day *intake* and never shows the engine's maintenance estimate (`Progress.jsx:374-455`). AUDIT_2026-07-30 P4 already noted `maintenance_kcal` is "never read by that page". Its footer claims it shows "your actual metabolic rate".
  - The engine's no-profile fallback is a hardcoded 1800 kcal / 200 g (`compute_athlete_state.py:737-738`).
- **Why it matters:** An athlete hits a number he trusts. When the screens disagree he picks the one he likes, and the adaptive system stops working.
- **Concrete change:**
  - Make the goals card read `useDailyTargets` and show the engine's maintenance, target, and delta ("Maintenance 2,950 · target 2,450 · −500").
  - Delete the client `getBestTDEE` path from FoodTracker, or at minimum fix the window (pass `days=28`).
  - Remove "Sync goals" 50/50, or route it through the same protein-anchored, fat-floor split the engine uses.
  - Show maintenance on the Metabolism card, with a 4-week sparkline of the estimate.
- **Serves find-what-works:** Experiments need a stable, trusted baseline. You can't attribute a result to "+200 kcal" if the app can't agree on what the starting number was.

### 3. Trend weight and rate are the hero, not today's scale reading (S)
- **What's wrong now:** The Weight tab hero is "Current" = the latest raw entry (`WeightProgressChart.jsx:33,58-63`). Trend is demoted to a small tile.
  - "Change" is the raw last reading minus the raw first reading (`:35`). On screen: Current 184, Trend 189.2, Change −6.0, a 5-lb disagreement.
  - The history list shows raw day-to-day deltas (−5.4, +1.0). There is **no rate** as lb/wk or %BW/wk, and no comparison to the phase's target rate.
  - The UI trend and the engine trend are different algorithms. The client EWMA normalizes alpha by days elapsed (`coachingUtils.js:18-21`), but Python `ewma_trend` steps once per entry regardless of gaps (`scripts/engine/tdee.py:67-78`). So the trend on the Body tab is not the trend driving TDEE.
  - Duplicate same-day rows are possible from simultaneous weigh-in submits (areas/body findings). Each duplicate counts as a full day step in the client EWMA (`Math.max(1, …)` at `coachingUtils.js:19`).
- **Why it matters:** Raw scale weight is mostly water, glycogen and sodium. Leading with it produces emotional decisions, like "I'm up 2 lb, cut carbs", that wreck a well-running phase.
- **Concrete change:**
  - Hero = trend weight plus "−0.62%/wk (target −0.5 to −1.0)", colored by in or out of band.
  - Change = trend-to-trend over a selectable window (2, 4, or 8 weeks).
  - Collapse same-day entries to one per day (first morning reading) before smoothing, in both client and engine.
  - Make Python `ewma_trend` gap-aware with the same formula as the client, and use that one series everywhere.
- **Serves find-what-works:** The trend rate is the primary outcome metric for every nutrition experiment. It must be de-noised, identical everywhere, and read against a target band.

### 4. Adherence and on-track metrics that can't lie (S)
- **What's wrong now:** `calorie_adherence = round(min(avg_cal / calorie_target, 1.0), 2)` (`compute_athlete_state.py:772`). Eating 3,000 on a 2,000 target scores **100%**, and AthleteState shows it as adherence.
  - `on_track` is one-sided: cut = trend < −0.5 lb/wk (`:815`), bulk = trend > 0.2 (`:817`). Losing 3 lb/wk (muscle loss) or gaining 2 lb/wk (fat gain) both read "on track".
  - Thresholds are absolute lb, not %BW.
- **Why it matters:** An over-fast bulk is exactly how offseason turns into fat gain, and an over-fast cut is how you flatten out and lose muscle. A green badge on either is a coaching failure.
- **Concrete change:**
  - Adherence = `1 − |avg − target| / target`, plus show the signed miss ("+340 kcal/day over").
  - `on_track` = inside a band: bulk +0.25 to +0.5 %BW/wk, lean-bulk ceiling configurable; cut −0.5 to −1.0 %BW/wk.
  - Surface "too fast" as a warn state in `NutritionSection` (`AthleteState.jsx:652-667`) and on Today's Fuel card.
- **Serves find-what-works:** You can only compare experiments if "did I actually do it" (adherence) and "did it land in range" (rate band) are honest. Otherwise a failed block reads as a successful one.

### 5. Stop letting AI photo body-fat drive phase decisions (M)
- **What's wrong now:** The headline BF is the average of every shot that day across all poses (`PhysiqueTracker.jsx:269-296`). Flexed and relaxed shots read very differently. The test session on Jun 15 has per-shot estimates of 10, 18, 18, 10, 10, 15% averaged to "13.5%, −0.5%".
  - That session EWMA feeds `recommend_phase`'s bodyfat hysteresis and the Forbes density (`compute_athlete_state.py:1447-1485, 1726-1745`). So a morning with mostly flexed shots can read "leaner", end a cut, or flip to bulk.
  - The Measurements tab already collects `waist_cm` (`Progress.jsx:171`) but nothing in the engine uses it.
  - Also in areas/body findings: the analyze-physique call currently fails CORS, and there's no in-app delete for a bad photo entry.
- **Why it matters:** An 8-point spread within one session is noise, not signal. Phase decisions (end cut, start bulk) are the highest-stakes calls in the whole year.
- **Concrete change:**
  - Compute BF only from the relaxed poses (front-relaxed, side-relaxed, back-relaxed), each pose trended against itself.
  - Show BF as a range with "low confidence", never a delta to one decimal.
  - Make waist at the navel (trended) plus trend weight the primary phase-gate inputs, with photo BF as a tiebreaker.
  - Add a photo delete action.
- **Serves find-what-works:** Body-composition outcome is the second read on every experiment, after weight rate. It has to come from comparable measurements or it will "confirm" whatever block happened to have flexed photos.

### 6. Carb cycling that knows he trains every day (M)
- **What's wrong now:** `isTrainingDay` comes only from the active program schedule (`useDayPlanContext.js:82-90`). It's binary lift/rest.
  - Any week the schedule doesn't cover (program ended, freestyle or quick workouts) resolves to rest days. The test account's week plan reads "0 lift · 7 rest", 1,855 kcal every day, "carb cycle 40–40g".
  - There's no training-demand tier (legs/back vs arms/shoulders), no refeed day. `refeed` appears nowhere in `src/` or `scripts/engine`. The diet break only fires at the 6-week cap (`nutrition_modulator.py:232`).
- **Why it matters:** A high-volume leg day on rest-day carbs means a flat session and a missed stimulus. Uniform low carbs across a daily-training week is also the fastest way to feel like garbage on a cut.
- **Concrete change:**
  - Fall back to logged and Garmin training history, e.g. "trained ≥5 of the last 7 days → treat every day as training".
  - Add demand tiers from the day's planned volume or muscle groups: high (legs/back), medium, low (arms, cardio).
  - Add an optional scheduled refeed (1 day per 7-14 on a cut, at maintenance with the extra from carbs), shown on the week strip.
- **Serves find-what-works:** "Where do my carbs go" is one of the most responsive variables for a natural athlete. Tiers and refeeds become testable arms in item 1's experiments.

### 7. Stale engine state shown as today (S)
- **What's wrong now:** `useAthleteState` takes the latest `athlete_state` row of any age (`useEngineQueries.js:94-107`). Today shows readiness 68, HRV 64, RHR 45, Sleep 75 with no "as of" date (`Today.jsx:244, 369, 637-700`).
  - On the fixture this is an 89-day-old row. Meanwhile /recovery shows readiness "— Unknown" from its own source, and /athlete-state does label "As of 2026-07-01".
  - The Today Fuel card shows "7d" averages that are also from that row.
- **Why it matters:** If the cron or Garmin sync silently stops, he keeps training and eating off yesterday's (or last quarter's) readiness and targets without knowing.
- **Concrete change:** Show a single "as of" chip whenever `state.date !== today`, and go warn at ≥2 days. Make /recovery and Today read the same source.
- **Serves find-what-works:** Experiments are only valid if the inputs were current. A silent stale engine invalidates the block.

### 8. Photos that are actually comparable (M)
- **What's wrong now:** The capture screen gives a text cue ("Same lighting and distance each time", `PhysiqueTracker.jsx:339,379`) and a self-timer (`TimedCameraCapture.jsx`), but no ghost overlay of last time's photo.
  - Compare is manual: pick any 2 tiles, and cross-pose pairs are allowed with the delta merely hidden (`:730-790`).
  - The compare sheet shows no trend weight, no time of day, and no fasted flag.
  - Poses lack the ones a classic athlete tracks: front and rear lat spread, side triceps, vacuum.
- **Why it matters:** Lighting and pose drift make or break week-to-week reads. The mirror lies; consistent photos don't.
- **Concrete change:**
  - Add a semi-transparent ghost of the last same-pose shot in the camera.
  - Auto-pair "this pose, today vs N weeks ago" in a swipe or slider view.
  - Stamp each photo with trend weight, time, and fasted yes/no.
  - Nudge a fixed weekly slot, e.g. same weekday, fasted, after bathroom.
  - Add the optional classic poses.
- **Serves find-what-works:** Photos are the visual outcome of every block. Auto-paired same-pose shots at block start and end are what the experiment verdict card (item 1) needs.

### 9. Meal structure fixed at 4, disconnected from the carb windows (S/M)
- **What's wrong now:** Meals are hardcoded to breakfast, lunch, dinner, and snack (`constants.js:10`, `validation.js:104`, `WeeklyPlanCard.jsx:24`, `MealPlanIdeas.jsx:12`).
  - The engine already emits pre/post-workout carb windows (`useDailyTargets.js` `scaleCarbWindows`, shown as "Carb Timing" in `WeeklyPlanCard.jsx:334-360`), but no meal slot maps to them.
- **Why it matters:** Physique athletes eat 5-6 meals built around the session. Logging "meal 4" as "snack" means he re-types or mis-slots every day, and peri-workout timing can't be checked.
- **Concrete change:**
  - Configurable meal count and names (Meal 1-6), with an optional "pre" / "post" tag linked to the carb windows.
  - One-tap "log Meal 2 as usual", reusing templates per slot.
- **Serves find-what-works:** Makes meal timing and peri-workout carbs loggable and therefore testable. It also cuts daily friction so adherence stays high enough to read results.

### 10. Sodium and water: the missing explanation for scale noise (S)
- **What's wrong now:** No sodium target or tracking anywhere in the food log. Fiber is tracked; `FoodTracker.jsx` has no sodium field.
  - The water goal is a static 35 ml/kg (`Supplements.jsx:29`, shows "0 / 2900 ml"). It doesn't adjust for training, sweat, or the day's carbs.
  - Supplements allow repeated "Log Again" with no same-day duplicate hint. The fixture shows creatine logged twice, 4 minutes apart.
- **Why it matters:** Big sodium and water swings are why the scale jumps 3 lb overnight. For a classic athlete, sodium and water also govern fullness and look.
- **Concrete change:**
  - Capture sodium from USDA and labels (already in the source data), with a soft daily target.
  - Annotate trend-weight spikes with "high-sodium day" or "high-carb day".
  - Water goal = base + training-day add-on.
  - Supplements: "already taken today at 12:32, log again?"
- **Serves find-what-works:** Separates water noise from tissue change. Without it, a carb experiment's first-week scale jump gets misread as fat.

### 11. Coach form review is powerlifting-only; no hypertrophy lifts, no posing (M)
- **What's wrong now:** /coach copy and the prompt target squat, deadlift, and bench only (`Coach.jsx:127,187`).
  - Nothing covers RDLs, rows, pulldowns, lateral raises, or presses, where ROM, stretch, and tempo matter for growth.
  - Nothing for posing practice, which is its own skill for anyone who ever steps on stage or just wants honest photos.
  - A review isn't linked to the logged set or exercise it came from.
- **Why it matters:** Growth comes from execution quality on hypertrophy movements. The app judges the three lifts least tied to physique.
- **Concrete change:**
  - Add a hypertrophy rubric (ROM and stretch position, tempo/control, target-muscle bias, momentum) for any exercise in the library.
  - Attach the review to a workout-log exercise so repeat reviews trend.
  - Add an optional "posing" mode that compares against the athlete's own best shot.
- **Serves find-what-works:** When a training experiment "fails", execution drift is a confound. Linked reviews let you rule it out.

### 12. Signal vs noise in the daily path: Mind and Career (S)
- **What's wrong now:** /career is a job-application pipeline, and /mind is a learning log (four identical "Learned about MCP protocols" entries on the fixture).
  - Both sit in the same nav and Analyze surfaces as physique tools.
  - /insights is only the daily brief ("No brief for today yet"), with Mind as its explore link.
- **Why it matters:** Every extra surface in the morning loop is friction and attention taken from weigh-in, food, and training.
- **Concrete change:** Keep them, but move them out of the training and physique navigation into a separate "Life" or profile area. Make Analyze the home for the Block timeline and experiment verdicts from item 1.
- **Serves find-what-works:** The Analyze tab becomes the place where "what worked" lives, instead of a brief plus a reading log.

---

### Quick wins (S) to do first
Items 3, 4, 7, and 10's water and supplement bits, plus the `calculateAdaptiveTDEE` window fix from item 2. These are each a few lines and immediately make the numbers he sees trustworthy.
