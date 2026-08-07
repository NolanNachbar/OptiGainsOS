import { format } from "date-fns";

/**
 * Calculate total macros from an array of food entries
 * @param {Array} foodEntries - Array of food entry objects
 * @returns {Object} Object with calories, protein, carbs, and fats totals
 */
export function calculateMacros(foodEntries) {
  const totals = foodEntries.reduce((acc, entry) => ({
    calories: acc.calories + (entry.calories || 0),
    protein: acc.protein + (entry.protein_grams || 0),
    carbs: acc.carbs + (entry.carbs_grams || 0),
    fats: acc.fats + (entry.fats_grams || 0),
    // Null fiber means "unknown for this food", not zero — it still contributes
    // nothing to the total, but fiberEntries counts how many entries actually
    // reported it, so the caller can tell a real total from a partial one.
    fiber: acc.fiber + (entry.fiber_grams || 0),
    fiberEntries: acc.fiberEntries + (entry.fiber_grams != null ? 1 : 0),
    cost: acc.cost + (entry.cost_usd || 0),
  }), { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, fiberEntries: 0, cost: 0 });
  // Complete only when every entry reported fiber. An empty day counts as
  // complete — there's nothing missing from it.
  return { ...totals, fiberKnown: totals.fiberEntries === foodEntries.length };
}

/**
 * Get recent unique foods from food entries, sorted by most recent use
 * @param {Array} entries - All food entries for a user
 * @param {number} limit - Max number of unique foods to return
 * @returns {Array} Deduplicated foods with their latest macro values
 */
export function getRecentFoods(entries, limit = 10) {
  const sorted = [...entries].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );
  const foodMap = new Map();
  for (const entry of sorted) {
    if (!foodMap.has(entry.food_name)) {
      foodMap.set(entry.food_name, {
        food_name: entry.food_name,
        calories: entry.calories,
        protein_grams: entry.protein_grams,
        carbs_grams: entry.carbs_grams,
        fats_grams: entry.fats_grams,
        fiber_grams: entry.fiber_grams,
        meal_type: entry.meal_type,
        serving_size: entry.serving_size,
      });
    }
    if (foodMap.size >= limit) break;
  }
  return Array.from(foodMap.values());
}

/**
 * Aggregate daily calorie totals for a date range
 * @param {Array} entries - All food entries
 * @param {number} days - Number of past days to include
 * @returns {Array} Array of { date, calories, label } sorted oldest to newest
 */
export function getDailyCalorieTrend(entries, days = 7) {
  const today = new Date();
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = format(d, "yyyy-MM-dd");
    const dayEntries = entries.filter((e) => e.date === dateStr);
    const totalCal = dayEntries.reduce((sum, e) => sum + (e.calories || 0), 0);
    result.push({
      date: dateStr,
      calories: totalCal,
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
    });
  }
  return result;
}

export function calculateRecipeTotals(ingredients) {
  return ingredients.reduce(
    (acc, ing) => ({
      total_calories: acc.total_calories + (ing.calories || 0),
      total_protein: acc.total_protein + (ing.protein_grams || 0),
      total_carbs: acc.total_carbs + (ing.carbs_grams || 0),
      total_fats: acc.total_fats + (ing.fats_grams || 0),
    }),
    { total_calories: 0, total_protein: 0, total_carbs: 0, total_fats: 0 }
  );
}

export function scaleRecipeToServings(recipe, targetServings) {
  const scale = targetServings / (recipe.servings || 1);
  return {
    calories: Math.round(recipe.total_calories * scale),
    protein_grams: Math.round(recipe.total_protein * scale * 10) / 10,
    carbs_grams: Math.round(recipe.total_carbs * scale * 10) / 10,
    fats_grams: Math.round(recipe.total_fats * scale * 10) / 10,
  };
}

// Conversion factors to grams for unit-aware scaling
export const UNIT_TO_GRAMS = {
  g: 1,
  ml: 1,
  oz: 28.3495,
  lb: 453.592,
  cup: 240,
  tbsp: 15,
  tsp: 5,
  piece: 100,
  serving: 100,
};

// Units that mean "one of whatever this food comes in" rather than a fixed
// physical quantity. Their gram weight is a property of the food, not of the
// unit, so it has to come from the food's own serving_grams.
const SERVING_LIKE_UNITS = new Set(["serving", "serving(s)", "servings", "piece", "pieces"]);

export function isServingLikeUnit(unit) {
  return SERVING_LIKE_UNITS.has(String(unit || "").toLowerCase().trim());
}

/**
 * Normalize a food's portions into a { lowercased label -> grams } lookup.
 *
 * Accepts the array of rows from food_portions, an already-built map, or
 * null/undefined. Every helper below takes portions in any of those shapes so
 * callers never have to remember which one they're holding.
 */
export function portionsMap(portions) {
  if (!portions) return {};
  if (Array.isArray(portions)) {
    const map = {};
    for (const p of portions) {
      const label = String(p?.label || "").toLowerCase().trim();
      const grams = Number(p?.grams);
      if (label && Number.isFinite(grams) && grams > 0) map[label] = grams;
    }
    return map;
  }
  return portions;
}

/** Portion labels a food defines, in the order they should appear in a picker. */
export function portionLabels(portions) {
  if (Array.isArray(portions)) {
    return portions
      .filter((p) => p?.label && Number(p?.grams) > 0)
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((p) => String(p.label).toLowerCase().trim());
  }
  return Object.keys(portionsMap(portions));
}

/**
 * Grams for `amount` of `unit`, given the food's own serving weight.
 *
 * Returns null when the mass genuinely isn't knowable — a serving-like unit on a
 * food with no recorded serving weight, or a unit that isn't in the table. Callers
 * decide what to do with that; nothing here invents a 100 g serving.
 */
export function gramsForAmount(amount, unit, servingGrams, portions) {
  const qty = Number(amount);
  if (!Number.isFinite(qty)) return null;
  const u = String(unit || "").toLowerCase().trim();

  // A portion the food itself defines outranks everything below it. This is what
  // makes a food-specific "cup" beat the generic 240 g water constant.
  const portionGrams = Number(portionsMap(portions)[u]);
  if (Number.isFinite(portionGrams) && portionGrams > 0) return qty * portionGrams;

  if (isServingLikeUnit(u)) {
    const g = Number(servingGrams);
    return Number.isFinite(g) && g > 0 ? qty * g : null;
  }
  const factor = UNIT_TO_GRAMS[u];
  return factor == null ? null : qty * factor;
}

/** The quantity of `unit` that a food's stored base macros describe: 100 g/ml, else 1. */
export function baseQuantityForUnit(unit) {
  return ["g", "ml"].includes(String(unit || "").toLowerCase().trim()) ? 100 : 1;
}

/**
 * Scale factor from a food's stored base macros to `amount` of `unit`.
 *
 * Both sides are converted to grams whenever that's possible, so switching units
 * preserves mass. When the gram weight is unknown (an older custom food with no
 * serving_grams), it falls back to the plain quantity ratio, which is what the
 * app did before serving weights existed.
 */
export function scaleFromBase({ amount, unit, baseUnit, servingGrams, portions }) {
  const baseQty = baseQuantityForUnit(baseUnit);
  const targetGrams = gramsForAmount(amount, unit, servingGrams, portions);
  const baseGrams = gramsForAmount(baseQty, baseUnit, servingGrams, portions);
  if (targetGrams != null && baseGrams != null && baseGrams > 0) {
    return targetGrams / baseGrams;
  }
  return baseQty > 0 ? (Number(amount) || 0) / baseQty : 0;
}

const trimNumber = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  return String(Math.round(v * 100) / 100);
};

const formatGrams = (g) => `${Math.round(g * 10) / 10} g`;

/**
 * The line under the amount picker: what the selected unit actually weighs.
 * Returns null when there's nothing true to say.
 */
export function formatServingHint({ amount, unit, servingGrams, portions, household }) {
  const parts = [];
  const u = String(unit || "").toLowerCase().trim();
  const map = portionsMap(portions);
  const perUnit = gramsForAmount(1, u, servingGrams, map);
  const isNamedPortion = map[u] > 0;

  if (isServingLikeUnit(u) || isNamedPortion) {
    if (perUnit != null) {
      parts.push(`1 ${u} (${formatGrams(perUnit)})`);
      const total = gramsForAmount(amount, u, servingGrams, map);
      if (total != null && Number(amount) !== 1) {
        parts.push(`${trimNumber(amount)} ${u} = ${formatGrams(total)}`);
      }
    }
  } else if (u === "g" || u === "ml") {
    // In grams, the useful reminder is what the food's own portions weigh.
    const named = portionLabels(portions);
    if (named.length) {
      parts.push(named.map((l) => `1 ${l} (${formatGrams(map[l])})`).join(", "));
    } else {
      const g = Number(servingGrams);
      if (Number.isFinite(g) && g > 0) parts.push(`1 serving (${formatGrams(g)})`);
    }
  } else {
    const total = gramsForAmount(amount, u, servingGrams, map);
    if (total != null) parts.push(`${trimNumber(amount)} ${u} = ${formatGrams(total)}`);
  }

  if (household) parts.push(household);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * How a logged entry's amount reads in the day's list: "1 serving (62 g)".
 * The gram figure only appears for serving-like units, where it's the part the
 * unit alone can't tell you. Returns null when there's nothing worth showing.
 */
export function formatEntryServing(entry) {
  if (!entry || entry.serving_size == null) return null;
  const unit = entry.serving_unit ? ` ${entry.serving_unit}` : "";
  if (String(entry.serving_size) === "1" && !unit) return null;
  const base = `${entry.serving_size}${unit}`;
  const g = Number(entry.serving_grams);
  const u = String(entry.serving_unit || "").toLowerCase().trim();
  // Any unit that isn't already a weight gets its weight spelled out: servings,
  // pieces, and named portions like 'slice' all leave the mass unsaid otherwise.
  if (u !== "g" && u !== "ml" && Number.isFinite(g) && g > 0) {
    return `${base} (${formatGrams(g)})`;
  }
  return base;
}

/**
 * Scale ingredient macros based on stored base values, accounting for unit changes.
 * If currentUnit differs from the base unit, converts both to grams before computing ratio.
 */
export function rescaleIngredient(ingredient, newServingSize, currentUnit) {
  const baseServing = ingredient._base_serving_size || ingredient.serving_size;
  const baseUnit = ingredient._base_serving_unit || ingredient.serving_unit || "g";
  const unit = currentUnit || ingredient.serving_unit || "g";
  const servingGrams = ingredient._serving_grams ?? null;
  const portions = ingredient._portions ?? null;

  const newGrams =
    gramsForAmount(newServingSize, unit, servingGrams, portions) ??
    newServingSize * (UNIT_TO_GRAMS[unit] || 1);
  const baseGrams =
    gramsForAmount(baseServing, baseUnit, servingGrams, portions) ??
    baseServing * (UNIT_TO_GRAMS[baseUnit] || 1);
  const ratio = baseGrams > 0 ? newGrams / baseGrams : 0;

  return {
    ...ingredient,
    serving_size: newServingSize,
    calories: Math.round((ingredient._base_calories ?? ingredient.calories) * ratio),
    protein_grams: Math.round(((ingredient._base_protein ?? ingredient.protein_grams) * ratio) * 10) / 10,
    carbs_grams: Math.round(((ingredient._base_carbs ?? ingredient.carbs_grams) * ratio) * 10) / 10,
    fats_grams: Math.round(((ingredient._base_fats ?? ingredient.fats_grams) * ratio) * 10) / 10,
  };
}

/**
 * Remove internal _base_* fields before database persistence
 */
export function stripBaseFields(ingredient) {
  const { _base_serving_size, _base_serving_unit, _base_calories, _base_protein, _base_carbs, _base_fats, ...clean } = ingredient;
  return clean;
}

/**
 * Map a USDA search result to the ingredient shape with base fields for rescaling
 */
export function ingredientFromUSDA(food) {
  const servingSize = food.servingSize || 100;
  const servingUnit = food.servingSizeUnit?.toLowerCase() || "g";
  const calories = Math.round(food.calories);
  const protein = Math.round(food.protein * 10) / 10;
  const carbs = Math.round(food.carbs * 10) / 10;
  const fats = Math.round(food.fats * 10) / 10;
  return {
    food_name: food.description,
    serving_size: servingSize,
    serving_unit: servingUnit,
    calories,
    protein_grams: protein,
    carbs_grams: carbs,
    fats_grams: fats,
    _base_serving_size: servingSize,
    _base_serving_unit: servingUnit,
    _base_calories: calories,
    _base_protein: protein,
    _base_carbs: carbs,
    _base_fats: fats,
  };
}

export function recipeToFoodEntry(recipe, servingCount, mealType, date, userId) {
  const scaled = scaleRecipeToServings(recipe, servingCount);
  return {
    food_name: `${recipe.name} (Recipe)`,
    meal_type: mealType,
    serving_size: parseFloat(servingCount) || 1,
    serving_unit: "serving(s)",
    calories: scaled.calories,
    protein_grams: scaled.protein_grams,
    carbs_grams: scaled.carbs_grams,
    fats_grams: scaled.fats_grams,
    date,
    created_by: userId,
  };
}
