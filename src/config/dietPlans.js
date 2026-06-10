// ─── Diet Optimizer: cost-min food selection fitted to the engine's targets ────
//
// The engine (useDailyTargets) decides WHAT the day should be — calories,
// protein anchor, fat floor. This module decides the CHEAPEST way to get there
// from Nolan's food list (per-100g macros + Walmart GV purchase pricing from
// his spreadsheet, 2026-06). Pipeline per day:
//
//   optimizeDay()  — greedy cheapest-first fill: protein $/g → fat $/g → kcal $/cal,
//                    inside per-food palatability bounds ("not too crazy" knobs)
//   fitItemsToTargets() — exact polish: 2×2 solve so the day lands ON the
//                    calorie target and protein anchor
//   scaleItem()    — rows shaped for food_entries, macros derived from rounded grams
//
// Fixed staples ride along every day before optimization: 1 scoop Gold Standard
// whey (macros from custom_foods) daily, 30 g Nutricost dextrose post-lift on
// training days.
//
// Meal slots assume an EARLY-MORNING lift:
//   timing "pre"  → fast carbs just before the lift (breakfast)
//   timing "post" → protein + carbs right after (anabolic window)
//   timing "anytime" → spread across the day
// Carb-cycling: on rest days the workout-timed carb foods get their ceiling
// halved (no pre/post fuel needed) and the dextrose is dropped.

const r1 = (n) => Math.round(n * 10) / 10;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ─── Food catalog ──────────────────────────────────────────────────────────────
// per100g: macros per 100 g in the LOGGED state (cooked where noted; cooking
// yield already applied to gramsPerUnit, e.g. ~1 lb raw chicken → ~340 g cooked).
// min/max: palatability bounds in grams per day — the "not too crazy" dials.
// Raise a min to force variety; lower a max to cap monotony.
// minServe: smallest portion worth cooking/plating — if the optimizer can't
// justify at least this much, the food is dropped entirely (no 20 g of pasta).
// step: foods eaten in whole units quantize to it (50 g = one egg, 22 g = one
// rice bar). Cost-per-100g is derived from the purchase unit so the optimizer
// and the shopping list can never disagree about price.
export const FOOD_CATALOG = [
  // role: protein | carb | fat | dairy | fruit | veg  (drives carb-cycling + fills)
  { food: "Bananas",               per100g: { cal: 89,  p: 1.1,  c: 22.8, f: 0.3 },  role: "fruit",   meal: "breakfast", timing: "pre",     min: 70, max: 140, minServe: 50,            purchase: { label: "lb",             gramsPerUnit: 453,  price: 0.50 } },
  { food: "Rice Bar",              per100g: { cal: 409, p: 4.5,  c: 77.3, f: 11.4 }, role: "carb",    meal: "breakfast", timing: "pre",     min: 0,  max: 44,  minServe: 22, step: 22,  purchase: { label: "8-count box",    gramsPerUnit: 176,  price: 2.78 } },
  { food: "Oats (Dry)",            per100g: { cal: 375, p: 12.5, c: 67.5, f: 6.3 },  role: "carb",    meal: "breakfast", timing: "post",    min: 0,  max: 120, minServe: 40,            purchase: { label: "42 oz",          gramsPerUnit: 1191, price: 4.18 } },
  { food: "Eggs",                  per100g: { cal: 140, p: 12.0, c: 0.0,  f: 10.0 }, role: "protein", meal: "breakfast", timing: "post",    min: 0,  max: 150, minServe: 50, step: 50,  purchase: { label: "12-count",       gramsPerUnit: 600,  price: 1.47 } },
  { food: "Egg Whites",            per100g: { cal: 44,  p: 10.0, c: 0.0,  f: 0.0 },  role: "protein", meal: "breakfast", timing: "post",    min: 0,  max: 300, minServe: 50,            purchase: { label: "32 oz carton",   gramsPerUnit: 907,  price: 4.87 } },
  { food: "Peanut Butter",         per100g: { cal: 656, p: 21.9, c: 18.8, f: 53.1 }, role: "fat",     meal: "breakfast", timing: "anytime", min: 0,  max: 60,  minServe: 16,            purchase: { label: "40 oz jar",      gramsPerUnit: 1134, price: 3.98 } },
  { food: "Chicken Breast",        per100g: { cal: 143, p: 26.2, c: 0.0,  f: 3.6 },  role: "protein", meal: "lunch",     timing: "anytime", min: 0,  max: 400, minServe: 100,           purchase: { label: "lb",             gramsPerUnit: 340,  price: 2.57 } },
  { food: "Turkey 90/10",          per100g: { cal: 202, p: 23.4, c: 0.0,  f: 10.7 }, role: "protein", meal: "lunch",     timing: "anytime", min: 0,  max: 250, minServe: 100,           purchase: { label: "1 lb roll",      gramsPerUnit: 341,  price: 4.94 } },
  { food: "Pasta (Cooked)",        per100g: { cal: 143, p: 5.0,  c: 29.3, f: 0.7 },  role: "carb",    meal: "lunch",     timing: "post",    min: 0,  max: 450, minServe: 100,           purchase: { label: "16 oz box",      gramsPerUnit: 1088, price: 0.98 } },
  { food: "Beef 85/15",            per100g: { cal: 289, p: 25.0, c: 0.0,  f: 20.2 }, role: "protein", meal: "dinner",    timing: "anytime", min: 0,  max: 250, minServe: 100,           purchase: { label: "3 lb patties",   gramsPerUnit: 1021, price: 15.96 } },
  { food: "Tilapia",               per100g: { cal: 107, p: 20.2, c: 0.0,  f: 1.8 },  role: "protein", meal: "dinner",    timing: "anytime", min: 0,  max: 250, minServe: 100,           purchase: { label: "1 lb frozen",    gramsPerUnit: 340,  price: 6.28 } },
  { food: "Salmon",                per100g: { cal: 155, p: 23.4, c: 0.0,  f: 6.0 },  role: "protein", meal: "dinner",    timing: "anytime", min: 0,  max: 250, minServe: 100,           purchase: { label: "2 lb frozen",    gramsPerUnit: 680,  price: 10.87 } },
  { food: "Potatoes",              per100g: { cal: 77,  p: 2.0,  c: 17.0, f: 0.0 },  role: "carb",    meal: "dinner",    timing: "anytime", min: 0,  max: 400, minServe: 150,           purchase: { label: "5 lb bag",       gramsPerUnit: 2268, price: 2.94 } },
  { food: "Cottage Cheese",        per100g: { cal: 81,  p: 11.5, c: 4.4,  f: 2.2 },  role: "dairy",   meal: "dinner",    timing: "anytime", min: 0,  max: 500, minServe: 100,           purchase: { label: "24 oz tub",      gramsPerUnit: 680,  price: 2.24 } },
  { food: "Greek Yogurt",          per100g: { cal: 59,  p: 10.0, c: 4.1,  f: 0.0 },  role: "dairy",   meal: "snack",     timing: "anytime", min: 0,  max: 300, minServe: 100,           purchase: { label: "32 oz tub",      gramsPerUnit: 907,  price: 2.94 }, creami: true },
  { food: "2% Milk",               per100g: { cal: 54,  p: 3.3,  c: 5.0,  f: 2.1 },  role: "dairy",   meal: "snack",     timing: "anytime", min: 0,  max: 500, minServe: 120,           purchase: { label: "half gallon",    gramsPerUnit: 1890, price: 1.98 }, creami: true },
  { food: "Strawberries (Frozen)", per100g: { cal: 36,  p: 0.4,  c: 9.3,  f: 0.0 },  role: "fruit",   meal: "snack",     timing: "anytime", min: 0,  max: 150, minServe: 50,            purchase: { label: "48 oz bag",      gramsPerUnit: 1361, price: 7.62 }, creami: true },
  { food: "Blueberries (Frozen)",  per100g: { cal: 57,  p: 0.0,  c: 13.6, f: 0.0 },  role: "fruit",   meal: "snack",     timing: "anytime", min: 0,  max: 150, minServe: 50,            purchase: { label: "16 oz bag",      gramsPerUnit: 454,  price: 3.12 }, creami: true },
  { food: "Cucumber",              per100g: { cal: 15,  p: 0.7,  c: 3.6,  f: 0.1 },  role: "veg",     meal: "snack",     timing: "anytime", min: 0,  max: 300, minServe: 100,           purchase: { label: "each",           gramsPerUnit: 300,  price: 0.85 } },
];

// Fixed daily staples — never optimized away. Whey macros from custom_foods
// (1 scoop = 31 g: 120 kcal / 24p / 3c / 1.5f). Dextrose from the Nutricost
// label. Tub/bag prices are estimates — adjust if off.
export const FIXED_ITEMS = [
  {
    food: "Gold Standard 100% Whey (Milk Chocolate)",
    grams: 31, per100g: { cal: 387, p: 77.4, c: 9.7, f: 4.8 },
    role: "protein", meal: "breakfast", timing: "post", creami: true,
    purchase: { label: "5 lb tub", gramsPerUnit: 2270, price: 79.98 },
  },
  {
    food: "Nutricost Dextrose",
    grams: 30, per100g: { cal: 375, p: 0, c: 94, f: 0 },
    role: "carb", meal: "breakfast", timing: "post", trainingOnly: true,
    purchase: { label: "10 lb bag", gramsPerUnit: 4540, price: 26.95 },
  },
];

const price100 = (f) => (f.purchase.price / f.purchase.gramsPerUnit) * 100;

const PURCHASE_BY_FOOD = Object.fromEntries(
  [...FOOD_CATALOG, ...FIXED_ITEMS].map((f) => [f.food, f.purchase])
);

// One plan item → a fully-scaled food_entries-shaped object (macros for the
// whole serving, grams in serving_size). `planned: true` flags it as a not-yet-
// eaten plan row so the log can render it as a check-off item.
// Grams are rounded FIRST and macros derived from the rounded grams, so the
// stored macros always match the serving the user sees (and day sums stay true).
export function scaleItem(item, { date, mealOverride } = {}) {
  const grams = Math.max(1, Math.round(item.portion * 100));
  const k = grams / 100;
  return {
    food_name: item.food,
    meal_type: mealOverride || item.meal,
    serving_size: grams,
    serving_unit: "g",
    calories: Math.round(item.per100g.cal * k),
    protein_grams: r1(item.per100g.p * k),
    carbs_grams: r1(item.per100g.c * k),
    fats_grams: r1(item.per100g.f * k),
    role: item.role,
    timing: item.timing,
    creami: !!item.creami,
    ...(date ? { date } : {}),
    planned: true,
  };
}

// ─── The optimizer ─────────────────────────────────────────────────────────────
// Greedy cheapest-first inside bounds, then a bounded repair loop — for this
// constraint shape (few targets, boxed portions) it tracks the LP optimum
// closely, stays explainable, and NEVER violates a palatability bound:
//   1. fixed staples + per-food minimums
//   2. protein anchor: raise the cheapest $-per-gram-protein foods first
//   3. fat floor:      raise the cheapest $-per-gram-fat foods first
//   4. calories:       fill the gap with the cheapest $-per-kcal carb/fruit/veg
//   5. repair loop:    priority calories > protein > fat — over-budget days
//                      shed pricey carbs then fat; protein shortfalls are
//                      re-filled with LEAN sources so a tight cut swaps fatty
//                      protein for egg whites/cottage instead of giving up
export function optimizeDay({
  calorieTarget,
  proteinTarget = null,
  fatTarget = null,
  trainingDay = true,
  restCarbFactor = 0.5,
  aggressiveCut = false,
} = {}) {
  const fixed = FIXED_ITEMS
    .filter((f) => trainingDay || !f.trainingOnly)
    .map((f) => ({ ...f, portion: f.grams / 100, fixed: true }));

  const vars = FOOD_CATALOG.map((f) => {
    const isTimedCarb = f.role === "carb" && f.timing !== "anytime";
    const maxG = trainingDay || !isTimedCarb ? f.max : f.max * restCarbFactor;
    return { ...f, portion: (f.min || 0) / 100, minPortion: (f.min || 0) / 100, maxPortion: maxG / 100, cost: price100(f) };
  });

  // Aggressive-cut carb policy: carbs are workout fuel ONLY. Pre-timed carbs
  // (banana, rice bar) survive on training days under a 300 kcal cap (the
  // banana minimum keeps the normal day ~100 kcal); everything else carb-roled
  // is off the menu, and rest days get no carb fuel at all. Remaining energy
  // comes from protein + fat + nutrient-dense food (dairy/veg/berries).
  if (aggressiveCut) {
    for (const it of vars) {
      const isPre = it.timing === "pre";
      if ((it.role === "carb" && !isPre) || (isPre && !trainingDay)) {
        it.portion = 0; it.minPortion = 0; it.maxPortion = 0;
      }
    }
    if (trainingDay) {
      let preBudget = 300;
      for (const it of vars
        .filter((v) => v.timing === "pre" && v.maxPortion > 0)
        .sort((x, y) => x.cost / x.per100g.cal - y.cost / y.per100g.cal)) {
        const allowed = Math.min(it.maxPortion * it.per100g.cal, preBudget);
        it.maxPortion = allowed / it.per100g.cal;
        preBudget -= allowed;
      }
    }
  }

  const total = (key) =>
    [...fixed, ...vars].reduce((s, it) => s + it.per100g[key] * it.portion, 0);

  // Raise portions of `candidates` (cheapest per unit of `key` first) until the
  // day's total for `key` reaches `target` or every candidate is at its ceiling.
  const raise = (key, target, candidates) => {
    if (!target) return;
    const ranked = candidates
      .filter((it) => it.per100g[key] > 0)
      .sort((x, y) => x.cost / x.per100g[key] - y.cost / y.per100g[key]);
    for (const it of ranked) {
      const gap = target - total(key);
      if (gap <= 0) return;
      it.portion = Math.min(it.maxPortion, it.portion + gap / it.per100g[key]);
    }
  };

  // Shed `key` down to `target`, dropping the most-expensive-per-unit candidates
  // first (saves the most money), never below a food's minimum.
  const lower = (key, target, candidates) => {
    const ranked = candidates
      .filter((it) => it.per100g[key] > 0)
      .sort((x, y) => y.cost / y.per100g[key] - x.cost / x.per100g[key]);
    for (const it of ranked) {
      const excess = total(key) - target;
      if (excess <= 0) return;
      it.portion = Math.max(it.minPortion, it.portion - excess / it.per100g[key]);
    }
  };

  // Energy fillers: on a normal day, cheap carbs; on an aggressive cut, the
  // "everything else comes from protein + fat + nutrient-dense food" set.
  const fillers = aggressiveCut
    ? vars.filter((it) => ["fat", "dairy", "veg"].includes(it.role) || (it.role === "fruit" && it.timing !== "pre"))
    : vars.filter((it) => ["carb", "fruit", "veg"].includes(it.role));
  const fats = vars.filter((it) => it.role === "fat" || it.per100g.f >= 5);
  // Lean = most of the food's calories are protein; what a tight cut swaps to.
  const lean = vars.filter((it) => it.per100g.p >= 8 && it.per100g.p * 4 >= it.per100g.cal * 0.55);

  // Trim fat sources for calories WITHOUT dropping total fat below the floor —
  // sustained low fat wrecks hormones and sleep, so fat holds while carbs and
  // (last of all) protein flex.
  const lowerFatsToFloor = (candidates) => {
    const ranked = candidates
      .filter((it) => it.per100g.f > 0)
      .sort((x, y) => y.cost / y.per100g.cal - x.cost / x.per100g.cal);
    for (const it of ranked) {
      const excess = total("cal") - calorieTarget;
      if (excess <= 0) return;
      const fatRoom = fatTarget ? Math.max(0, total("f") - fatTarget) : Infinity;
      const reduce = Math.min(
        it.portion - it.minPortion,
        excess / it.per100g.cal,
        fatRoom / it.per100g.f
      );
      if (reduce > 0) it.portion -= reduce;
    }
  };

  // Over-calorie shedding order — encodes "protein is the LAST thing cut":
  // energy fillers → fat down to its floor → fat below the floor → fatty
  // proteins. Lean protein is never a shed candidate.
  const shedCalories = (pool) => {
    lower("cal", calorieTarget, pool(fillers));
    if (total("cal") - calorieTarget > 10) lowerFatsToFloor(pool(fats));
    if (total("cal") - calorieTarget > 10) lower("cal", calorieTarget, pool(fats));
    if (total("cal") - calorieTarget > 10) {
      lower("cal", calorieTarget, pool(vars.filter((it) => it.per100g.p >= 8 && !lean.includes(it))));
    }
  };

  // 2–4: initial cheapest-first fill
  raise("p", proteinTarget, vars.filter((it) => it.per100g.p >= 8));
  raise("f", fatTarget, fats);
  raise("cal", calorieTarget, fillers);

  // 5: bounded repair — calories are the hard wall, protein second, fat floor
  // ahead of carbs but behind protein.
  for (let i = 0; i < 4; i++) {
    if (proteinTarget) raise("p", proteinTarget, lean);
    // Protein well past the anchor is money down the drain — shed the priciest
    // $-per-gram protein (meat before dairy) and let cheap fillers refill the kcal.
    if (proteinTarget && total("p") > proteinTarget + 8) {
      lower("p", proteinTarget + 4, vars.filter((it) => it.per100g.p >= 8 && it.role !== "carb"));
    }
    if (fatTarget && total("cal") < calorieTarget) raise("f", fatTarget, fats);
    const calGap = calorieTarget - total("cal");
    if (calGap > 10) raise("cal", calorieTarget, fillers);
    else if (calGap < -10) shedCalories((list) => list);
  }

  // ── Realism pass ─────────────────────────────────────────────────────────
  // Nobody cooks 20 g of pasta. If a food made the cut it gets at least its
  // minimum real serving; below half of that it's dropped and the calories go
  // elsewhere. Once included, a food can never be trimmed back under its
  // minimum serving.
  for (const it of vars) {
    const minServe = Math.min((it.minServe ?? 15) / 100, it.maxPortion);
    if (it.portion > 0 && it.portion < minServe) {
      it.portion = it.portion < minServe / 2 && it.minPortion === 0 ? 0 : minServe;
    }
    if (it.portion > 0) it.minPortion = Math.max(it.minPortion, minServe);
  }
  // Whole-unit foods (eggs, rice bars) snap to whole units and freeze so the
  // re-balance below can't split an egg.
  for (const it of vars) {
    if (!it.step || it.portion <= 0) continue;
    const step = it.step / 100;
    it.portion = clamp(Math.round(it.portion / step) * step, Math.max(step, it.minPortion), it.maxPortion);
    it.minPortion = it.maxPortion = it.portion;
  }

  // Re-true the day using ONLY foods already on the plate — same priority
  // order, but no new crumb-sized inclusions.
  const included = vars.filter((it) => it.portion > 0);
  const incFillers = included.filter((it) => fillers.includes(it));
  for (let i = 0; i < 3; i++) {
    if (proteinTarget) raise("p", proteinTarget, included.filter((it) => lean.includes(it)));
    const gap = calorieTarget - total("cal");
    if (gap > 10) raise("cal", calorieTarget, incFillers);
    else if (gap < -10) shedCalories((list) => list.filter((it) => included.includes(it)));
  }
  // Everything on the plate maxed and a real hole remains → admit ONE more
  // food, the cheapest filler that fits the gap at a full serving.
  const hole = calorieTarget - total("cal");
  if (hole > 60) {
    const add = fillers
      .filter((it) => it.portion === 0 && it.maxPortion > 0 && ((it.minServe ?? 15) / 100) * it.per100g.cal <= hole * 1.3)
      .sort((x, y) => x.cost / x.per100g.cal - y.cost / y.per100g.cal)[0];
    if (add) {
      add.minPortion = Math.max(add.minPortion, (add.minServe ?? 15) / 100);
      add.portion = clamp(hole / add.per100g.cal, add.minPortion, add.maxPortion);
      incFillers.push(add);
    }
  }

  // Exact-calorie polish: nudge the unfrozen filler item with the most slack in
  // either direction so the day lands on the target to within a few kcal.
  const residual = calorieTarget - total("cal");
  const nudge = incFillers
    .filter((it) => it.portion > 0 && it.maxPortion > it.minPortion)
    .sort((x, y) =>
      residual > 0
        ? (y.maxPortion - y.portion) - (x.maxPortion - x.portion)
        : (y.portion - y.minPortion) - (x.portion - x.minPortion)
    )[0];
  if (nudge) {
    nudge.portion = clamp(nudge.portion + residual / nudge.per100g.cal, nudge.minPortion, nudge.maxPortion);
  }

  return [...fixed, ...vars.filter((it) => it.portion > 0)];
}

// Full day → array of food_entries rows for `date`: the cheapest food mix that
// hits the engine's targets, fixed staples included. This is the "approve the
// plan → write the day into the log" payload; rows are flagged planned:true.
export function buildDayEntries({ date, trainingDay = true, calorieTarget, proteinTarget = null, fatTarget = null, aggressiveCut = false } = {}) {
  return optimizeDay({ calorieTarget, proteinTarget, fatTarget, trainingDay, aggressiveCut }).map((it) => scaleItem(it, { date }));
}

// Estimated grocery cost of generated rows, in dollars.
export function entriesCost(entryRows) {
  return entryRows.reduce((s, e) => {
    const u = PURCHASE_BY_FOOD[e.food_name];
    if (!u) return s;
    return s + (e.serving_size / u.gramsPerUnit) * u.price;
  }, 0);
}

// ─── Shopping list ───────────────────────────────────────────────────────────
// Roll generated plan rows up into a shopping list: total grams of each food
// across the planned days → number of purchase units to buy (rounded up) +
// estimated cost. Takes the SAME entry rows that approval writes to the log,
// so what you buy is exactly what you'll be checking off.
export function buildShoppingList(entryRows) {
  const grams = {};
  for (const e of entryRows) {
    grams[e.food_name] = (grams[e.food_name] || 0) + e.serving_size;
  }
  const items = Object.entries(grams)
    .map(([food, g]) => {
      const u = PURCHASE_BY_FOOD[food];
      if (!u) return { food, grams: Math.round(g), units: null, unitLabel: "g", cost: null };
      const units = Math.ceil(g / u.gramsPerUnit);
      // Cost is AMORTIZED to the grams actually eaten this week (g/unit × price),
      // not the shelf price of the units bought — a 5 lb whey tub lasts ~10 weeks
      // and would otherwise swamp the weekly number. `units` is still what to
      // grab at the store when the pantry runs out. Round to cents, not dimes —
      // cheap items like pasta otherwise display as $0.00.
      const cents = (n) => Math.round(n * 100) / 100;
      return { food, grams: Math.round(g), units, unitLabel: u.label, cost: cents((g / u.gramsPerUnit) * u.price) };
    })
    .sort((a, b) => (b.cost || 0) - (a.cost || 0));
  const totalCost = Math.round(items.reduce((s, i) => s + (i.cost || 0), 0) * 100) / 100;
  return { items, totalCost };
}
