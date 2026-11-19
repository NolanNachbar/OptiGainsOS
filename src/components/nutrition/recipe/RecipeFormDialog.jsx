import { useState, useEffect, useRef } from "react";
import { db } from "@/api/supabaseClient";
import { searchFoods } from "@/api/usda";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateRecipes } from "@/lib/queryKeys";
import { calculateRecipeTotals, rescaleIngredient, stripBaseFields, ingredientFromUSDA } from "@/utils/nutritionUtils";
import { useAllFoodEntries, useCustomFoods, useFoodPortions } from "@/hooks/useUserQueries";
import { getRecentFoods } from "@/utils/nutritionUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Plus, Search, Loader2, Minus, X, ArrowLeft, ArrowRight, Clock, PenLine, Star } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { stepVariants, STEP_TRANSITION, StickyMacroBar, FoodSearchResult, CollapsibleFoodSection, ManualIngredientForm, SYSTEM_EASE, IngredientCard } from "@/components/nutrition/recipe/RecipeParts";

export function RecipeFormDialog({ open, onOpenChange, recipe, userId }) {
  const queryClient = useQueryClient();
  const searchRef = useRef(null);
  const isEditing = !!recipe;

  // Wizard state
  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState(1);

  // Step 1 fields
  const [name, setName] = useState(recipe?.name || "");
  const [description, setDescription] = useState(recipe?.description || "");
  const [servings, setServings] = useState(recipe?.servings || 1);

  // Step 2 fields
  const initIngredients = (recipe?.ingredients || []).map((ing) => ({
    ...ing,
    _base_serving_size: ing._base_serving_size ?? ing.serving_size,
    _base_serving_unit: ing._base_serving_unit ?? ing.serving_unit ?? "g",
    _base_calories: ing._base_calories ?? ing.calories,
    _base_protein: ing._base_protein ?? ing.protein_grams,
    _base_carbs: ing._base_carbs ?? ing.carbs_grams,
    _base_fats: ing._base_fats ?? ing.fats_grams,
  }));
  const [ingredients, setIngredients] = useState(initIngredients);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);

  // Recent foods & custom foods
  const { allFoodEntries } = useAllFoodEntries();
  const recentFoods = getRecentFoods(allFoodEntries, 8);
  const { customFoods } = useCustomFoods();
  const { portionsByFood } = useFoodPortions();

  // Filter custom foods when searching
  const matchingCustomFoods = searchQuery.length >= 2
    ? customFoods.filter((f) =>
        f.food_name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  // Debounced USDA search
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchFoods(searchQuery);
        setSearchResults(results);
      } catch {
        toast.error("Food search failed. Check your connection and try again.");
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Focus search on step 2
  useEffect(() => {
    if (currentStep === 2) {
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [currentStep]);

  const addIngredientFromUSDA = (food) => {
    setIngredients((prev) => [...prev, ingredientFromUSDA(food)]);
    setSearchQuery("");
    setSearchResults([]);
  };

  const addRecentFood = (recentFood) => {
    const servingSize = parseFloat(recentFood.serving_size) || 100;
    setIngredients((prev) => [
      ...prev,
      {
        food_name: recentFood.food_name,
        serving_size: servingSize,
        serving_unit: "g",
        calories: Math.round(recentFood.calories),
        protein_grams: Math.round(recentFood.protein_grams * 10) / 10,
        carbs_grams: Math.round(recentFood.carbs_grams * 10) / 10,
        fats_grams: Math.round(recentFood.fats_grams * 10) / 10,
        _base_serving_size: servingSize,
        _base_serving_unit: "g",
        _base_calories: recentFood.calories,
        _base_protein: recentFood.protein_grams,
        _base_carbs: recentFood.carbs_grams,
        _base_fats: recentFood.fats_grams,
      },
    ]);
  };

  const addManualIngredient = (ingredient) => {
    setIngredients((prev) => [...prev, ingredient]);
  };

  const addCustomFood = (food) => {
    setIngredients((prev) => [
      ...prev,
      {
        food_name: food.food_name,
        serving_size: food.serving_size || 1,
        serving_unit: food.serving_unit || "serving",
        // Carried so rescaling a serving-based ingredient to grams is exact
        // rather than falling back to the 100 g-per-serving assumption.
        _serving_grams: food.serving_grams ?? null,
        // The food's own named portions, so rescaling a "slice" here uses this
        // food's 62 g rather than the generic table (which has no slice at all).
        _portions: portionsByFood[food.id] || [],
        calories: Math.round(food.calories),
        protein_grams: Math.round((food.protein_grams || 0) * 10) / 10,
        carbs_grams: Math.round((food.carbs_grams || 0) * 10) / 10,
        fats_grams: Math.round((food.fats_grams || 0) * 10) / 10,
        _base_serving_size: food.serving_size || 1,
        _base_serving_unit: food.serving_unit || "serving",
        _base_calories: food.calories,
        _base_protein: food.protein_grams || 0,
        _base_carbs: food.carbs_grams || 0,
        _base_fats: food.fats_grams || 0,
      },
    ]);
    setSearchQuery("");
    setSearchResults([]);
  };

  const removeIngredient = (index) => {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  };

  const updateIngredientServing = (index, newAmount) => {
    const parsed = parseFloat(newAmount);
    setIngredients((prev) =>
      prev.map((ing, i) => {
        if (i !== index) return ing;
        // Show the raw string while typing; only rescale when there's a valid number
        return isNaN(parsed)
          ? { ...ing, serving_size: newAmount }
          : rescaleIngredient(ing, parsed, ing.serving_unit);
      })
    );
  };

  const updateIngredientUnit = (index, newUnit) => {
    setIngredients((prev) =>
      prev.map((ing, i) => {
        if (i !== index) return ing;
        // Rescale macros for the new unit with the same numeric amount
        const updated = rescaleIngredient(ing, ing.serving_size, newUnit);
        return { ...updated, serving_unit: newUnit };
      })
    );
  };

  const goToStep = (step) => {
    setDirection(step > currentStep ? 1 : -1);
    setCurrentStep(step);
  };

  // Mutations
  const createRecipeMutation = useMutation({
    mutationFn: (data) => db.entities.Recipe.create(data),
    onSuccess: () => {
      invalidateRecipes(queryClient);
      toast.success("Recipe created");
      onOpenChange(false);
    },
    onError: () => toast.error("Recipe not saved. Check your connection and try again."),
  });

  const updateRecipeMutation = useMutation({
    mutationFn: ({ id, ...data }) => db.entities.Recipe.update(id, data),
    onSuccess: () => {
      invalidateRecipes(queryClient);
      toast.success("Recipe updated");
      onOpenChange(false);
    },
    onError: () => toast.error("Recipe not updated. Check your connection and try again."),
  });

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Recipe name is required");
      goToStep(1);
      return;
    }
    if (ingredients.length === 0) {
      toast.error("Add at least one ingredient");
      return;
    }

    const cleanIngredients = ingredients.map(stripBaseFields);
    const totals = calculateRecipeTotals(cleanIngredients);
    const data = {
      name: name.trim(),
      servings,
      ingredients: cleanIngredients,
      // The recipes table's columns are calories/protein_grams/carbs_grams/
      // fats_grams, not calculateRecipeTotals()'s total_* keys (which stay
      // total_* because the on-screen totals above read that shape).
      calories: totals.total_calories,
      protein_grams: totals.total_protein,
      carbs_grams: totals.total_carbs,
      fats_grams: totals.total_fats,
      created_by: userId,
    };

    if (isEditing) {
      updateRecipeMutation.mutate({ id: recipe.id, ...data });
    } else {
      createRecipeMutation.mutate(data);
    }
  };

  const isSaving = createRecipeMutation.isPending || updateRecipeMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${currentStep === 2 ? "max-w-2xl" : "max-w-md"} w-full max-h-[88dvh] sm:max-h-[75vh] sm:my-8 flex flex-col overflow-hidden p-0 min-h-0`} hideClose>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b">
          <div className="flex items-center gap-3">
            {currentStep === 2 && (
              <button
                onClick={() => goToStep(1)}
                className="h-11 w-11 flex items-center justify-center -ml-2 rounded-full text-ink-muted hover:text-ink hover:bg-[var(--glass-edge)] transition-colors duration-200 [transition-timing-function:var(--ease)]"
                aria-label="Back to details"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <DialogTitle>
                {isEditing ? "Edit Recipe" : "Create Recipe"}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex gap-1.5">
                  <div
                    className={`h-1.5 w-8 rounded-full transition-colors duration-300 [transition-timing-function:var(--ease)] ${
                      currentStep >= 1
                        ? "bg-brand"
                        : "bg-track"
                    }`}
                  />
                  <div
                    className={`h-1.5 w-8 rounded-full transition-colors duration-300 [transition-timing-function:var(--ease)] ${
                      currentStep >= 2
                        ? "bg-brand"
                        : "bg-track"
                    }`}
                  />
                </div>
                <span className="text-caption text-ink-muted">
                  {currentStep === 1 ? "Details" : "Ingredients"}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="h-11 w-11 flex items-center justify-center -mr-2 rounded-full text-ink-muted hover:text-ink hover:bg-[var(--glass-edge)] transition-colors duration-200 [transition-timing-function:var(--ease)]"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
          <AnimatePresence mode="wait" custom={direction}>
            {currentStep === 1 ? (
              <motion.div
                key="step-1"
                custom={direction}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={STEP_TRANSITION}
                className="flex-1 flex flex-col min-h-0"
              >
                <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5">
                  <div className="max-w-md mx-auto space-y-5">
                    <div>
                      <Label htmlFor="recipe-name" className="text-body font-medium">
                        Recipe Name *
                      </Label>
                      <Input
                        id="recipe-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g., Chicken Stir Fry"
                        className="mt-1.5 h-11"
                        autoFocus
                      />
                    </div>

                    <div>
                      <Label htmlFor="recipe-desc" className="text-body font-medium">
                        Description
                      </Label>
                      <Input
                        id="recipe-desc"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Optional, e.g., Quick weeknight dinner"
                        className="mt-1.5 h-11"
                      />
                    </div>

                    <div>
                      <Label className="text-body font-medium">Servings</Label>
                      <div className="flex items-center gap-3 mt-1.5">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setServings(Math.max(1, servings - 1))}
                          disabled={servings <= 1}
                          className="h-11 w-11 rounded-xl"
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        <Input
                          type="number" inputMode="numeric"
                          value={servings}
                          onChange={(e) => setServings(Math.max(1, parseInt(e.target.value) || 1))}
                          min="1"
                          className="w-20 h-11 text-center text-title font-semibold font-technical tabular-nums"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setServings(servings + 1)}
                          className="h-11 w-11 rounded-xl"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 1 footer */}
                <div
                  className="px-6 py-4 border-t bg-charcoal-surface/50"
                  style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
                >
                  <Button
                    variant="volt"
                    onClick={() => {
                      if (!name.trim()) {
                        toast.error("Recipe name is required");
                        return;
                      }
                      goToStep(2);
                    }}
                    className="w-full h-11 text-body"
                  >
                    Next: Add Ingredients
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="step-2"
                custom={direction}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={STEP_TRANSITION}
                className="flex-1 flex flex-col min-h-0"
              >
                <div className="flex-1 overflow-y-auto min-h-0">
                  {/* Sticky macro bar */}
                  <StickyMacroBar ingredients={ingredients} servings={servings} />

                  <div className="px-6 py-4 space-y-4">
                    {/* Search or Manual Entry */}
                    <div>
                      {!showManualEntry ? (
                        <>
                          <div className="relative">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
                            <Input
                              ref={searchRef}
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              placeholder="Search foods to add..."
                              className="pl-10 h-11 rounded-xl glass glass-interactive focus:bg-charcoal-surface"
                            />
                            {isSearching && (
                              <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand spin-loop" />
                            )}
                          </div>

                          {/* Search results: custom foods first, then USDA */}
                          {(matchingCustomFoods.length > 0 || searchResults.length > 0) && (
                            <div className="mt-2 max-h-64 overflow-y-auto border rounded-xl bg-charcoal-surface">
                              {matchingCustomFoods.map((food) => (
                                <FoodSearchResult
                                  key={"custom-" + food.id}
                                  food={food}
                                  onClick={() => addCustomFood(food)}
                                  icon={<Star className="w-3.5 h-3.5 fill-gold text-gold" />}
                                />
                              ))}
                              {matchingCustomFoods.length > 0 && searchResults.length > 0 && (
                                <div className="px-4 py-1.5 bg-charcoal-surface text-caption font-medium text-ink-muted uppercase tracking-wide">
                                  USDA Database
                                </div>
                              )}
                              {searchResults.map((food) => (
                                <FoodSearchResult
                                  key={food.fdcId}
                                  food={food}
                                  onClick={() => addIngredientFromUSDA(food)}
                                  icon={<Search className="w-3.5 h-3.5" />}
                                />
                              ))}
                            </div>
                          )}

                          {/* My Foods + Recent foods (when not searching) */}
                          {searchQuery.length < 2 && searchResults.length === 0 && (
                            <>
                              {customFoods.length > 0 && (
                                <CollapsibleFoodSection
                                  label="My Foods"
                                  icon={<Star className="w-3.5 h-3.5 fill-gold text-gold" />}
                                  count={customFoods.length}
                                >
                                  {customFoods.map((food) => (
                                    <FoodSearchResult
                                      key={"my-" + food.id}
                                      food={food}
                                      onClick={() => addCustomFood(food)}
                                      icon={<Star className="w-3.5 h-3.5 fill-gold text-gold" />}
                                    />
                                  ))}
                                </CollapsibleFoodSection>
                              )}

                              {recentFoods.length > 0 && (
                                <CollapsibleFoodSection
                                  label="Recent Foods"
                                  icon={<Clock className="w-3.5 h-3.5 text-ink-muted" />}
                                  count={recentFoods.length}
                                >
                                  {recentFoods.map((food, i) => (
                                    <FoodSearchResult
                                      key={food.food_name + i}
                                      food={food}
                                      onClick={() => addRecentFood(food)}
                                      icon={<Clock className="w-3.5 h-3.5" />}
                                    />
                                  ))}
                                </CollapsibleFoodSection>
                              )}
                            </>
                          )}

                          {/* Manual entry toggle */}
                          <div className="flex justify-center mt-3">
                            <button
                              onClick={() => setShowManualEntry(true)}
                              className="flex items-center justify-center gap-1.5 min-h-[44px] px-3 text-caption font-medium text-ink-muted hover:text-brand transition-colors duration-200 [transition-timing-function:var(--ease)]"
                            >
                              <PenLine className="w-3.5 h-3.5" />
                              or add manually from label
                            </button>
                          </div>
                        </>
                      ) : (
                        <ManualIngredientForm
                          onAdd={addManualIngredient}
                          onCancel={() => setShowManualEntry(false)}
                          userId={userId}
                        />
                      )}
                    </div>

                    {/* Ingredients list */}
                    {ingredients.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-body font-semibold text-ink">
                            Ingredients
                          </span>
                          <Badge variant="secondary" className="text-caption">
                            {ingredients.length}
                          </Badge>
                        </div>
                        <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                          <AnimatePresence>
                            {ingredients.map((ing, index) => (
                              <motion.div
                                key={ing.food_name + index}
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2, ease: SYSTEM_EASE }}
                              >
                                <IngredientCard
                                  ingredient={ing}
                                  index={index}
                                  onUpdateServing={updateIngredientServing}
                                  onUpdateUnit={updateIngredientUnit}
                                  onRemove={removeIngredient}
                                />
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </div>
                      </div>
                    )}

                    {ingredients.length === 0 && (
                      <div className="text-center py-8">
                        <Search className="w-10 h-10 text-ink-muted mx-auto mb-3" />
                        <p className="text-body text-ink-muted">
                          Search above to start adding ingredients
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 2 footer */}
                <div
                  className="px-6 pt-4 pb-6 border-t bg-charcoal-surface/50 flex-shrink-0"
                  style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
                >
                  <Button
                    variant="volt"
                    onClick={handleSave}
                    disabled={isSaving || ingredients.length === 0}
                    className="w-full h-11 text-body"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 spin-loop" />
                        Saving...
                      </>
                    ) : isEditing ? (
                      "Update Recipe"
                    ) : (
                      "Save Recipe"
                    )}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
