# Fuel / food-tracker map — round 1

Entry point: bottom nav → **Fuel** (1 tap from app open) → `/fuel` (`src/pages/Fuel.jsx`),
default sub-tab "Nutrition & Meals" renders `FoodTracker` (`src/pages/FoodTracker.jsx`,
4055 lines) immediately — no extra tap. Fuel also hosts "Body" (weigh-in/measurements,
merged Progress) and "Hydration" (Supplements embedded) sub-tabs (1 tap each from Fuel).

Usage grounding (`usage.json`): `food_entries` 591 total / 398 last 90d — by far
Nolan's most-used table in the app. `nutrition_overrides` 14/14 (every override still
active — he types manual targets and they stick). `weekly_plans` 17/13. `diet_phases` 2/1.

## Today log (FoodTracker.jsx, default view)

| Feature | What it does | Taps from app open | Usage | Tables |
|---|---|---|---|---|
| Calorie ring + macro bars | Sums `eatenEntries` (planned:false) via `calculateMacros`, renders ring w/ overflow arc | 1 (visible on load) | every day | read `food_entries` |
| USDA generic search | Debounced search, 3-tier fuzzy fallback (`FoodTracker.jsx:335-405`) | 2 (tap Add, type) | high — primary logging path | none (USDA API); selection → `FoodEntry.create` |
| USDA branded search | Parallel branded results, collapsed behind toggle (`:2565-2583`) | 3 | lower than generic | same |
| Manual food entry | Disclosure form, calories/protein/carbs/fats/fiber inputs (`:2717-3122`) | 3 (Add → expand Manual) | food w/ no USDA match | `FoodEntry.create`, optional `CustomFood.create` |
| AI text estimate | Free-text description → `estimate-food-macros` edge fn (`estimateFood`, `:846-880`) | 3 | occasional | `CustomFood` optional |
| AI photo meal estimator | Photo or text → `estimate-meal` edge fn (`estimateMeal`, `:905-921`), batch log via raw `supabase.from("food_entries").insert()` (`:947-948`, NOT `db.entities`) | 3 (Add → "meal estimator") | occasional, whole-meal logging | `FoodEntry` batch create |
| Barcode scan | `BarcodeScanner` component, falls back to label-photo capture on miss (`:3903-3906`) | 3 | occasional | none directly |
| Nutrition-label photo capture | `readLabel` → `read-nutrition-label` edge fn, prefills manual form (`:981-1015`) | 3-4 | rare/fallback | `CustomFood` optional |
| Food portions (custom serving sizes) | Add/remove named portions per food, persisted via `syncPortions` (`:657-685`, `:1284-1315`) | 4 (inside Add/Edit food) | `food_portions` usage.json shows **0/0 rows ever** — feature is effectively unused | `FoodPortion` create/update/delete |
| Edit existing entry | `startEditEntry` (`:1170-1219`) opens the Add/Edit sheet pre-filled | 2 (tap entry → edit icon) | very common given 398 entries/90d | `FoodEntry.update` |
| Delete entry | Trash icon per row (`:2222`), **no confirm dialog, no undo**, instant `FoodEntry.delete` | 1 tap | common (fixing mis-logs) | `FoodEntry.delete` |
| Mark planned item as eaten | Checkbox on plan rows, `togglePlannedMutation` flips `planned:false` (`:1132-1141`) | 1 tap | ties to weekly plan (13 plans/90d) | `FoodEntry.update` |
| Swap planned food | Swap icon → `SwapFoodDialog`, `runSwap`/`revertSwap` (`:1443-1466`) | 2 | occasional | `FoodEntry.update` |
| Copy day forward | Button → dialog, per-item checkboxes, `copyDayMutation` (`:1473-1505`, `:1926-1949`) | 2 | occasional | `FoodEntry` batch create |
| Save day as template | Button (`:2249-2260`) → `SaveAsTemplateDialog` | 2 | ties to `weekly_plans`/meal templates | `MealTemplate` create |
| Build new meal (template) | Multi-item builder dialog (`:3448-3748`), `handleSaveMealTemplate` (`:1069-1079`) | 2-3 | occasional | `CustomFood` optional, `MealTemplate` create |
| Recipes | `RecipeBuilder` embedded (desktop `:2432-2444`, mobile `:3428-3436`) | 2 | — | `Recipe` CRUD |
| Nutrition goals editor | Modal, calorie/macro/fiber/protein-per-lb (`:3358-4054`), `updateGoalsMutation` (`:494-507`) | 2 | `nutrition_overrides` 14/14 — always in use | `UserProfile.update` |
| Intake stats | Expandable 7/14/30-day stats (`:1951-2018`, `intakeStats` memo `:1510-1561`) | 2 | — | in-memory only |

## Week plan (buried — Nolan's own call-out)

`Fuel.jsx:46-68` — the week-plan entry point is a single row **below** the entire
daily log (search, manual entry, today's list, goals, everything), opening
`WeeklyPlanCard` in a dialog. Given 17 weekly_plans rows (13 in 90 days, i.e. this
is used almost every week), it currently costs a scroll past the whole food log
plus 1 tap, every time, to reach a weekly-cadence feature.

- **Approve & load the week** (`WeeklyPlanCard.jsx:209-235`): deletes all existing
  `planned:true` `food_entries` rows for the week's dates, then bulk-inserts fresh
  ones from `resolveDayPlan()` per day. Button disabled while `approve.isPending`
  (`:558`). Delete-then-create is idempotent *if serialized*, but there is no
  server-side lock — two near-simultaneous approvals (double-tap before the
  `isPending` re-render lands, or two browser tabs) can interleave delete/create
  and either duplicate or drop rows. Confirmed real-world symptom tonight: 42 items
  loaded and the sheet still reads "Approve & load the week" afterward (no
  post-approve state change to signal success/idempotency to the user).
- Carb-cycled targets: per-day via `resolveDayPlan()` + `isTrainingDay()`, using
  `date-fns` (`addDays(parseISO(...))`) for date math — DST-safe by library choice,
  not hand-rolled.
- Shopping list: `buildShoppingList(allRows)` (`config/dietPlans.js`), persisted to
  **localStorage**, keyed `optigains.grocery.${weekStart}` — not synced across
  devices, silently lost if browser storage is cleared.
- Nutrition overrides (manual target) interact with the day's rebalance (see below).

## Planned-day rebalance (background, silent writes)

`src/hooks/usePlannedDayRebalance.js` — runs on every FoodTracker render for the
selected day. When approved-plan calories drift >2%/25kcal from the day's live
target, it silently rewrites the still-planned (not yet checked-off) `FoodEntry`
rows' `serving_size`/macros to re-fit the day's calorie budget, respecting a
cut protein floor. No user-visible diff/confirmation before the rewrite — a user
who manually nudged a planned entry's grams can have that edit silently
overwritten by the next rebalance pass. One-attempt-per-observed-state guard
(`attempted` ref, line 84-86) exists but is per-component-instance (resets on
reload/tab reopen), and there is no DB-level guard against two browser
tabs computing conflicting rebalances concurrently.

## Diet phase / macro goals

`DietPhaseCard.jsx` — start/end a Cut/Bulk/Reverse/Maintenance phase; closes the
active phase (`DietPhase.update` end_date) and creates a new one, then pushes
computed macro goals into `UserProfile`. Button disabled while pending (`:554`).
`MacroGoalsEditor.jsx` is a stateless controlled form (no own mutation/guard);
calorie input allows 0 and has no upper bound (`min="0"` only, `:127-128`).

## Recipes / templates / other

- `RecipeBuilder.jsx`: servings input clamped to `Math.max(1, ...)` in the builder
  step (`:1131`), but `LogRecipeDialog` allows fractional servings down to 0.5
  with **no upper bound** (`:1441`). Ingredient gram amounts have `min="0"` only,
  no max, and no save-time check that amount > 0.
- `MealTemplates.jsx`: save-day-as-template and apply-template both go through
  `db.entities.MealTemplate`/`FoodEntry.create`; delete uses a real `ConfirmDialog`
  (unlike food-entry delete, which has none). Save button guarded by
  `createMutation.isPending`.
- `SwapFoodDialog.jsx`: pure UI, hands the replacement name to the parent's
  `onSwap`; grams/macros are re-solved by the caller, not this component.
- `BarcodeScanner.jsx`: explicit state machine, "not found" offers label-photo
  fallback, try-again, or manual entry — no dead-end states found.
- `MealPlanIdeas.jsx`: generates 3-day meal-idea plans from past logged meals,
  filters "suspicious" entries (calories ≤ 0, missing meal_type, >10 cal/g
  density) silently — no user-visible signal that some history was excluded.

## Numeric input validation gaps (grounded, `FoodTracker.jsx`)

- Manual-entry calories/protein/carbs/fats/fiber: `min="0"` only, **no upper
  bound** (`:2978, 3002, 3025, 3049, 3077`) — e.g. 999999999 kcal is enterable.
- Serving amount: `min="0" step="0.5"` but the actual guard before submit only
  rejects `<= 0` (`:2807`, `:3145`) — fractional-but-tiny values (0.00001) pass.
- Serving grams and portion grams DO reject `<= 0` (`:2867`, `:3303`).
- Recipe `LogRecipeDialog` servings: `min="0.5"`, no max.
- Goals editor calorie goal: `min="0"`, no max (`MacroGoalsEditor.jsx:127-128`).

## Date/timezone handling (grounded)

- `selectedDate` initializes to local `format(new Date(), "yyyy-MM-dd")`
  (`FoodTracker.jsx:202`) and is used as the grouping key for `date` on every
  write — so "what day did this land on" is whatever `selectedDate` the UI has
  open, not derived from `eaten_at`.
- `getEatenAt` (`:73-77`): "now" stamps real UTC instant; "logging earlier" stamps
  `${dateStr}T${mealDefaultTime}:00` parsed as **local** time then `.toISOString()`'d
  — correct as long as the browser's local zone matches the athlete's, but there's
  no explicit `user_profiles.timezone` conversion here (unlike `WeeklyPlanCard`,
  which does pass `profile.timezone` into `resolveDayPlan`/`getTodayString`).
- Calorie trend / phase lookup uses `new Date(day.date + 'T12:00:00')` (noon local)
  while diet-phase boundaries may be stored/compared differently — flagged by the
  explore pass as a possible day-off-by-one near a phase start/end, not yet proven.
- `selectedDate` does **not** auto-advance at local midnight while the tab stays
  open (it's `useState` initialized once) — a session left open across midnight
  keeps logging to the old date until the user navigates the date picker or
  reloads.

## No confirm / no undo / no double-submit-guard inventory

- Delete food entry (`:2222`): no confirm, no undo, **no `isPending` disable** —
  a fast double-tap fires `FoodEntry.delete` twice (second call is a harmless
  no-op against an already-deleted row, but the UI gives no feedback distinguishing
  that from a failure).
- Toggle "mark as eaten" (`:2143`): no `isPending` disable.
- Favorite toggle (`:134`): no disable guard.
- Swap button (`:2209-2217`): no disabled state while `foodSwap.isPending`.
- "All/None" in copy-day dialog (`:3804-3815`): no disabled state for an empty
  entry set.
- By contrast, Add food, Update entry, Copy day, Update goals, AI estimate (food
  + meal), Read label, and MealTemplate save all correctly disable on
  `isPending`.

## UX candidates

- **Week plan is buried at the bottom of the meal page** (Nolan named this one) —
  it's a single row below the entire daily log, yet weekly_plans usage (13/90d)
  says it's touched almost every week. Consider surfacing it as a persistent
  chip/badge near the top of Fuel, or a sub-tab, especially since approving it
  changes 42+ rows and gives no visible before/after confirmation.
- **Food portions feature is built but has zero rows ever** (`food_portions`
  0/0) — either it's undiscoverable (buried 4 taps deep inside Add/Edit food) or
  not worth the UI surface it occupies; worth a real look rather than more
  polish.
- **Approve & load the week gives no success/idempotency signal** — the sheet
  still reads "Approve & load the week" after a successful 42-item load, so
  there's no way to tell "did that just work" without leaving the sheet and
  checking the day log.
- **Silent background rewrite of planned macros** (`usePlannedDayRebalance`) can
  clobber a manual edit the user just made to a planned item's amount, with zero
  visible diff — worth at least a toast naming what changed when a rescale fires
  outside a tiny drift band.
- **Delete food entry has no undo**, unlike template delete (which has a real
  `ConfirmDialog`) — inconsistent safety net for the single most-used destructive
  action in this area (398 entries/90d implies frequent edits/corrections).
