// ─── Diet plans (the "Diet Optimizer" outputs) ──────────────────────────────────
//
// Three cost/macro-optimized whole-day food lists, one per diet aggressiveness.
// Source: Nolan's spreadsheet. Each item carries its per-100g macros and a
// `portion` = number of 100g servings (so a logged serving = portion × 100 g).
// food_entries stores macros ALREADY SCALED to the eaten serving, so scaleItem()
// pre-multiplies here.
//
// Meal slots assume an EARLY-MORNING lift, so carbs are timed around the session:
//   timing "pre"  → fast carbs just before the lift (breakfast)
//   timing "post" → protein + carbs right after (breakfast/lunch, anabolic window)
//   timing "anytime" → spread across the day
// Carb-cycling: the plans below are the TRAINING-DAY baseline. On rest days,
// carbCycleItems() trims the workout-timed carbs (you don't need the pre/post fuel).

// role: protein | carb | fat | dairy | fruit | veg   (drives carb-cycling + display)
export const DIET_PLANS = {
  aggressive_cut: {
    key: "aggressive_cut",
    label: "Aggressive Cut",
    target: { calories: 1500, protein: 200, carbs: 40, fats: 60 },
    items: [
      { food: "Banana",          per100g: { cal: 94,  p: 1.2,  c: 24.0, f: 0.0 },  portion: 0.70, role: "fruit",   meal: "breakfast", timing: "pre" },
      { food: "Eggs",            per100g: { cal: 144, p: 12.6, c: 0.7,  f: 9.6 },  portion: 3.00, role: "protein", meal: "breakfast", timing: "post" },
      { food: "Egg Whites",      per100g: { cal: 44,  p: 10.0, c: 0.0,  f: 0.0 },  portion: 1.48, role: "protein", meal: "breakfast", timing: "post" },
      { food: "Chicken Breast",  per100g: { cal: 100, p: 19.6, c: 0.0,  f: 2.7 },  portion: 5.00, role: "protein", meal: "lunch",     timing: "anytime" },
      { food: "Cottage Cheese",  per100g: { cal: 81,  p: 11.5, c: 4.4,  f: 2.2 },  portion: 4.01, role: "dairy",   meal: "dinner",    timing: "anytime" },
      { food: "2% Milk",         per100g: { cal: 64,  p: 3.3,  c: 4.6,  f: 2.8 },  portion: 0.75, role: "dairy",   meal: "snack",     timing: "anytime" },
    ],
  },

  moderate_cut: {
    key: "moderate_cut",
    label: "Moderate Cut",
    target: { calories: 2110, protein: 204, carbs: 164, fats: 73 },
    items: [
      { food: "Banana",          per100g: { cal: 89,  p: 1.1,  c: 22.8, f: 0.3 },  portion: 0.70, role: "fruit",   meal: "breakfast", timing: "pre" },
      { food: "Rice Bar",        per100g: { cal: 409, p: 4.5,  c: 77.3, f: 11.4 }, portion: 0.22, role: "carb",    meal: "breakfast", timing: "pre" },
      { food: "Oats (Dry)",      per100g: { cal: 375, p: 12.5, c: 67.5, f: 6.3 },  portion: 1.00, role: "carb",    meal: "breakfast", timing: "post" },
      { food: "Eggs",            per100g: { cal: 140, p: 12.0, c: 0.0,  f: 10.0 }, portion: 3.00, role: "protein", meal: "breakfast", timing: "post" },
      { food: "Peanut Butter",   per100g: { cal: 656, p: 21.9, c: 18.8, f: 53.1 }, portion: 0.11, role: "fat",     meal: "breakfast", timing: "anytime" },
      { food: "Chicken Breast",  per100g: { cal: 143, p: 26.2, c: 0.0,  f: 3.6 },  portion: 3.02, role: "protein", meal: "lunch",     timing: "anytime" },
      { food: "Potatoes",        per100g: { cal: 77,  p: 2.0,  c: 17.0, f: 0.0 },  portion: 1.00, role: "carb",    meal: "lunch",     timing: "anytime" },
      { food: "Cottage Cheese",  per100g: { cal: 81,  p: 11.5, c: 4.4,  f: 2.2 },  portion: 4.58, role: "dairy",   meal: "dinner",    timing: "anytime" },
      { food: "Greek Yogurt",    per100g: { cal: 59,  p: 10.0, c: 4.1,  f: 0.0 },  portion: 1.00, role: "dairy",   meal: "snack",     timing: "anytime" },
      { food: "Strawberries",    per100g: { cal: 36,  p: 0.4,  c: 9.3,  f: 0.0 },  portion: 1.00, role: "fruit",   meal: "snack",     timing: "anytime" },
      { food: "2% Milk",         per100g: { cal: 54,  p: 3.3,  c: 5.0,  f: 2.1 },  portion: 2.20, role: "dairy",   meal: "snack",     timing: "anytime" },
    ],
  },

  aggressive_bulk: {
    key: "aggressive_bulk",
    label: "Aggressive Bulk",
    target: { calories: 3799, protein: 238, carbs: 570, fats: 100 },
    items: [
      { food: "Banana",          per100g: { cal: 89,  p: 1.1,  c: 22.8, f: 0.3 },  portion: 0.70, role: "fruit",   meal: "breakfast", timing: "pre" },
      { food: "Rice Bar",        per100g: { cal: 409, p: 4.5,  c: 77.3, f: 11.4 }, portion: 0.22, role: "carb",    meal: "breakfast", timing: "pre" },
      { food: "Oats (Dry)",      per100g: { cal: 375, p: 12.5, c: 67.5, f: 6.3 },  portion: 5.70, role: "carb",    meal: "breakfast", timing: "post" },
      { food: "Pasta (Cooked)",  per100g: { cal: 143, p: 5.0,  c: 29.3, f: 0.7 },  portion: 3.00, role: "carb",    meal: "lunch",     timing: "post" },
      { food: "Chicken Breast",  per100g: { cal: 143, p: 26.2, c: 0.0,  f: 3.6 },  portion: 2.70, role: "protein", meal: "lunch",     timing: "anytime" },
      { food: "Potatoes",        per100g: { cal: 77,  p: 2.0,  c: 17.0, f: 0.0 },  portion: 1.00, role: "carb",    meal: "dinner",    timing: "anytime" },
      { food: "Cottage Cheese",  per100g: { cal: 81,  p: 11.5, c: 4.4,  f: 2.2 },  portion: 4.01, role: "dairy",   meal: "dinner",    timing: "anytime" },
      { food: "Greek Yogurt",    per100g: { cal: 59,  p: 10.0, c: 4.1,  f: 0.0 },  portion: 2.36, role: "dairy",   meal: "snack",     timing: "anytime" },
      { food: "Strawberries",    per100g: { cal: 36,  p: 0.4,  c: 9.3,  f: 0.0 },  portion: 1.00, role: "fruit",   meal: "snack",     timing: "anytime" },
      { food: "2% Milk",         per100g: { cal: 54,  p: 3.3,  c: 5.0,  f: 2.1 },  portion: 2.20, role: "dairy",   meal: "snack",     timing: "anytime" },
    ],
  },
};

const r1 = (n) => Math.round(n * 10) / 10;

// One plan item → a fully-scaled food_entries-shaped object (macros for the
// whole serving, grams in serving_size). `planned: true` flags it as a not-yet-
// eaten plan row so the log can render it as a check-off item.
export function scaleItem(item, { date, mealOverride } = {}) {
  const k = item.portion;
  return {
    food_name: item.food,
    meal_type: mealOverride || item.meal,
    serving_size: Math.round(item.portion * 100),
    serving_unit: "g",
    calories: Math.round(item.per100g.cal * k),
    protein_grams: r1(item.per100g.p * k),
    carbs_grams: r1(item.per100g.c * k),
    fats_grams: r1(item.per100g.f * k),
    role: item.role,
    timing: item.timing,
    ...(date ? { date } : {}),
    planned: true,
  };
}

// Carb-cycle a plan's items for a given day. On rest days we trim the
// workout-timed carbs (pre/post fuel you don't need) by `restCarbFactor`;
// training days get the full plan. Protein/fat/dairy/fruit are untouched.
export function carbCycleItems(planKey, { trainingDay = true, restCarbFactor = 0.5 } = {}) {
  const plan = DIET_PLANS[planKey];
  if (!plan) return [];
  return plan.items.map((it) => {
    const isTimedCarb = it.role === "carb" && (it.timing === "pre" || it.timing === "post");
    if (trainingDay || !isTimedCarb) return it;
    return { ...it, portion: r1(it.portion * restCarbFactor) };
  });
}

// Carb-cycle the day, then — if a calorie target is given — scale every portion so
// the DAY hits that target. This is isocaloric carb cycling around the engine's
// recovery-gated optimal: same daily calories, carbs shifted onto lift days. The
// target is what makes the plan "the engine's optimal" rather than a fixed template.
// Factor is clamped to avoid runaway scaling on odd inputs.
export function scaledItems(planKey, { trainingDay = true, restCarbFactor = 0.5, calorieTarget = null } = {}) {
  const items = carbCycleItems(planKey, { trainingDay, restCarbFactor });
  if (!calorieTarget) return items;
  const dayCal = items.reduce((s, it) => s + it.per100g.cal * it.portion, 0);
  if (dayCal <= 0) return items;
  const factor = Math.min(2.0, Math.max(0.5, calorieTarget / dayCal));
  return items.map((it) => ({ ...it, portion: r1(it.portion * factor) }));
}

// Full plan → array of food_entries rows for `date`, carb-cycled by training day
// and (optionally) scaled to the engine's calorie target. This is the "approve the
// plan → write the day into the log" payload; rows are flagged planned:true.
export function planToFoodEntries(planKey, { date, trainingDay = true, restCarbFactor = 0.5, calorieTarget = null } = {}) {
  return scaledItems(planKey, { trainingDay, restCarbFactor, calorieTarget }).map((it) => scaleItem(it, { date }));
}

// Day macro totals for a plan (training-day baseline unless trainingDay=false).
export function planTotals(planKey, opts = {}) {
  return planToFoodEntries(planKey, { date: null, ...opts }).reduce(
    (t, e) => ({
      calories: t.calories + e.calories,
      protein: r1(t.protein + e.protein_grams),
      carbs: r1(t.carbs + e.carbs_grams),
      fats: r1(t.fats + e.fats_grams),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  );
}

// ─── Shopping list ───────────────────────────────────────────────────────────
// How you actually buy each food. `gramsPerUnit` is the EDIBLE grams in the
// plan's logged state per purchase unit (cooking yield already applied for
// cooked foods, e.g. ~1 lb raw chicken → ~340 g cooked). Prices are Walmart GV
// from Nolan's sheet; costs are estimates.
const PURCHASE_UNITS = {
  "2% Milk":        { label: "Half Gallon",  gramsPerUnit: 1890, price: 1.98 },
  "Peanut Butter":  { label: "40 oz Jar",    gramsPerUnit: 1134, price: 3.98 },
  "Chicken Breast": { label: "lb",           gramsPerUnit: 340,  price: 2.57 },
  "Eggs":           { label: "12-count",     gramsPerUnit: 600,  price: 1.47 },
  "Egg Whites":     { label: "32 oz carton", gramsPerUnit: 946,  price: 4.87 },
  "Oats (Dry)":     { label: "42 oz",        gramsPerUnit: 1191, price: 4.18 },
  "Pasta (Cooked)": { label: "16 oz box",    gramsPerUnit: 1088, price: 0.98 },
  "Rice Bar":       { label: "8-count box",  gramsPerUnit: 176,  price: 2.78 },
  "Cottage Cheese": { label: "24 oz tub",    gramsPerUnit: 680,  price: 2.24 },
  "Greek Yogurt":   { label: "32 oz tub",    gramsPerUnit: 907,  price: 2.94 },
  "Potatoes":       { label: "5 lb bag",     gramsPerUnit: 2268, price: 2.94 },
  "Banana":         { label: "lb",           gramsPerUnit: 453,  price: 0.50 },
  "Strawberries":   { label: "48 oz bag",    gramsPerUnit: 1361, price: 7.62 },
  "Blueberries":    { label: "16 oz bag",    gramsPerUnit: 454,  price: 3.12 },
};

// Roll a week's plan up into a shopping list: total grams of each food across the
// planned days → number of purchase units to buy (rounded up) + estimated cost.
// weekPlan: [{ planKey, trainingDay }, ...] — one entry per day you're shopping for.
export function buildShoppingList(weekPlan) {
  const grams = {};
  for (const day of weekPlan) {
    for (const e of planToFoodEntries(day.planKey, { date: null, trainingDay: day.trainingDay, calorieTarget: day.calorieTarget })) {
      grams[e.food_name] = (grams[e.food_name] || 0) + e.serving_size;
    }
  }
  const items = Object.entries(grams)
    .map(([food, g]) => {
      const u = PURCHASE_UNITS[food];
      if (!u) return { food, grams: Math.round(g), units: null, unitLabel: "g", cost: null };
      const units = Math.ceil(g / u.gramsPerUnit);
      return { food, grams: Math.round(g), units, unitLabel: u.label, cost: r1(units * u.price) };
    })
    .sort((a, b) => (b.cost || 0) - (a.cost || 0));
  const totalCost = r1(items.reduce((s, i) => s + (i.cost || 0), 0));
  return { items, totalCost };
}

// Pick the plan that best matches a diet phase + the day's calorie target.
// phase_type from diet_phases ("cut"|"bulk"|"maintain"|"reverse"); calorieGoal
// from the profile. Falls back to nearest-by-calories.
export function selectPlanForPhase(phaseType, calorieGoal) {
  if (phaseType === "bulk") return "aggressive_bulk";
  if (phaseType === "cut") {
    // Aggressive vs moderate cut by how low the target is.
    return calorieGoal && calorieGoal <= 1700 ? "aggressive_cut" : "moderate_cut";
  }
  // maintain/reverse/unknown → nearest plan by calorie target.
  const byCal = Object.values(DIET_PLANS)
    .map((p) => [p.key, Math.abs(p.target.calories - (calorieGoal || 2200))])
    .sort((a, b) => a[1] - b[1]);
  return byCal[0][0];
}
