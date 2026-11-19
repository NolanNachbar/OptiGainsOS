import { isServingLikeUnit, gramsForAmount, baseQuantityForUnit, formatServingHint, portionLabels, portionsMap, scaleFromBase } from "@/utils/nutritionUtils";
import { getTodayString } from "@/utils/dateUtils";
import { useMemo } from "react";
import { GENERIC_UNITS, getDefaultMealType } from "@/components/nutrition/tracker/shared";
import { toast } from "sonner";

// Extracted from FoodTracker.jsx (no behavior change).
export function useFoodForm({ activeFoodId, activePortions, baseUnit, customFoods, foodServingSizeGrams, newFood, portionDraft, portionsByFood, portionsUnavailable, rollDateForwardRef, servingHint, setActiveFoodId, setActivePortions, setBaseMacros, setBaseUnit, setBrandedResults, setEditingEntry, setEstimateMeta, setFoodServingSizeGrams, setFoodSource, setGenericResults, setIsEstimatedFood, setIsUsdaFood, setLoggingMode, setNewFood, setPortionDraft, setPortionsDirty, setPortionsExpanded, setSearchQuery, setSelectedDate, setServingHint, setShowAddDialog, syncPortions }) {
  const startEditEntry = (entry) => {
    // Handle both string ("300 g") and numeric (300) serving_size from DB
    const servingStr = String(entry.serving_size || "");
    const parts = servingStr.split(' ');
    const amount = parseFloat(parts[0]) || (typeof entry.serving_size === 'number' ? entry.serving_size : 1);
    const unit = parts.slice(1).join(' ') || entry.serving_unit || 'serving';
    
    const scale = ['g', 'ml'].includes(unit) ? amount / 100 : amount;
    const safeScale = scale > 0 ? scale : 1;
    const baseMacroValues = {
      calories: Math.round((entry.calories || 0) / safeScale),
      protein_grams: Math.round(((entry.protein_grams || 0) / safeScale) * 10) / 10,
      carbs_grams: Math.round(((entry.carbs_grams || 0) / safeScale) * 10) / 10,
      fats_grams: Math.round(((entry.fats_grams || 0) / safeScale) * 10) / 10,
      fiber_grams: entry.fiber_grams == null
        ? null
        : Math.round(((entry.fiber_grams || 0) / safeScale) * 10) / 10,
    };
    setIsUsdaFood(false);
    setBaseUnit(unit);
    const savedMatch = customFoods.find(
      (f) => f.food_name.toLowerCase() === String(entry.food_name || "").toLowerCase()
    );
    setActiveFoodId(savedMatch?.id || null);
    setActivePortions(savedMatch ? (portionsByFood[savedMatch.id] || []) : []);
    setPortionsDirty(false);
    setFoodSource(savedMatch?.source || "manual");
    setEstimateMeta(null);
    // Recover grams-per-unit from the total weight the entry recorded, so editing
    // a logged serving still shows what it weighs.
    setFoodServingSizeGrams(
      entry.serving_grams > 0 && amount > 0 && isServingLikeUnit(unit)
        ? entry.serving_grams / amount
        : null
    );
    setServingHint(null);
    setBaseMacros(baseMacroValues);
    setNewFood({
      food_name: entry.food_name,
      meal_type: entry.meal_type,
      serving_amount: amount,
      serving_unit: unit,
      calories: entry.calories || 0,
      protein_grams: entry.protein_grams || 0,
      carbs_grams: entry.carbs_grams || 0,
      fats_grams: entry.fats_grams || 0,
      fiber_grams: entry.fiber_grams ?? null,
    });
    setSelectedDate(entry.date || getTodayString());
    setEditingEntry(entry);
    setShowAddDialog(true);
  };

  // Switching the unit on the logging form.
  //
  // When the weight of one unit is known on both sides, the food itself doesn't
  // change — only how it's described — so the amount is restated to preserve mass.
  // When it isn't (a custom food with no recorded serving weight), no honest
  // conversion exists, so the stored base macros are rebased onto the new unit and
  // the totals on screen stay put for the athlete to correct.
  const changeServingUnit = (value) => {
    if (value === newFood.serving_unit) return;
    const amount = parseFloat(newFood.serving_amount) || 0;
    const fromPerUnit = gramsForAmount(1, newFood.serving_unit, foodServingSizeGrams, activePortions);
    const toPerUnit = gramsForAmount(1, value, foodServingSizeGrams, activePortions);

    if (fromPerUnit != null && toPerUnit > 0) {
      const newAmount = Math.round(((amount * fromPerUnit) / toPerUnit) * 100) / 100;
      setNewFood(prev => ({ ...prev, serving_unit: value, serving_amount: newAmount }));
      return;
    }

    // Land on the quantity the new unit is naturally described in (100 g, or 1 of
    // anything else) so the amount, the totals and the "per X" label all agree.
    const newAmount = baseQuantityForUnit(value);
    setBaseMacros({
      calories: Math.round(parseFloat(newFood.calories) || 0),
      protein_grams: Math.round((parseFloat(newFood.protein_grams) || 0) * 10) / 10,
      carbs_grams: Math.round((parseFloat(newFood.carbs_grams) || 0) * 10) / 10,
      fats_grams: Math.round((parseFloat(newFood.fats_grams) || 0) * 10) / 10,
      fiber_grams: newFood.fiber_grams == null
        ? null
        : Math.round((parseFloat(newFood.fiber_grams) || 0) * 10) / 10,
    });
    setBaseUnit(value);
    setNewFood(prev => ({ ...prev, serving_unit: value, serving_amount: newAmount }));
  };

  // "1 serving (62 g)" under the amount picker. Null when there's nothing
  // truthful to say about what the selected unit weighs.
  const servingEquivalence = formatServingHint({
    amount: parseFloat(newFood.serving_amount) || 0,
    unit: newFood.serving_unit,
    servingGrams: foodServingSizeGrams,
    portions: activePortions,
    household: servingHint,
  });

  // Portion labels this food defines, offered as units in the picker.
  const activePortionLabels = useMemo(() => portionLabels(activePortions), [activePortions]);
  const activePortionMap = useMemo(() => portionsMap(activePortions), [activePortions]);
  // The generic units, minus any the food has already redefined — a food that
  // says "cup = 130 g" must not also offer the 240 g water constant under the
  // same name, and two SelectItems can't share a value anyway.
  const genericUnitOptions = useMemo(
    () => GENERIC_UNITS.filter((u) => !activePortionMap[u.value]),
    [activePortionMap]
  );
  const showServingLikeUnits =
    foodServingSizeGrams > 0 || isServingLikeUnit(newFood.serving_unit) || isServingLikeUnit(baseUnit);

  // Portions live in local state until the food is saved (syncPortions flushes
  // them once there's an id), so they can be typed before the food exists. Once
  // the food does exist, every edit writes straight through — a portion is a
  // property of the food, not of the entry being logged, so it shouldn't wait on
  // whether this particular log gets submitted.
  const persistPortions = (next) => {
    // Without a trustworthy read of what's already stored, a write would
    // reconcile against a list that only looks empty and delete real rows.
    if (portionsUnavailable) {
      toast.error("Can't load this food's portions right now, so they can't be edited yet.");
      return;
    }
    setActivePortions(next);
    setPortionsDirty(true);
    if (activeFoodId) {
      syncPortions(activeFoodId, next)
        .catch((e) => toast.error(`Couldn't save the portion: ${e.message}`));
    }
  };

  const addPortionDraft = () => {
    const label = String(portionDraft.label || "").trim().toLowerCase();
    const grams = parseFloat(portionDraft.grams);
    if (!label) return toast.error("Name the portion first (slice, loaf, scoop…)");
    if (!Number.isFinite(grams) || grams <= 0) return toast.error("Portion needs a gram weight");
    if (activePortionMap[label]) return toast.error(`"${label}" is already a portion of this food`);
    persistPortions([...activePortions, { label, grams, sort_order: activePortions.length }]);
    setPortionDraft({ label: "", grams: "" });
  };

  const removePortion = (label) => {
    const target = String(label).toLowerCase();
    persistPortions(activePortions.filter((p) => String(p.label).toLowerCase() !== target));
    // Logging in a unit that no longer exists would silently lose its gram
    // weight, so fall back to grams.
    if (String(newFood.serving_unit).toLowerCase() === target) changeServingUnit("g");
  };

  // Scale from the stored base macros to what's currently on screen. Shared by
  // the macro inputs so a typed total converts back to a base value correctly.
  const currentScale = scaleFromBase({
    amount: parseFloat(newFood.serving_amount) || 0,
    unit: newFood.serving_unit,
    baseUnit,
    servingGrams: foodServingSizeGrams,
    portions: activePortions,
  });

  const resetForm = () => {
    rollDateForwardRef.current();
    setNewFood({
      food_name: "",
      meal_type: getDefaultMealType(),
      serving_amount: 1,
      serving_unit: "serving",
      calories: 0,
      protein_grams: 0,
      carbs_grams: 0,
      fats_grams: 0,
      fiber_grams: null,
    });
    setBaseMacros({ calories: 0, protein_grams: 0, carbs_grams: 0, fats_grams: 0, fiber_grams: null });
    setFoodServingSizeGrams(null);
    setBaseUnit("serving");
    setServingHint(null);
    setIsUsdaFood(false);
    setActivePortions([]);
    setPortionsDirty(false);
    setActiveFoodId(null);
    setPortionDraft({ label: "", grams: "" });
    setPortionsExpanded(false);
    setSearchQuery("");
    setLoggingMode("now");
    setGenericResults([]); setBrandedResults([]);
    setEditingEntry(null);
    setIsEstimatedFood(false);
    setFoodSource(null);
    setEstimateMeta(null);
  };

  const selectFood = (food) => {
    setIsEstimatedFood(false);
    setEstimateMeta(null);
    setFoodSource(food.dataType === "Barcode" ? "barcode" : "usda");
    // baseMacros always stored per 100g (USDA/barcode nutrient basis)
    const baseMacroValues = {
      calories: Math.round(food.calories),
      protein_grams: Math.round(food.protein * 10) / 10,
      carbs_grams: Math.round(food.carbs * 10) / 10,
      fats_grams: Math.round(food.fats * 10) / 10,
      // USDA reports fiber for most foods; null when it doesn't.
      fiber_grams: food.fiber == null ? null : Math.round(food.fiber * 10) / 10,
    };
    // MacroFactor-style defaults: when the food has a real serving size,
    // start at "1 serving" (the hint shows its gram equivalent + household
    // text like "2/3 cup (55g)"). Without one, fall back to 100 g/ml.
    const hasRealServing = !!food.servingSize;
    const servingG = food.servingSize || null;
    const fallbackUnit = food.servingSizeUnit === 'ml' ? 'ml' : 'g';
    const unit = hasRealServing ? 'serving' : fallbackUnit;
    const amount = hasRealServing ? 1 : 100;
    const initialScale = (hasRealServing ? servingG : 100) / 100;

    // Null when USDA has no serving data. The picker then stays on grams and the
    // "serving" option is hidden, rather than quietly calling 100 g a serving.
    setFoodServingSizeGrams(servingG);
    setBaseUnit('g');
    setServingHint(food.householdServing || null);
    setIsUsdaFood(true);
    setBaseMacros(baseMacroValues);
    setActiveFoodId(null);
    setActivePortions([]);
    setPortionsDirty(false);
    setNewFood({
      ...newFood,
      food_name: food.description.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
      serving_unit: unit,
      serving_amount: amount,
      calories: Math.round(baseMacroValues.calories * initialScale),
      protein_grams: Math.round(baseMacroValues.protein_grams * initialScale * 10) / 10,
      carbs_grams: Math.round(baseMacroValues.carbs_grams * initialScale * 10) / 10,
      fats_grams: Math.round(baseMacroValues.fats_grams * initialScale * 10) / 10,
      fiber_grams: baseMacroValues.fiber_grams == null
        ? null
        : Math.round(baseMacroValues.fiber_grams * initialScale * 10) / 10,
    });
    setGenericResults([]); setBrandedResults([]);
    setSearchQuery("");
  };

  return { activePortionLabels, activePortionMap, addPortionDraft, changeServingUnit, currentScale, genericUnitOptions, removePortion, resetForm, selectFood, servingEquivalence, showServingLikeUnits, startEditEntry };
}
