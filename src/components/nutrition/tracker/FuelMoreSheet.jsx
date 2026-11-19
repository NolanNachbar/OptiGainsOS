import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UtensilsCrossed, Plus, Search, Loader2, ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import MealTemplates, { SaveAsTemplateDialog } from "@/components/nutrition/MealTemplates";
import RecipeBuilder from "@/components/nutrition/RecipeBuilder";
import MealPlanIdeas from "@/components/nutrition/MealPlanIdeas";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { FOOD_SOURCE_LABELS } from "@/utils/foodLog";
import { MacroResultLine, FavoriteToggle } from "@/components/nutrition/tracker/shared";
import { isServingLikeUnit } from "@/utils/nutritionUtils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import StatsSetupModal from "@/components/nutrition/StatsSetupModal";

// Extracted from FoodTracker.jsx (no behavior change).
export default function FuelMoreSheet({ activePortionLabels, activePortionMap, addCurrentFoodToMeal, baseMacros, brandedResults, changeServingUnit, foodServingSizeGrams, fuzzyFallback, genericResults, genericUnitOptions, handleSaveMealTemplate, isSearching, matchingCustomFoods, mealItems, mealTemplateType, mealTotals, newFood, removeMealItem, resetForm, searchQuery, searchRef, selectCustomFood, selectFood, servingEquivalence, setBaseMacros, setFoodServingSizeGrams, setMealItems, setMealTemplateType, setNewFood, setSearchQuery, setShowBranded, setShowMoreSheet, setShowNewMealDialog, setShowNewRecipe, setShowSaveTemplateDialog, setShowStatsModal, setSidebarTab, setTemplateEntries, setTemplateMealType, showBranded, showMoreSheet, showNewMealDialog, showNewRecipe, showSaveTemplateDialog, showServingLikeUnits, showStatsModal, sidebarTab, targets, templateEntries, templateMealType, toggleFavoriteFoodMutation, user }) {
  return (
    <>
      {/* ─── Mobile "More" sheet: Templates · Recipes · Meal-plan ideas ─── */}
      <Dialog open={showMoreSheet} onOpenChange={setShowMoreSheet}>
        <DialogContent className="max-w-xl flex flex-col p-0 overflow-hidden lg:hidden"
          style={{ maxHeight: 'calc(100dvh - var(--layout-header-height, 0px) - var(--dock-clearance))' }}>
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-charcoal-border shrink-0">
            <DialogTitle>Plan &amp; templates</DialogTitle>
          </DialogHeader>
          <div className="shrink-0 flex border-b border-charcoal-border">
            {[
              { id: 'templates', label: 'Templates' },
              { id: 'recipes',   label: 'Recipes' },
              { id: 'ideas',     label: 'Meal ideas' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSidebarTab(tab.id)}
                className={`flex-1 min-h-[44px] text-caption font-semibold uppercase tracking-wider border-b-2 transition-colors duration-200 [transition-timing-function:var(--ease)] ${
                  sidebarTab === tab.id ? 'border-brand/60 text-brand' : 'border-transparent text-ink-muted'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-5" style={{ WebkitOverflowScrolling: 'touch' }}>
            {sidebarTab === 'templates' && (
              <>
                <button
                  type="button"
                  onClick={() => { setShowMoreSheet(false); resetForm(); setMealItems([]); setMealTemplateType("lunch"); setShowNewMealDialog(true); }}
                  className="w-full min-h-[44px] cta-ghost"
                >
                  <UtensilsCrossed className="w-4 h-4" />
                  Build New Meal
                </button>
                <MealTemplates compact />
              </>
            )}
            {sidebarTab === 'recipes' && (
              <div className="space-y-2">
                <div className="flex justify-end">
                  <button onClick={() => setShowNewRecipe(true)} className="flex items-center gap-1 text-caption font-semibold text-brand uppercase tracking-widest min-h-[44px] px-1">
                    <Plus className="w-3 h-3" />New recipe
                  </button>
                </div>
                <RecipeBuilder compact showCreateDialog={showNewRecipe} onCreateDialogChange={setShowNewRecipe} />
              </div>
            )}
            {sidebarTab === 'ideas' && (
              <MealPlanIdeas
                calorieGoal={targets.calories}
                proteinGoal={targets.protein}
                carbsGoal={targets.carbs}
                fatsGoal={targets.fats}
                aggressiveCut={targets.aggressiveCut}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

        {showNewMealDialog && (
  <Dialog
    open={showNewMealDialog}
    onOpenChange={(open) => {
  setShowNewMealDialog(open);
  if (!open) {
    resetForm();
    setMealItems([]);
    setMealTemplateType("lunch");
  }
}}
  >
    <DialogContent className="max-w-2xl flex flex-col p-0 overflow-hidden">
      <DialogHeader className="px-6 pt-6 pb-4 border-b border-charcoal-border shrink-0">
        <DialogTitle>Build New Meal</DialogTitle>
      </DialogHeader>

      <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-4 space-y-6" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="grid grid-cols-1 gap-4">
  

          <div>
            <Label>Meal Type</Label>
            <Select value={mealTemplateType} onValueChange={setMealTemplateType}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="breakfast">Breakfast</SelectItem>
                <SelectItem value="lunch">Lunch</SelectItem>
                <SelectItem value="dinner">Dinner</SelectItem>
                <SelectItem value="snack">Snack</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="meal-search">Search USDA Database</Label>
          <div className="relative mt-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
            <Input
  id="meal-search"
  ref={searchRef}
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
  placeholder="Search for a food..."
  className="pl-10"
/>
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted spin-loop" />
            )}
          </div>

          {fuzzyFallback && (genericResults.length > 0 || brandedResults.length > 0) && (
            <p className="mt-1.5 text-caption text-ink-muted px-1">Showing approximate results for "{searchQuery}"</p>
          )}
          {(matchingCustomFoods.length > 0 || genericResults.length > 0) && (
            <div className="mt-2 md:max-h-56 md:overflow-y-auto border border-charcoal-border rounded-lg bg-charcoal-surface divide-y divide-charcoal-border">
              {matchingCustomFoods.length > 0 && (
                <>
                  <div className="section-label px-3 py-1.5 bg-charcoal-elevated sticky top-0">My Foods</div>
                  {matchingCustomFoods.map((food) => (
                    <div key={food.id} className="flex items-center hover:bg-charcoal-elevated transition-colors duration-200 [transition-timing-function:var(--ease)]">
                      <button onClick={() => selectCustomFood(food)} className="flex-1 text-left px-4 py-3 min-h-[44px]">
                        <div className="font-medium text-ink text-body">{food.food_name}{FOOD_SOURCE_LABELS[food.source] && <span className="ml-1.5 text-caption font-normal text-ink-muted">{FOOD_SOURCE_LABELS[food.source]}</span>}</div>
                        <MacroResultLine cal={food.calories} p={food.protein_grams} c={food.carbs_grams} f={food.fats_grams} />
                      </button>
                      <FavoriteToggle food={food} onToggle={toggleFavoriteFoodMutation.mutate} />
                    </div>
                  ))}
                </>
              )}
              {genericResults.length > 0 && (
                <>
                  <div className="px-3 py-1.5 bg-charcoal-elevated text-caption font-semibold text-ink-muted sticky top-0">Generic Foods</div>
                  {genericResults.map((food) => (
                    <button key={food.fdcId} onClick={() => selectFood(food)} className="w-full text-left px-4 py-3 min-h-[44px] hover:bg-charcoal-elevated transition-colors duration-200 [transition-timing-function:var(--ease)]">
                      <div className="font-medium text-ink text-body">{food.description}</div>
                      <MacroResultLine cal={food.calories} p={food.protein} c={food.carbs} f={food.fats} per100g />
                    </button>
                  ))}
                </>
              )}
              {brandedResults.length > 0 && (
                <>
                  <button type="button" onClick={() => setShowBranded(v => !v)} className="w-full px-3 py-1.5 bg-charcoal-elevated text-caption font-semibold text-ink-muted flex items-center justify-between hover:bg-charcoal-surface2 transition-colors duration-200 [transition-timing-function:var(--ease)] sticky top-0">
                    <span>Branded ({brandedResults.length})</span>
                    {showBranded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  {showBranded && brandedResults.map((food) => (
                    <button key={food.fdcId} onClick={() => selectFood(food)} className="w-full text-left px-4 py-3 min-h-[44px] hover:bg-charcoal-elevated transition-colors duration-200 [transition-timing-function:var(--ease)]">
                      <div className="font-medium text-ink text-body">{food.description}</div>
                      {food.brandOwner && <div className="text-caption text-ink-muted">{food.brandOwner}</div>}
                      <MacroResultLine cal={food.calories} p={food.protein} c={food.carbs} f={food.fats} />
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <div className="border border-charcoal-border rounded-lg p-4 space-y-4 bg-charcoal-surface/50">
          <div>
            <Label>Food Name</Label>
            <Input
              value={newFood.food_name}
              onChange={(e) => setNewFood({ ...newFood, food_name: e.target.value })}
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Amount</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="number" inputMode="decimal"
                  value={newFood.serving_amount}
                  onChange={(e) =>
                    setNewFood({
                      ...newFood,
                      serving_amount: e.target.value,
                    })
                  }
                  min="0"
                  step="0.5"
                  className="w-24"
                />
                <Select
                  value={newFood.serving_unit}
                  onValueChange={changeServingUnit}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activePortionLabels.map((label) => (
                      <SelectItem key={label} value={label}>
                        {label} ({activePortionMap[label]}g)
                      </SelectItem>
                    ))}
                    {showServingLikeUnits && !activePortionMap.serving && (
                      <SelectItem value="serving">serving(s)</SelectItem>
                    )}
                    {showServingLikeUnits && !activePortionMap.piece && (
                      <SelectItem value="piece">piece(s)</SelectItem>
                    )}
                    {genericUnitOptions.map((u) => (
                      <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {servingEquivalence && (
                <p className="font-technical text-caption font-semibold text-ink-faint mt-1">{servingEquivalence}</p>
              )}
            </div>
            {isServingLikeUnit(newFood.serving_unit) && (
              <div>
                <Label>Weight of 1 {newFood.serving_unit} (g)</Label>
                <Input
                  type="number" inputMode="decimal"
                  placeholder="e.g. 62"
                  value={foodServingSizeGrams ?? ""}
                  onChange={(e) => {
                    const g = parseFloat(e.target.value);
                    setFoodServingSizeGrams(e.target.value === "" || !Number.isFinite(g) || g <= 0 ? null : g);
                  }}
                  className="mt-1"
                  min="0"
                  step="1"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Calories</Label>
              <Input
                type="number" inputMode="decimal"
                value={baseMacros.calories}
                onChange={(e) =>
                  setBaseMacros({ ...baseMacros, calories: e.target.value })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label>Protein (g)</Label>
              <Input
                type="number" inputMode="decimal"
                value={baseMacros.protein_grams}
                onChange={(e) =>
                  setBaseMacros({ ...baseMacros, protein_grams: e.target.value })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label>Carbs (g)</Label>
              <Input
                type="number" inputMode="decimal"
                value={baseMacros.carbs_grams}
                onChange={(e) =>
                  setBaseMacros({ ...baseMacros, carbs_grams: e.target.value })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label>Fats (g)</Label>
              <Input
                type="number" inputMode="decimal"
                value={baseMacros.fats_grams}
                onChange={(e) =>
                  setBaseMacros({ ...baseMacros, fats_grams: e.target.value })
                }
                className="mt-1"
              />
            </div>
          </div>

          <Button
            type="button"
            onClick={addCurrentFoodToMeal}
            disabled={!newFood.food_name}
            variant="volt" className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Food to Meal
          </Button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-ink">Meal Items</h3>
            <Badge variant="secondary">{mealItems.length} items</Badge>
          </div>

          {mealItems.length === 0 ? (
            <div className="text-body text-ink-muted border border-charcoal-border rounded-lg p-4">
              No foods added yet.
            </div>
          ) : (
            <div className="space-y-2">
              {mealItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-2 p-3 glass-inset"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-body text-ink truncate">{item.food_name}</div>
                    <div className="text-caption text-ink-muted font-technical tabular-nums">{item.serving_size}</div>
                    {/* Shared hue strip — kcal=gold, P=coral, C=carb, F=fat. */}
                    <MacroResultLine cal={item.calories} p={item.protein_grams} c={item.carbs_grams} f={item.fats_grams} />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeMealItem(item.id)}
                    aria-label="Remove item"
                    className="shrink-0 flex items-center justify-center min-w-[44px] min-h-[44px] -my-1 text-ink-muted hover:text-bad transition-colors duration-200 [transition-timing-function:var(--ease)]"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Running total — neutral glass-inset with the shared hue strip
              (kcal=gold, P=coral, C=carb, F=fat), not teal (teal is the action
              color, never a decorative total fill). */}
          {mealItems.length > 0 && (
            <div className="glass-inset p-3 flex items-center justify-between gap-2">
              <span className="section-label shrink-0">Total</span>
              <MacroResultLine
                cal={mealTotals.calories}
                p={mealTotals.protein_grams}
                c={mealTotals.carbs_grams}
                f={mealTotals.fats_grams}
              />
            </div>
          )}
        </div>
      </div>

      <div className="px-6 py-4 border-t bg-charcoal-surface shrink-0">
        <Button
          onClick={handleSaveMealTemplate}
          disabled={mealItems.length === 0}
          variant="volt" className="w-full"
        >
          Save Meal Template
        </Button>
      </div>
    </DialogContent>
  </Dialog>
)}
        {showSaveTemplateDialog && (
          <SaveAsTemplateDialog
            open={showSaveTemplateDialog}
            onOpenChange={(open) => {
              setShowSaveTemplateDialog(open);
              if (!open) {
                setTemplateEntries([]);
                setTemplateMealType(null);
              }
            }}
            entries={templateEntries}
            mealType={templateMealType}
            userId={user.id}
          />
        )}

      {showStatsModal && (
        <StatsSetupModal
          open={showStatsModal}
          onOpenChange={setShowStatsModal}
        />
      )}
    </>
  );
}
