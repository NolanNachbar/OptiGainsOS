# OptiGains nutrition and food-logging inventory (code-verified)

Scope: source-only read of `/Users/nolan/projects/OptiGainsOS` on 2026-10-13. No live DB queries were run, so schema claims come from migrations and live-behavior claims are marked as unverified. Per CLAUDE.md, `KNOWN_NON_ISSUES.md` has no food-related entries, so nothing here is a closed finding. Prior audits were used only as leads. Existing `EDGE_CASE_AND_COMPETITOR_AUDIT_2026-10-12.md` claims are checked in section 13.

Abbreviations: FT = `src/pages/FoodTracker.jsx`, NU = `src/utils/nutritionUtils.js`, CAS = `scripts/compute_athlete_state.py`, NM = `scripts/engine/nutrition_modulator.py`.

---

## 1. Entry methods

| Method | Status | Where (file:line) | Notes |
|---|---|---|---|
| USDA search | Yes | `src/api/usda.js:77-87`; `supabase/functions/usda-proxy/index.ts:73-105`; FT:392-461 | Generic (Foundation + SR Legacy) and Branded lists, 10 results each, no paging. 300 ms debounce. Three-tier fuzzy fallback (strict AND, then any-word, then longest-word retry) at FT:410-450. Auth required. 200 requests/user/hour cap at usda-proxy:42-57. Each search can cost 2-4 proxy calls. |
| Open Food Facts barcode | Yes | `src/components/nutrition/BarcodeScanner.jsx:70-94`; `src/api/openFoodFacts.js:13-66` | ZXing in-browser decoder. OFF is tried first, then USDA Branded GTIN lookup (`usda.js:93-100`). OFF mapping has no fiber field (openFoodFacts.js:32-43). |
| "Describe it" AI estimate | Yes | FT:910-944 (`estimateFood`), FT:2853-2885 (UI); `supabase/functions/estimate-food-macros/index.ts` | Text to Groq `llama-3.3-70b-versatile` (overridable via `GROQ_MODEL`, index.ts:16). Returns `food_name, serving_description, serving_grams, calories, protein, carbs, fats, confidence, assumptions` (index.ts:83-93). Prefills the manual form, which stays editable (FT:923-937). Confidence appears only in a transient toast (FT:938). `assumptions` is returned but never displayed. `serving_description` shows as the hint under the amount (FT:934). No fiber requested, so fiber is always null. Input capped at 200 chars (index.ts:46). |
| Photo: whole meal | Yes | FT:955-985; `supabase/functions/estimate-meal/index.ts` | Vision model `llama-4-scout-17b-16e-instruct` (index.ts:17). Returns an item list (max 15). Entry point is "Log a whole meal" at FT:2604-2617. Dialog at FT:3322-3447. |
| Photo: nutrition label | Yes | FT:1031-1078; `supabase/functions/read-nutrition-label/index.ts` | Barcode-miss fallback (BarcodeScanner `onScanLabel`, FT:4065-4069). Prefills a single food. Confidence in toast only (FT:1072). `note` is dropped. |
| Voice logging | **Not found** | `grep -rn -i -E "speechrecognition\|webkitSpeech\|voice\|dictat" src` returns only UI-copy and CSS hits. | No speech-input code. |
| Quick-add raw calories (no name) | **Not found** | Submit is disabled without `food_name`: FT:3296 (`disabled={!newFood.food_name \|\| ...}`). | Closest equivalents: the Recent one-tap re-log (FT:1195-1214) and whole-meal estimate. |
| Manual custom food | Yes | FT:2892-3258 (manual section); FT:3265-3317 (submit footer); `custom_foods` table | Name, meal, amount/unit, macros, fiber (blank = unknown), serving weight, named portions (FT:3017-3079), favorites (`FavoriteToggle` FT:134-144). Macro-kcal mismatch warning for manual entries only (FT:610-619, 3241-3256). |
| CSV import of My Foods | Yes | FT:751-793; format guide FT:2810-2816 | Naive `split(",")`, so quoted names with commas break. Requires `food_name` and `calories` columns. Forces `serving_size: 1` and ignores serving grams. Each row runs a full `CustomFood.filter` (FT:657) before write, which is O(n²) round trips. |
| Planned meal-plan rows | Yes | WeeklyPlanCard.jsx:432-456 (approve); FT:1243-1252 (check off) | See section 3. |

---

## 2. Speed features

| Feature | Status | Where | Notes |
|---|---|---|---|
| Recent rail (one-tap re-log) | Yes | FT:1829-1847 (rail), FT:1195-1214 (`quickRelogFood`), FT:2763-2798 (dialog list) | Source is `getRecentFoods(allFoodEntries, 8)` (NU:32-57), sorted by `created_at`, deduped by name. **Includes `planned=true` rows** (no filter). Re-log copies the original entry's `meal_type` (FT:1204), not the current time. |
| Recent list in dialog | Yes | FT:2763-2798 | Taps select into the form. The "+" button re-logs. |
| Copy a day | Yes | FT:1583-1617 (mutation), FT:2088-2105 (button), FT:3928-4010 (dialog) | Checkbox selection. Default source is the latest logged date before the selected day (FT:2088-2095). **No `planned` filter**, so unchecked plan rows are copied as eaten (new rows default `planned=false`). **No warning** when the target day already has entries. Source limited to the 90-day window (`useAllFoodEntries`, `src/hooks/useUserQueries.js:188-209`). |
| Copy a single meal | **Not found** | `grep -rn -i "copy ?meal\|copyMeal" src` returns nothing. | Only via checkbox subset in Copy-a-day. |
| Saved meal templates | Yes | `src/components/nutrition/MealTemplates.jsx:343-377` (apply), `:769-839` (save); FT:2260-2269 (per-meal save), FT:2375-2385 (save day) | Apply writes `date` defaulting to device-local today (MT:345). **No `eaten_at`**, so no time badge. No duplicate guard. |
| Template item units are lost | **Bug** | Save: MT:821-829 (writes `serving_size` only, omits `serving_unit` and `serving_grams`). Apply: MT:349-360 (`parseFloat(String(item.serving_size).split(" "))`, unit fallback `"serving"`). | DB stores `serving_size` as numeric and `serving_unit` separately (migration `00000000000000_remote_schema.sql:410-428`). A 300 g template item therefore applies as "300 serving". Macros stay correct because they are stored totals. The "Ideas" path (MealPlanIdeas) stores `"300 g"` strings, which do round-trip. |
| Recipes | Yes | `src/components/nutrition/RecipeBuilder.jsx` (1516 lines); log dialog 1374-1460; `nutritionUtils.js:345-358` | Builder servings are integer +/- 1 (RB:1129-1146). Per-serving macro bar (RB:436-441). Log dialog takes 0.5-step servings (RB:1436-1459). Logged as name `"<recipe> (Recipe)"`, unit `serving(s)`, no `serving_grams`, no `eaten_at` (NU:345-358). |
| Recipe "Share" | **Non-functional** | RB:74 (`sharingRecipe` declared), RB:251 and RB:365-368 (`setSharingRecipe`) | `sharingRecipe` is never read. Clicking Share sets state and does nothing. |
| Ideas (meal recombination) | Yes | `src/components/nutrition/MealPlanIdeas.jsx`; FT:2571-2578 (sidebar), FT:3593 (More sheet) | Recombines the athlete's own past meals (`buildMealPool` :29-77, `generatePlan` :112). Slot allocation `MEAL_ALLOC = {25/35/30/10}` (:8) is unsourced. Output goes through SaveAsTemplateDialog, not directly into the log. |
| Meal auto-assignment by time | Yes, device clock | FT:57-63 (`getDefaultMealType`: <10 breakfast, <14 lunch, <17 snack, else dinner); used at FT:276, 346, 951, 1442 | Applies only to new-form defaults. Not based on the selected date. No learned or history-based assignment. The "Logging earlier" mode uses fixed clock times (FT:65-79). |
| Meal assignment after "Add to <meal>" | Yes | FT:2355-2367 | Sets meal type explicitly. |

---

## 3. Correction UX

| Feature | Status | Where | Notes |
|---|---|---|---|
| Undo after log | **Not found** | `grep -n "Undo" src/pages/FoodTracker.jsx` only hits the delete toast. Success toast at FT:1184 has no action. | Logging has no undo. |
| Undo after delete | Yes | FT:1216-1239 | Toast action re-creates the row via `FoodEntry.create(rest)` (FT:1231-1233), so the restored row gets a new id. No confirm dialog before delete. |
| Undo after edit | **Not found** | FT:1254-1279 | Edit has no undo. |
| Edit entry | Yes | FT:1281-1330 (`startEditEntry`), FT:1254-1279 (`updateFoodMutation`) | Opens the full Add sheet. The search block is not hidden in edit mode (FT:2618-2760), so this matches EDGE audit finding 6 (checked in section 13). Save writes `date: selectedDate` and recomputes `serving_grams`. Does not touch `eaten_at`, `planned`, `tag`, or `cost_usd`. Setting `selectedDate` to the entry's date (FT:1327) moves the view. |
| Duplicate guard on rapid taps | Partial | Recent rail disabled while pending (FT:1837), `quickRelogFood` returns early (FT:1196), Add submit disabled while pending (FT:3296), copy-day disabled while pending (FT:3999-4001), template apply disabled (MT:398, 450, 466) | All guards depend on React `isPending` state. There is no ref-based guard, so two taps inside one render can both fire. |
| Serving-unit conversion | Yes | FT:1339-1365 (`changeServingUnit`), NU:175-191 (`gramsForAmount`), NU:227-262 (`formatServingHint`) | Mass-preserving when both units have a known gram weight. Otherwise rebases base macros and warns nothing. Food-defined portions outrank generic units (NU:180-183). |
| Decimal servings | Yes | FT:2942-2949 (step 0.5, `inputMode=decimal`), FT:1346 (2-dp rounding) | Recipe builder is integer-only; log dialog is 0.5 steps. |
| Over-2500-kcal confirm | Yes | FT:3273-3283 (`window.confirm`) | Only guard against a typo'd amount. |

---

## 4. Targets

### 4a. Where the daily numbers come from

Priority at `src/hooks/useDailyTargets.js:136-165`: manual override (`nutrition_overrides`, :114-134) → engine recommendation for the chosen phase (:139-146) → profile goal (:148-151) → `DEFAULTS` (:30).

- Engine runs nightly at 10:00 UTC (`.github/workflows/daily-engine.yml:6`).
- Engine target (`scripts/engine/nutrition_modulator.py`, `recommend_deficit` :149):
  - **Cut:** `kcal_deficit = (maintenance − macro_floor_kcal) × headroom` (:297-300). Target = maintenance − deficit. At full headroom the target equals the macro floor (protein×4 + fat×9 + carbs×4). The code comment says so explicitly (:125-128). **Adaptive maintenance does not move a full-headroom cut target.** It only matters through the gates.
  - **Maintain:** target = adaptive maintenance (:304-310).
  - **Bulk:** maintenance + 100 kcal (`BULK_SURPLUS_KCAL` :122).
- Adaptive maintenance (`scripts/engine/tdee.py:102-139`, called from CAS:1502-1510):
  - Energy balance `bias × mean_intake − daily_rate × density`, where density is composition-aware (Forbes) with an early-transient discount.
  - Blended with a bodyweight prior at weight `0.6 × log_coverage` (tdee.py:133-135), then clamped to 0.5-1.6× prior (:135). Explicitly avoids the "half-logged week drags TDEE down" spiral (docstring :112-120).
  - Learned under-report bias bounded in [1.0, 1.5] (CAS:1477-1500; tdee.py:36-37, 81-92).
  - 7-day intake is a mean over **logged days only**, with `log_coverage_7d` published alongside (CAS:780-796).
  - Weight trend: EWMA α=0.10 (CAS:812), then OLS slope of the smoothed series over up to 28 entries (CAS:803-820).

### 4b. Frontend TDEE (a second, older model)

- `src/utils/coachingUtils.js:285-334` (`calculateAdaptiveTDEE`) uses a fixed **500 kcal per lb/week** (line 331, `weeklyChangeLbs * 500`), with no composition term, no intake bias, and no log-coverage weighting. It needs ≥10 food days and ≥14-day span (:306-321).
- The engine's own docstring (tdee.py:4-6) calls this constant "indefensible" and replaced it. The frontend still uses it.
- Formula TDEE is Mifflin-St Jeor (coachingUtils.js:268-270). Activity multipliers 1.2-1.9 (`src/lib/constants.js:83-89`) are conventional but uncited.
- Where it is still live: FT goal modal "Auto-calculate from TDEE" (FT:4184), historical 7-day goal line (FT:580-604), and "Phase target" block (FT:4086-4106).

### 4c. Dead code: `DietPhaseCard`

- `src/components/nutrition/DietPhaseCard.jsx` (571 lines) is imported nowhere. `grep -rn "DietPhaseCard" src` returns only its own file. Treat it as dead.
- Its rate presets, custom-rate input (unclamped, DPC:140-143), and profile-macro writes (DPC:110-125) are therefore unreachable.

### 4d. Live phase picker

- Cut / Maintain / Bulk, inside WeeklyPlanCard via `useSetDietPhase` (`src/hooks/useSetDietPhase.js:21-62`). It writes `user_profiles.diet_phase` and inserts `diet_phases(phase_type, start_date)` with **no `weekly_rate`**. No rate is user-selectable in the live UI.
- Knock-on: FT goal modal computes "Phase target" as `calculatePhaseCalories(tdee, weekly_rate)` (FT:4089, FT:595). With `weekly_rate` null this yields maintenance, not the cut target. The modal then shows "Your saved goals … don't match your phase target" (FT:4130) and its auto-fix sets maintenance-based goals. **Unverified in live DB:** whether the `diet_phases` rows created by the picker really have NULL `weekly_rate`. Source says yes.

### 4e. Adjustment, reason, and guardrails

- **Engine rationale shown:** WeeklyPlanCard shows `rec.rationale` with "Why?" expansion and gate chips (WeeklyPlanCard.jsx:523-552). Rationale strings are at NM:345-371.
- **Manual override:** WeeklyPlanCard.jsx:290-380 writes `nutrition_overrides` (action `manual`). Banner at WPC:507-518. The override wins over the engine (useDailyTargets.js:141).
- **Not shown elsewhere:** FT shows only an "ENGINE-SET" badge (FT:1946-1950). No rationale on the daily log or in Today.
- **Weekly check-in (targets):** not found in-app. `supabase/functions/send-weekly-checkin-reminder/index.ts:22-23` is a push ("Log your weigh-in…"). No cron or workflow for it in repo (`grep -rn "send-weekly-checkin-reminder" .github scripts` empty). It may be scheduled in live cron (unverified).
- **Guardrails:**
  - Cut duration cap: 6 weeks forces headroom to 0.25 (NM:232-238). Labelled TNF "4-6 weeks".
  - Recovery gates (HRV, RHR, TSB, sleep, overreach) apply only outside cuts (NM:180-204). On a cut, only manual ease (0.65) and severe crash gate it (NM:219-226).
  - Strength-regression gate: strength slope < −1.0 lb/wk → ×0.70 (NM:~206-212), labelled tunable.
  - Fat floor max(50 g, 0.33 g/lb) (NM:123, 255). Carb floor 30 g/day (NM:124). Protein 1.35 g/lb on cut (NM:115).
  - Frontend cut clamp: protein 1.3-1.5 g/lb with 1.2 hard floor (useDailyTargets.js:63-68, 173-177, 202); fat max(50, lb/3) (:175).
  - **No absolute kcal floor** (`grep -n "1200\|1500" scripts/engine/nutrition_modulator.py scripts/compute_athlete_state.py` gives nothing relevant). The macro floor is the only floor.
  - **No rate-of-loss cap in the live path.** The 35% cap (`MAX_DEFICIT_RATIO`, NM:23) is used by `modulate()` (NM:70) and by a `target` clamp (NM:164-165) whose result is never read on the cut/maintain/bulk path (NM:297-310). `AGGRESSIVE_TARGET_DEFICIT = 0.25` (NM:108) is therefore dead on the live path.
- **Engine phase recommender:** `scripts/engine/phase_recommender.py` (GAIN_RATE 0.3 lb/wk, :28).

### 4f. Grounding of constants

| Constant | Value | Location | Status |
|---|---|---|---|
| Fiber target | 14 g / 1000 kcal | useDailyTargets.js:188 | Grounded: IOM 2005, cited in comment. |
| Forbes C / lean and fat kcal per kg | 10.4 / 1820 / 9440 | tdee.py:21-23 | Labelled `[COACH]`. Forbes is named but not linked. |
| Early density / transient weeks | 2380 kcal/kg / 6 wk | tdee.py:26-27 | `[COACH]` / `[ENG]`. Unsourced. |
| TDEE blend / bias range | 0.6 / [1.0, 1.5] | tdee.py:35-37 | `[ENG]` tunable. |
| 500 kcal per lb/wk | 3500 / 7 | coachingUtils.js:331, 420 | Standard energy-density convention, but uncited in code. Frontend-only. |
| Protein cut | 1.35 g/lb (engine), 1.3-1.5 band with 1.2 floor (frontend) | NM:115; useDailyTargets.js:63-68 | Cites TNF philosophy and the 1.2-1.5 range. The two constants disagree in pieces. |
| Cut duration cap | 6 weeks | NM:232-238 | Labelled TNF 4-6 wk. Coach prior. |
| Fat floor | max(50 g, 0.33 g/lb) | NM:123, 255; useDailyTargets.js:175 | TNF (per comment). Frontend uses lb/3, so the two differ. |
| Carb floor | 30 g/day | NM:124 | Coach prescription. Not externally sourced. |
| Bulk surplus | 100 kcal | NM:122 | Cites a vault note. |
| Strength regression gate | −1.0 lb/wk, ×0.70 | NM:~206-212 | Comment says tunable, not TNF. |
| Ease factor | 0.65 | NM:222 | Tunable. |
| Poor-sleep gate | score < 60, ×0.70 | NM:113, 200 | Unsourced. |
| Frontend DEFAULTS | 2000 / 150 / 200 / 65 | useDailyTargets.js:30 | Unsourced fallback. Silent when profile is empty. |
| Activity multipliers | 1.2-1.9 | constants.js:83-89 | Conventional, uncited. |
| Steps to activity bands | 5k / 7.5k / 10k / 12.5k | coachingUtils.js:243-250 | Unsourced. |
| Water goal | 35 mL/kg, default 3000 mL | Supplements.jsx:21-31 | Unsourced heuristic. |
| Protein per lb defaults | 0.8 / 1.0 / 1.2 | FT:529 (goal form), coachingUtils.js:402-409 | Inconsistent across surfaces. Unsourced. |
| Meal allocation | 25/35/30/10 | MealPlanIdeas.jsx:8 | Unsourced. |
| Swap kcal ceiling | 600 kcal | config/dietPlans.js (SWAP_MAX_KCAL) | Self-labelled tunable. |

### 4g. Weight feedback into targets

- Weigh-in writes `body_weight_entries` (one per day, update-on-same-day, `src/hooks/useWeighIn.js:89-137`). Profile `current_weight` syncs only for today (:125-129). Engine trend and TDEE use the same series (CAS:803-820).
- **Latent unit issue:** the engine treats `current_weight` as lb (CAS:1483, `estimate_tdee` at tdee.py:121 uses `bodyweight_lb * 15.5`) and never reads `weight_unit`. The app stores values "exactly as entered" (useWeighIn.js:94). A `kg` profile would feed kg values as lb. Only matters if `weight_unit='kg'` is used.
- Weigh-in gate: `src/hooks/useWeighInGate.jsx` asks for today's weight before a session starts, with Skip.
- Trend display: EWMA α=0.1 in `src/components/progress/WeightProgressChart.jsx:12` and `src/pages/Progress.jsx`.

---

## 5. Weight and body

- Weigh-in modal and prompt: `src/components/WeighInModal.jsx`, `src/components/dashboard/WeighInPrompt.jsx`, gate dialog `WeighInGateDialog.jsx`.
- Progress tab (Fuel → Body): `src/pages/Progress.jsx` (709 lines) and `src/components/progress/WeightProgressChart.jsx`. Trend delta uses smoothed trend (Progress.jsx:55-60).
- Body-fat estimate from physique photos feeds the energy-density term (CAS:1466-1475). Physique BF is reachable via `physique_entries`.

---

## 6. Micronutrients, water, supplements, meal ideas

- **Micronutrients:** `grep -rn -i -E "micronutr|vitamin|sodium|potassium|sugar_g|cholesterol" src` returns nothing relevant. Only fiber and cost are tracked (`food_entries` columns in migrations).
- **Water:** `src/pages/Supplements.jsx:33-135`. Quick-add 100/250/500 mL (:100-113). Goal `35 mL/kg`, default 3000 (:21-31). Delete at :132-133 is immediate with **no undo and no confirm**. Table `water_logs` (no `planned`/date column; uses `logged_at`).
- **Supplements:** `supplement_logs` (Supplements.jsx:221, 270, 289). Types and logs, with delete confirms. Reachable as Fuel → Hydration (`src/pages/Fuel.jsx:81-85`).
- **Meal ideas:** section 2.
- **Swap:** `src/components/nutrition/SwapFoodDialog.jsx` picks from `FOOD_CATALOG` (`src/config/dietPlans.js:45-85`) plus My Foods. `useFoodSwap.js:36-80` writes `nutrition_overrides` and re-solves the day.
- **Week plan optimizer:** `src/config/dietPlans.js:244-545` (`optimizeDay`) runs over a **hard-coded catalog of one athlete's foods with purchase prices** (header comment :1-17). Not a general food DB.

---

## 7. Insights

- Fuel summary (ring, 7-day strip, intake vs pace): FT:1852-2028.
  - Totals use eaten rows only (`eatenEntries`, FT:1518).
  - The 7-day strip uses `getDailyCalorieTrend(allFoodEntries)` (FT:580-584), which **includes planned rows**.
- Intake stats (7/14/28-day averages over logged days, split by calories, fiber when fully logged): FT:1622-1673, 2108-2175.
- Today dashboard nutrition module: `src/pages/Today.jsx:564-576, 711-750`. **Its totals include planned rows** (no `!e.planned` filter at Today.jsx:569-575), unlike Fuel.
- 7-day calorie adherence: computed by the engine (CAS:794), shown in `src/pages/AthleteState.jsx:631-680`, and quoted in the daily brief (`supabase/functions/generate-daily-brief/index.ts:143-151`, LLM-written text).
- Insights page itself (`src/pages/Insights.jsx`) has no nutrition content, just the brief card.
- Weekly nutrition summary: **not found** in Fuel or Insights.

Planned-row inconsistency across surfaces:

| Surface | Includes planned? | Where |
|---|---|---|
| Fuel ring, macros, intake vs pace | No | FT:1518 |
| Fuel 7-day strip | **Yes** | FT:580-584 (`getDailyCalorieTrend`, NU:66) |
| Today nutrition module | **Yes** | Today.jsx:569-575 |
| Recent rail | **Yes** | NU:32-57 via FT:607 |
| Intake stats | No | FT:1625 |
| Adaptive TDEE input | No | coachingUtils.js:300-304; CAS (planned filter) |

---

## 8. Data trust

- **Sources:** USDA FDC (`usda-proxy`), Open Food Facts, USDA Branded GTIN, Groq LLM estimates (text and vision). The AI sources are estimates, not database entries.
- **Per-entry source:** not stored. `food_entries` has no source column (remote schema:410-428 plus migrations). `brand_name` exists in the schema but nothing writes it (`grep -rn brand_name src` returns nothing outside USDA mapping). The source is shown only as search-result section headers (FT:2649-2708) and a transient toast.
- **Auto-save into My Foods on every log:** FT:3288-3292 (the Add submit) calls `saveCustomFoodMutation` for every single-food log with `baseMacros.calories > 0`, regardless of source (USDA, barcode, AI, label, or manual). The "Add Food to Meal" path does the same (FT:1101-1103). Whole-meal estimate logging (FT:989-1023) does not save. RecipeBuilder has its own name-match save (RB:600-612, called at RB:657).
- **Overwrite by name:** `saveCustomFoodMutation` looks up an existing custom food by case-insensitive name and calls `update` (FT:655-664; RB:600-612). A new AI estimate or label read with the same name **overwrites the saved food's macros**. There is no source tag to tell them apart.
- **Duplicate guard:** only client-side name match. No unique index on `custom_foods` (grep of migrations for custom_foods unique returns nothing). `food_portions` has `(custom_food_id, lower(label))` unique index (migration `20260806010000_portions_fiber_favorites.sql:26-27`).
- **Silent AI-estimate loss:** whole-meal estimate drops `serving_description`, `confidence`, and `note` at log time (FT:979, 997-1010). Logged entries are `serving_size=1 serving` with no grams. Item removal is the only edit (FT:3401-3418).
- **Fiber:** USDA maps nutrient 291 (usda.js:45-51). OFF has none. AI and label estimates never request fiber. So non-USDA entries have unknown fiber (null), which is handled correctly everywhere (FT:1648, 1661).
- **Serving fallback:** `openFoodFacts.js:29` sets `servingSize = parseServingGrams(...) ?? 100`. Then `selectFood` treats any non-null servingSize as real (FT:1482-1487). **An OFF product with no parseable gram serving gets a fabricated "1 serving = 100 g".** This contradicts the code's own "never default it" rule (FT:294-297). Also `ml` servings are not parsed by the regex.
- **eaten_at vs date:** in "Eating now" mode, `eaten_at` is the real clock time even when logging a past day (`getEatenAt`, FT:75-78). That time can fall on a different calendar day than `date`.
- **Planned-row rewrite:** `src/hooks/usePlannedDayRebalance.js:94` silently updates planned rows when targets move (error toast only at :109).

---

## 9. Export

- `src/components/DataExport.jsx:51-61`: food CSV columns are `date, meal, food_name, calories, protein_g, carbs_g, fats_g`.
- Source is `useAllFoodEntries`, the last 90 days only (`src/hooks/useUserQueries.js:188-209`), passed from `src/pages/Profile.jsx:939`.
- Missing: fiber, serving size and unit, serving grams, `eaten_at`, `planned` flag, cost, tag.
- Includes planned rows (no filter).
- Water, custom foods, and portions are not exported. Only `supplement_log` is.
- "Export All" is available (DataExport.jsx:152-154).

---

## 10. Dead or unreachable

| Item | Evidence | Status |
|---|---|---|
| `src/components/nutrition/DietPhaseCard.jsx` | No imports anywhere | **Dead** (571 lines). |
| `getFoodDetails` in `src/api/usda.js:102-105` | `grep -rn getFoodDetails src` returns only its definition | **Dead export.** |
| Recipe Share (`sharingRecipe`) | Value never read (RB:74, 251, 365-368) | **Non-functional.** |
| `AGGRESSIVE_TARGET_DEFICIT` and the `target` clamp | Assigned at NM:164-165, not read on the live branches (NM:297-310) | **Dead on live path.** |
| `brand_name` column | Never written by the app | **Unused column.** |
| FT:128-130 comment | Orphaned: the "units every food gets" comment sits above `FavoriteToggle` and describes `GENERIC_UNITS` | Cosmetic. |

Reachable, for completeness: `StatsSetupModal` (FT:266, 2523, 3921), `MacroGoalsEditor` (Profile.jsx:787 and FT), `MealPlanIdeas` (FT:2571, 3593), `SwapFoodDialog` (FT:4034), `BarcodeScanner` (FT:4047), `RecipeBuilder` (FT:2557, 3591), `WeeklyPlanCard` (Fuel.jsx:66).

---

## 11. Not found (grep evidence)

- Voice input: `grep -rn -i -E "speechrecognition|webkitSpeech|voice|dictat" src` → UI copy and CSS only.
- Micronutrients: `grep -rn -i -E "micronutr|vitamin|sodium|potassium|sugar_g|cholesterol" src` → none.
- Calorie-only quick-add: submit disabled without name (FT:3296).
- Copy single meal: `grep -rn -i "copy ?meal\|copyMeal" src` → none.
- Undo after log or after edit: FT:1175-1185 and 1270-1275 have no action.
- Weekly nutrition summary: none in `src/pages/Fuel.jsx`, `Insights.jsx`, or FT.
- Weekly target check-in: none in-app (see 4e).
- Absolute kcal floor: none in engine (see 4e).
- Per-entry source label: none (`food_entries` has no source column).

---

## 12. Verification gaps

- Live DB not queried. Unverified: whether picker-created `diet_phases` rows have NULL `weekly_rate` (section 4d), whether `send-weekly-checkin-reminder` is scheduled in live cron, and whether the three AI food edge functions are gated by JWT in the deployed project. `supabase/config.toml` has no `[functions.*]` overrides, so Supabase's default JWT verification applies. Source does no user check inside `estimate-food-macros`, `estimate-meal`, or `read-nutrition-label`, and none is rate-limited (unlike `usda-proxy`). Any caller holding the public anon key could run these Groq-billed calls.
- Root cause of EDGE audit finding 5 ("8:46 PM logged into Lunch") was not reproduced. Code paths that would produce it: Recent one-tap re-log copies the source entry's `meal_type` (FT:1204), and copy-day copies it too. The time-of-day default alone would give dinner after 17:00 (FT:57-63).

---

## 13. Checks against prior audits

- EDGE audit finding 5 (meal assignment): **partially supported.** The time-of-day default is correct; the wrong Lunch result comes from the copy paths (section 12).
- EDGE audit finding 6 (edit sheet is full Add sheet): **confirmed.** FT:2618-2760 is not gated by `editingEntry`.
- EDGE audit finding 14 (macros do not reconcile, 1,655 vs 1,800): **code-consistent.** The warning at FT:610-619 is manual-only and never fires for USDA foods (FT:611).
- EDGE audit finding 15 (recipe servings integer-only): **confirmed.** RB:1129-1146.
- EDGE audit "Undo on log: none, yes for delete": **confirmed.**
- EDGE audit "Recent chips, 1-tap": **confirmed**, but Recent includes planned rows (NU:32-57).
- EDGE audit "voice" as competitor baseline: **not present** (section 11).
- UI audit: I did not check its nutrition claims beyond these items.

---

## 14. Quick reference: competitor-comparable features

- **Present:** USDA and Branded search; barcode (OFF, then USDA GTIN); AI describe-it (text); AI whole-meal (text and photo); label photo; manual custom foods with named portions and serving grams; favorites; CSV import; recent rail with one-tap re-log; copy day; saved meal and day templates; recipes with per-serving math; planned weekly plan with check-off; day-only food swap; remaining or consumed bars; 7-day strip; intake averages; fiber (when known); engine-set calorie target with rationale; manual target override; weight EWMA trend; water; supplements; CSV export of food (90-day, reduced columns).
- **Absent:** voice; micronutrients beyond fiber; per-entry source tag; undo on log and edit; quick calorie-only entry; copy single meal; weekly nutrition summary in-app; user-selectable weekly rate in the live picker; absolute kcal floor; rate-of-loss cap in live path; full food-history export.
- **Architecture notes:** adaptive TDEE exists in two versions (engine, correct-ish; frontend, older fixed-constant). Engine cut target is macro-floor-driven, so adaptive TDEE does not move it at full headroom. The AI food estimates have no auth check or rate limit server-side.
