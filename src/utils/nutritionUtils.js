import { format } from "date-fns";

/**
 * Calculate total macros from an array of food entries
 * @param {Array} foodEntries - Array of food entry objects
 * @returns {Object} Object with calories, protein, carbs, and fats totals
 */
export function calculateMacros(foodEntries) {
  return foodEntries.reduce((acc, entry) => ({
    calories: acc.calories + (entry.calories || 0),
    protein: acc.protein + (entry.protein_grams || 0),
    carbs: acc.carbs + (entry.carbs_grams || 0),
    fats: acc.fats + (entry.fats_grams || 0),
  }), { calories: 0, protein: 0, carbs: 0, fats: 0 });
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

/**
 * Scale ingredient macros based on stored base values, accounting for unit changes.
 * If currentUnit differs from the base unit, converts both to grams before computing ratio.
 */
export function rescaleIngredient(ingredient, newServingSize, currentUnit) {
  const baseServing = ingredient._base_serving_size || ingredient.serving_size;
  const baseUnit = ingredient._base_serving_unit || ingredient.serving_unit || "g";
  const unit = currentUnit || ingredient.serving_unit || "g";

  const newGrams = newServingSize * (UNIT_TO_GRAMS[unit] || 1);
  const baseGrams = baseServing * (UNIT_TO_GRAMS[baseUnit] || 1);
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
    serving_size: `${servingCount} serving(s)`,
    calories: scaled.calories,
    protein_grams: scaled.protein_grams,
    carbs_grams: scaled.carbs_grams,
    fats_grams: scaled.fats_grams,
    date,
    created_by: userId,
  };
}
