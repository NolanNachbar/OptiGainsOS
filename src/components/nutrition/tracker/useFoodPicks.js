import { isServingLikeUnit } from "@/utils/nutritionUtils";

// Extracted from FoodTracker.jsx (no behavior change).
export function useFoodPicks({ customFoods, newFood, portionsByFood, setActiveFoodId, setActivePortions, setBaseMacros, setBaseUnit, setBrandedResults, setEstimateMeta, setFoodServingSizeGrams, setFoodSource, setGenericResults, setIsEstimatedFood, setIsUsdaFood, setNewFood, setPortionsDirty, setSearchQuery, setServingHint }) {
  const selectRecentFood = (entry) => {
    // 1. Determine original amount and unit from the entry's serving_size string/number
    const servingStr = String(entry.serving_size || "");
    const parts = servingStr.split(' ');
    const originalAmount = parseFloat(parts[0]) || (typeof entry.serving_size === 'number' ? entry.serving_size : 1);
    const originalUnit = parts.slice(1).join(' ') || entry.serving_unit || 'serving';

    // 2. Calculate the scale factor the entry used (per 100g for mass/volume, or per unit)
    const originalScale = ['g', 'ml'].includes(originalUnit) ? originalAmount / 100 : originalAmount;
    const safeScale = originalScale > 0 ? originalScale : 1;

    // 3. Normalize macros to "per 100g/ml" or "per 1 unit" so they can be re-scaled safely
    const baseMacroValues = {
      calories: Math.round((entry.calories || 0) / safeScale),
      protein_grams: Math.round(((entry.protein_grams || 0) / safeScale) * 10) / 10,
      carbs_grams: Math.round(((entry.carbs_grams || 0) / safeScale) * 10) / 10,
      fats_grams: Math.round(((entry.fats_grams || 0) / safeScale) * 10) / 10,
      fiber_grams: entry.fiber_grams == null
        ? null
        : Math.round(((entry.fiber_grams || 0) / safeScale) * 10) / 10,
    };

    // Grams per single unit, recovered from the total weight the entry recorded.
    const perUnitGrams =
      entry.serving_grams > 0 && originalAmount > 0 && isServingLikeUnit(originalUnit)
        ? entry.serving_grams / originalAmount
        : null;

    setFoodServingSizeGrams(perUnitGrams);
    setBaseUnit(originalUnit);
    setIsUsdaFood(false);
    setServingHint(null);
    setBaseMacros(baseMacroValues);
    // A logged entry doesn't carry the food's portion list; if the same food is
    // saved in My Foods, pick its portions back up by name.
    const savedMatch = customFoods.find(
      (f) => f.food_name.toLowerCase() === String(entry.food_name || "").toLowerCase()
    );
    setActiveFoodId(savedMatch?.id || null);
    setActivePortions(savedMatch ? (portionsByFood[savedMatch.id] || []) : []);
    setPortionsDirty(false);
    setFoodSource(savedMatch?.source || "manual");
    setEstimateMeta(null);
    setNewFood({
      ...newFood,
      food_name: entry.food_name,
      serving_unit: originalUnit,
      serving_amount: originalAmount,
      calories: Math.round(entry.calories) || 0,
      protein_grams: entry.protein_grams || 0,
      carbs_grams: entry.carbs_grams || 0,
      fats_grams: entry.fats_grams || 0,
      fiber_grams: entry.fiber_grams ?? null,
    });
    setGenericResults([]); setBrandedResults([]);
    setSearchQuery("");
  };

  const selectCustomFood = (food) => {
    // Custom foods store macros per 'serving_size' units. Normalize to per-100 or per-1.
    const originalAmount = food.serving_size || 1;
    const originalUnit = food.serving_unit || "serving";
    
    const originalScale = ['g', 'ml'].includes(originalUnit) ? originalAmount / 100 : originalAmount;
    const safeScale = originalScale > 0 ? originalScale : 1;

    const baseMacroValues = {
      calories: Math.round((food.calories || 0) / safeScale),
      protein_grams: Math.round(((food.protein_grams || 0) / safeScale) * 10) / 10,
      carbs_grams: Math.round(((food.carbs_grams || 0) / safeScale) * 10) / 10,
      fats_grams: Math.round(((food.fats_grams || 0) / safeScale) * 10) / 10,
      fiber_grams: food.fiber_grams == null
        ? null
        : Math.round(((food.fiber_grams || 0) / safeScale) * 10) / 10,
    };

    // What one serving of this food weighs, if it was ever recorded. Null stays
    // null: the picker then offers grams and says nothing it can't back up.
    const savedServingGrams = Number(food.serving_grams);
    setFoodServingSizeGrams(
      Number.isFinite(savedServingGrams) && savedServingGrams > 0 ? savedServingGrams : null
    );
    setBaseUnit(originalUnit);
    setIsUsdaFood(false);
    setServingHint(null);
    setBaseMacros(baseMacroValues);
    // Saved foods carry their tag; synthetic ones (estimates) pass it in.
    setFoodSource(food.source || "manual");
    setEstimateMeta(null);
    // Synthetic foods (AI estimates, label scans) have no row yet — no id, and
    // no portions until the athlete saves them to My Foods.
    setActiveFoodId(food.id || null);
    setActivePortions(food.id ? (portionsByFood[food.id] || []) : []);
    setPortionsDirty(false);

    // Set default amount: 100 for g/ml, otherwise 1
    const defaultAmount = ['g', 'ml'].includes(originalUnit) ? 100 : 1;
    const defaultScale = 1; // 100 of a per-100 food, or 1 of a per-1 food

    setNewFood({
      ...newFood,
      food_name: food.food_name,
      serving_unit: originalUnit,
      serving_amount: defaultAmount,
      calories: Math.round(baseMacroValues.calories * defaultScale),
      protein_grams: Math.round(baseMacroValues.protein_grams * defaultScale * 10) / 10,
      carbs_grams: Math.round(baseMacroValues.carbs_grams * defaultScale * 10) / 10,
      fats_grams: Math.round(baseMacroValues.fats_grams * defaultScale * 10) / 10,
      fiber_grams: baseMacroValues.fiber_grams,
    });
    setGenericResults([]); setBrandedResults([]);
    setSearchQuery("");
    setIsEstimatedFood(false);
  };

  return { selectCustomFood, selectRecentFood };
}
