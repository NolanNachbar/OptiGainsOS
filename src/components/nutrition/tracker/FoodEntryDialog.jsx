import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { format } from "date-fns";
import { Sparkles, Camera, Search, Loader2, Star, ChevronUp, ChevronDown, Plus, Upload, HelpCircle, Trash2, AlertTriangle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FOOD_SOURCE_LABELS } from "@/utils/foodLog";
import { MacroResultLine, FavoriteToggle, QUICK_ADD_NAME, LoggingModeToggle } from "@/components/nutrition/tracker/shared";
import { formatEntryServing, isServingLikeUnit } from "@/utils/nutritionUtils";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

// Extracted from FoodTracker.jsx (no behavior change).
export default function FoodEntryDialog({ activeFoodId, activePortionLabels, activePortionMap, activePortions, addFoodMutation, addPortionDraft, baseMacros, baseUnit, brandedResults, buildCustomFoodPayload, changeServingUnit, currentScale, customFoods, editingEntry, estimateFood, estimateInput, estimateMeta, foodServingSizeGrams, fuzzyFallback, genericResults, genericUnitOptions, handleImportFoodsCSV, isEstimatedFood, isEstimating, isSearching, isUsdaFood, loggingMode, macroCalcWarning, manualExpanded, matchingCustomFoods, myFoodsExpanded, newFood, portionDraft, portionsExpanded, quickRelogFood, recentExpanded, recentFoods, removePortion, resetForm, resetMealEstimator, saveCustomFoodMutation, searchError, searchQuery, searchRef, selectCustomFood, selectFood, selectRecentFood, selectedDate, servingEquivalence, setBaseMacros, setEstimateInput, setFoodServingSizeGrams, setLoggingMode, setManualExpanded, setMyFoodsExpanded, setNewFood, setPortionDraft, setPortionsExpanded, setRecentExpanded, setSearchError, setSearchQuery, setSearchRetry, setShowAddDialog, setShowBarcodeScanner, setShowBranded, setShowFoodFormatGuide, setShowMealEstimator, showAddDialog, showBranded, showServingLikeUnits, sortedCustomFoods, toggleFavoriteFoodMutation, updateFoodMutation }) {
  return (
    <>
      {/* ─── Add / Edit Food Dialog ─── */}
      {showAddDialog && (
        <Dialog open={showAddDialog} onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) {
            resetForm();
          }
        }}>
          <DialogContent sheetMinHeight="min-h-[85dvh]" className="max-w-lg flex flex-col p-0 overflow-hidden">
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-charcoal-border shrink-0">
              <DialogTitle>{editingEntry ? "Edit Food Entry" : "Add Food Entry"}</DialogTitle>
              <DialogDescription>
                Logging to <span className="font-technical font-semibold text-ink tabular-nums">{format(new Date(selectedDate + 'T00:00:00'), 'EEE, MMM d')}</span>
              </DialogDescription>
            </DialogHeader>

              <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-4 space-y-4" style={{ WebkitOverflowScrolling: 'touch' }}>
                {/* Quick-meal: describe or photograph a whole meal and split it
                    into items. Sits above search as the fast path for travel /
                    restaurants where weighing each item isn't possible. */}
                {!editingEntry && (
                  <button
                    type="button"
                    onClick={() => { resetMealEstimator(); setShowMealEstimator(true); }}
                    className="w-full flex items-center gap-2.5 rounded-lg border border-charcoal-border bg-charcoal-elevated px-4 py-3 text-left hover:bg-[var(--glass-bg)] transition-colors min-h-[44px]"
                  >
                    <Sparkles className="w-4 h-4 text-brand shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold text-ink">Log a whole meal</span>
                      <span className="block text-[11px] text-ink-muted">Describe it or snap a photo — splits into items</span>
                    </span>
                    <Camera className="w-4 h-4 text-ink-muted shrink-0" />
                  </button>
                )}
                {!editingEntry && (
                <div>
                  <Label htmlFor="search">Search USDA Database</Label>
                  <div className="flex gap-2 mt-1">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
                      <Input
                        id="search"
                        ref={searchRef}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search for a food..."
                        className="pl-10 pr-3"
                      />
                      {isSearching && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted spin-loop" />
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="dim"
                      size="lg"
                      onClick={() => setShowBarcodeScanner(true)}
                      className="shrink-0 min-w-[44px]"
                      aria-label="Scan barcode"
                      title="Scan a barcode"
                    >
                      <Camera className="w-4 h-4" />
                      <span className="text-xs font-medium">Scan</span>
                    </Button>
                  </div>

                      {/* Search results: My Foods → Generic → Branded */}
                      {fuzzyFallback && (genericResults.length > 0 || brandedResults.length > 0) && (
                        <p className="mt-1.5 text-xs text-ink-muted px-1">Showing approximate results for "{searchQuery}"</p>
                      )}
                      {(matchingCustomFoods.length > 0 || genericResults.length > 0) && (
                        /* add-food-dialog-4: cap the results list on MOBILE too
                           (max-h-[50vh] + scroll), not just md+, so a long result
                           set never pushes the manual-entry/AI paths off-screen. */
                        <div className="mt-2 max-h-[50vh] md:max-h-64 overflow-y-auto overscroll-contain border border-charcoal-border rounded-lg bg-charcoal-surface divide-y divide-charcoal-border">
                          {/* My saved foods */}
                          {matchingCustomFoods.length > 0 && (
                            <>
                              <div className="section-label px-3 py-1.5 bg-charcoal-elevated flex items-center gap-1 sticky top-0">
                                <Star className="w-3 h-3" /> My Foods
                              </div>
                              {matchingCustomFoods.map((food) => (
                                <div key={food.id} className="flex items-center hover:bg-charcoal-elevated transition-colors duration-200 [transition-timing-function:var(--ease)]">
                                  <button onClick={() => selectCustomFood(food)} className="flex-1 text-left px-4 py-3 min-h-[44px]">
                                    <div className="font-medium text-ink text-sm">{food.food_name}{FOOD_SOURCE_LABELS[food.source] && <span className="ml-1.5 text-[11px] font-normal text-ink-muted">{FOOD_SOURCE_LABELS[food.source]}</span>}</div>
                                    <MacroResultLine cal={food.calories} p={food.protein_grams} c={food.carbs_grams} f={food.fats_grams} />
                                  </button>
                                  <FavoriteToggle food={food} onToggle={toggleFavoriteFoodMutation.mutate} />
                                </div>
                              ))}
                            </>
                          )}
                          {/* Generic whole foods (Foundation + SR Legacy) */}
                          {genericResults.length > 0 && (
                            <>
                              <div className="px-3 py-1.5 bg-charcoal-elevated text-xs font-semibold text-ink-muted sticky top-0">
                                Generic Foods
                              </div>
                              {genericResults.map((food) => (
                                <button key={food.fdcId} onClick={() => selectFood(food)} className="w-full text-left px-4 py-3 min-h-[44px] hover:bg-charcoal-elevated transition-colors duration-200 [transition-timing-function:var(--ease)]">
                                  <div className="font-medium text-ink text-sm">{food.description}</div>
                                  <MacroResultLine cal={food.calories} p={food.protein} c={food.carbs} f={food.fats} per100g />
                                </button>
                              ))}
                            </>
                          )}
                          {/* Branded foods — collapsed by default */}
                          {brandedResults.length > 0 && (
                            <>
                              <button
                                type="button"
                                onClick={() => setShowBranded(v => !v)}
                                className="w-full px-3 py-1.5 bg-charcoal-elevated text-xs font-semibold text-ink-muted flex items-center justify-between sticky top-0 hover:bg-charcoal-surface2 transition-colors duration-200 [transition-timing-function:var(--ease)]"
                              >
                                <span>Branded Foods ({brandedResults.length})</span>
                                {showBranded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                              {showBranded && brandedResults.map((food) => (
                                <button key={food.fdcId} onClick={() => selectFood(food)} className="w-full text-left px-4 py-3 min-h-[44px] hover:bg-charcoal-elevated transition-colors duration-200 [transition-timing-function:var(--ease)]">
                                  <div className="font-medium text-ink text-sm">{food.description}</div>
                                  {food.brandOwner && <div className="text-xs text-ink-muted">{food.brandOwner}</div>}
                                  <MacroResultLine cal={food.calories} p={food.protein} c={food.carbs} f={food.fats} />
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      )}

                      {/* add-food-dialog-1 + -2: a query that returns nothing renders
                          an INLINE neutral-glass message (no spectrum color), with a
                          forward action pointing at the AI "describe it" path so a
                          dead-end search still moves the athlete forward.
                          When the USDA proxy errors out, show an inline error block
                          with a Retry button instead of the "No matches" message —
                          the two states are mutually exclusive. */}
                      {searchQuery.length >= 2 && !isSearching
                        && matchingCustomFoods.length === 0
                        && genericResults.length === 0
                        && brandedResults.length === 0 && (
                        searchError ? (
                          <div className="mt-2 glass-inset px-4 py-3 text-center space-y-2">
                            <p className="text-xs text-ink-secondary">
                              Could not reach the food database.
                            </p>
                            <Button
                              type="button"
                              variant="outline"
                              size="lg"
                              className="w-full min-h-[44px]"
                              onClick={() => {
                                setSearchError(false);
                                setSearchRetry(n => n + 1);
                              }}
                            >
                              Retry
                            </Button>
                          </div>
                        ) : (
                          <div className="mt-2 glass-inset px-4 py-3 text-center space-y-2">
                            <p className="text-xs text-ink-secondary">
                              No matches for <span className="text-ink font-semibold">"{searchQuery}"</span>.
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setEstimateInput(searchQuery);
                                document.getElementById("ai-estimate")?.focus();
                              }}
                              className="w-full min-h-[44px] cta-ghost active:scale-[0.99] transition-transform duration-200 [transition-timing-function:var(--ease)]"
                            >
                              <Sparkles className="w-4 h-4" />
                              Estimate it with AI instead
                            </button>
                          </div>
                        )
                      )}
                    </div>
                    )}

                    {/* When not searching and no food selected: show Recent Foods + My Foods */}
                    {searchQuery.length < 2 && !newFood.food_name && (
                      <div className="space-y-2">
                        {recentFoods.length > 0 && (
                          <div className="border border-charcoal-border rounded-lg overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setRecentExpanded(!recentExpanded)}
                              className="w-full px-3 min-h-[44px] py-2 bg-charcoal-elevated text-xs font-semibold text-ink-muted flex items-center justify-between hover:bg-charcoal-surface2 transition-colors duration-200 [transition-timing-function:var(--ease)]"
                            >
                              <span>Recent</span>
                              {recentExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                            {recentExpanded && recentFoods.map((entry, i) => (
                              <div key={i} className="flex items-stretch border-b border-charcoal-border last:border-b-0">
                                <button onClick={() => selectRecentFood(entry)} className="flex-1 min-w-0 text-left px-4 py-3 min-h-[44px] hover:bg-charcoal-elevated transition-colors duration-200 [transition-timing-function:var(--ease)]">
                                  <div className="font-medium text-ink text-sm">{entry.food_name}</div>
                                  {/* add-food-dialog-3: never render a bare "1" — show
                                      the amount WITH its unit, or omit when there's no
                                      unit and the amount is the meaningless default 1. */}
                                  {formatEntryServing(entry) && (
                                    <div className="text-[11px] text-ink-muted font-technical tabular-nums">{formatEntryServing(entry)}</div>
                                  )}
                                  <MacroResultLine cal={entry.calories} p={entry.protein_grams} c={entry.carbs_grams} f={entry.fats_grams} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => quickRelogFood(entry)}
                                  disabled={addFoodMutation.isPending}
                                  aria-label={`Log ${entry.food_name} again with the same portion`}
                                  className="w-[44px] shrink-0 flex items-center justify-center min-h-[44px] text-ink-muted hover:text-brand hover:bg-charcoal-elevated transition-colors duration-200 [transition-timing-function:var(--ease)] disabled:opacity-50"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => document.getElementById("import-foods-csv-input").click()}
                            className="min-h-[44px] px-2 text-xs text-ink-muted hover:text-brand flex items-center gap-1"
                            title="Import foods from CSV"
                          >
                            <Upload className="w-3 h-3" /> Import CSV
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowFoodFormatGuide(true)}
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-ink-muted hover:text-brand"
                            title="CSV format guide"
                          >
                            <HelpCircle className="w-3 h-3" />
                          </button>
                          <input
                            id="import-foods-csv-input"
                            type="file"
                            accept=".csv"
                            className="hidden"
                            onChange={handleImportFoodsCSV}
                          />
                        </div>
                        {customFoods.length > 0 && (
                          <div className="border border-charcoal-border rounded-lg overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setMyFoodsExpanded(!myFoodsExpanded)}
                              className="w-full px-3 py-1.5 bg-charcoal-elevated section-label flex items-center justify-between hover:bg-charcoal-surface2 transition-colors duration-200 [transition-timing-function:var(--ease)]"
                            >
                              <span className="flex items-center gap-1"><Star className="w-3 h-3" /> My Foods ({customFoods.length})</span>
                              {myFoodsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                            {myFoodsExpanded && (
                              <div className="md:max-h-36 md:overflow-y-auto">
                                {sortedCustomFoods.map((food) => (
                                  <div key={food.id} className="flex items-center hover:bg-charcoal-elevated border-b border-charcoal-border last:border-b-0 transition-colors duration-200 [transition-timing-function:var(--ease)]">
                                    <button onClick={() => selectCustomFood(food)} className="flex-1 text-left px-4 py-3 min-h-[44px]">
                                      <div className="font-medium text-ink text-sm">{food.food_name}{FOOD_SOURCE_LABELS[food.source] && <span className="ml-1.5 text-[11px] font-normal text-ink-muted">{FOOD_SOURCE_LABELS[food.source]}</span>}</div>
                                      <MacroResultLine cal={food.calories} p={food.protein_grams} c={food.carbs_grams} f={food.fats_grams} />
                                    </button>
                                    <FavoriteToggle food={food} onToggle={toggleFavoriteFoodMutation.mutate} />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* AI estimate — describe a food when exact macros aren't in the DB */}
                    {!editingEntry && (
                    <div className="border-t border-charcoal-border pt-4">
                      <Label htmlFor="ai-estimate" className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-brand" /> Can't find it? Describe it
                      </Label>
                      <div className="flex gap-2 mt-1">
                        <Input
                          id="ai-estimate"
                          value={estimateInput}
                          onChange={(e) => setEstimateInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); estimateFood(); } }}
                          placeholder="e.g., 8 oz grilled chicken breast"
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="dim"
                          size="lg"
                          onClick={estimateFood}
                          disabled={isEstimating || !estimateInput.trim()}
                          className="shrink-0 min-w-[92px]"
                        >
                          {isEstimating ? <Loader2 className="w-4 h-4 spin-loop" /> : <><Sparkles className="w-4 h-4" /> Estimate</>}
                        </Button>
                      </div>
                      {isEstimatedFood ? (
                        <p className="mt-1.5 text-[11px] text-brand flex items-center gap-1">
                          <Sparkles className="w-3 h-3" /> AI estimate filled in below — review the macros and adjust before logging.
                        </p>
                      ) : (
                        <p className="mt-1 text-[11px] text-ink-muted">Estimated from the name + portion. Best with an explicit amount (oz, g, cups).</p>
                      )}
                    </div>
                    )}

                    {/* add-food-dialog-5: the AI-estimate section above already
                        opens this "alternatives to search" zone with a single
                        border-t rule; the manual-entry disclosure that follows it
                        drops its own top border so the two don't stack into a
                        double divider, spacing alone (pt-1) separates them. */}
                    <div className="pt-1">
                      {/* An edit leads with amount + meal; the disclosure (and the
                          search/estimate paths above) only belong to adding. */}
                      {!editingEntry && (
                      <button
                        type="button"
                        onClick={() => setManualExpanded(v => !v)}
                        aria-expanded={manualExpanded}
                        className="w-full min-h-[44px] flex items-center justify-between text-left mb-1"
                      >
                        <span className="section-label">Manual entry</span>
                        {manualExpanded ? <ChevronUp className="w-4 h-4 text-ink-muted" /> : <ChevronDown className="w-4 h-4 text-ink-muted" />}
                      </button>
                      )}

                      {manualExpanded && (
                      <div className={editingEntry ? "flex flex-col gap-4 pt-1" : "space-y-4 pt-1"}>
                        <div>
                          <Label htmlFor="food_name">Food Name{editingEntry ? " *" : ""}</Label>
                          <Input
                            id="food_name"
                            value={newFood.food_name}
                            onChange={(e) => setNewFood({ ...newFood, food_name: e.target.value })}
                            placeholder={editingEntry ? "e.g., Chicken Breast" : `e.g., Chicken Breast (blank logs as "${QUICK_ADD_NAME}")`}
                            className="mt-1"
                          />
                        </div>

                        {/* Editing doesn't restamp eaten_at, so the toggle would be
                            a control that does nothing. */}
                        {!editingEntry && (
                        <div>
                          <LoggingModeToggle value={loggingMode} onChange={setLoggingMode} />
                        </div>
                        )}

                        <div className={`grid grid-cols-2 gap-4 ${editingEntry ? "order-first" : ""}`}>
                          <div>
                            <Label htmlFor="meal_type">Meal Type</Label>
                            <Select
                              value={newFood.meal_type}
                              onValueChange={(value) => setNewFood({ ...newFood, meal_type: value })}
                            >
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

                          <div>
                            <Label>Amount</Label>
                            <div className="flex gap-2 mt-1">
                              <Input
                                type="number" inputMode="decimal"
                                value={newFood.serving_amount}
                                onChange={(e) => setNewFood({ ...newFood, serving_amount: e.target.value })}
                                min="0"
                                step="0.5"
                                className="w-20"
                              />
                              <Select
                                value={newFood.serving_unit}
                                onValueChange={changeServingUnit}
                              >
                                <SelectTrigger className="flex-1">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {/* The food's own portions come first — they're the
                                      only units here whose gram weight this food
                                      actually vouches for. */}
                                  {activePortionLabels.map((label) => (
                                    <SelectItem key={label} value={label}>
                                      {label} ({activePortionMap[label]}g)
                                    </SelectItem>
                                  ))}
                                  {/* Serving-like units only appear when the food's own
                                      weight backs them up, or when it's already stored
                                      that way. Otherwise "1 serving" means nothing. */}
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
                              <p className="font-technical text-[11px] font-semibold text-ink-faint mt-1">{servingEquivalence}</p>
                            )}
                          </div>
                        </div>

                        {/* The estimator's own read on its answer: how sure it was
                            and what it assumed. Kept quiet — the macros above are
                            still the thing to check. */}
                        {estimateMeta && (
                          <p className="text-[11px] text-ink-muted -mt-2">
                            <span className="font-semibold">{estimateMeta.kind}</span>
                            {estimateMeta.confidence && ` · ${estimateMeta.confidence} confidence`}
                            {estimateMeta.detail && ` · ${estimateMeta.detail}`}
                          </p>
                        )}

                        {/* The weight of one serving. This is the number that was
                            missing: without it a homemade food's "serving" is a
                            guess, and every unit conversion from it is too. */}
                        {isServingLikeUnit(newFood.serving_unit) && (
                          <div>
                            <Label htmlFor="serving_grams">
                              Weight of 1 {newFood.serving_unit} (g)
                            </Label>
                            <Input
                              id="serving_grams"
                              type="number" inputMode="decimal"
                              placeholder="e.g. 62"
                              value={foodServingSizeGrams ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const g = parseFloat(raw);
                                setFoodServingSizeGrams(raw === "" || !Number.isFinite(g) || g <= 0 ? null : g);
                              }}
                              className="mt-1"
                              min="0"
                              step="1"
                            />
                            <p className="text-[11px] text-ink-muted mt-1">
                              {foodServingSizeGrams > 0
                                ? "Saved with the food, so grams and servings stay interchangeable."
                                : "Optional. Weigh one serving once and every log after it is exact."}
                            </p>
                          </div>
                        )}

                        {/* Named portions. One food, many honest units: a slice is
                            62 g and a loaf is 800 g, and both beat any generic
                            table because this food defined them. */}
                        {!isUsdaFood && (
                          <div>
                            <button
                              type="button"
                              onClick={() => setPortionsExpanded((v) => !v)}
                              className="flex items-center gap-1.5 text-xs font-semibold text-ink-secondary hover:text-ink"
                            >
                              {portionsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              Portions
                              {activePortions.length > 0 && (
                                <span className="font-technical text-ink-faint">({activePortions.length})</span>
                              )}
                            </button>

                            {portionsExpanded && (
                              <div className="mt-2 space-y-2">
                                {activePortions.length === 0 && (
                                  <p className="text-[11px] text-ink-muted">
                                    Weigh one and name it. "slice = 62 g" turns every future log into a count.
                                  </p>
                                )}
                                {activePortions.map((p) => (
                                  <div key={p.label} className="flex items-center gap-2 glass-inset px-2 py-1.5">
                                    <span className="text-xs text-ink flex-1">{p.label}</span>
                                    <span className="font-technical text-xs font-semibold text-ink-secondary">{p.grams}g</span>
                                    <button
                                      type="button"
                                      onClick={() => removePortion(p.label)}
                                      aria-label={`Remove ${p.label} portion`}
                                      className="text-ink-faint hover:text-coral"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                                <div className="flex gap-2">
                                  <Input
                                    placeholder="slice"
                                    value={portionDraft.label}
                                    onChange={(e) => setPortionDraft((d) => ({ ...d, label: e.target.value }))}
                                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPortionDraft(); } }}
                                    className="flex-1"
                                  />
                                  <Input
                                    type="number" inputMode="decimal"
                                    placeholder="g"
                                    value={portionDraft.grams}
                                    onChange={(e) => setPortionDraft((d) => ({ ...d, grams: e.target.value }))}
                                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPortionDraft(); } }}
                                    className="w-20"
                                    min="0"
                                    step="1"
                                  />
                                  <Button type="button" variant="outline" size="sm" onClick={addPortionDraft}>
                                    <Plus className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {(isUsdaFood ? newFood.calories > 0 : baseMacros.calories > 0 || baseMacros.protein_grams > 0) && (
                          <>
                          <p className="section-label">Total for {newFood.serving_amount} {newFood.serving_unit}</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {[
                              { label: 'Calories', value: Math.round(newFood.calories), unit: '', hue: 'text-gold' },
                              { label: 'Protein', value: newFood.protein_grams, unit: 'g', hue: 'text-coral' },
                              { label: 'Carbs', value: newFood.carbs_grams, unit: 'g', hue: 'text-carb' },
                              { label: 'Fats', value: newFood.fats_grams, unit: 'g', hue: 'text-fat' },
                              ...(newFood.fiber_grams != null && newFood.fiber_grams !== ''
                                ? [{ label: 'Fiber', value: newFood.fiber_grams, unit: 'g', hue: 'text-ink-secondary' }]
                                : []),
                            ].map(({ label, value, unit, hue }) => (
                              <div key={label} className="glass-inset px-2 py-2 text-center">
                                <div className="text-xs text-ink-muted font-medium">{label}</div>
                                <div className={`font-technical font-semibold text-sm ${hue}`}>{value}{unit}</div>
                              </div>
                            ))}
                          </div>
                          </>
                        )}

                        <p className="text-xs text-ink-muted">
                          Edit base values,{' '}
                          {isUsdaFood
                            ? `per ${newFood.serving_unit}`
                            : (({ g: 'per 100g', ml: 'per 100ml', oz: 'per 1 oz', cup: 'per 1 cup', tbsp: 'per 1 tbsp', tsp: 'per 1 tsp', piece: 'per piece', serving: 'per serving' })[baseUnit] || 'per serving')}
                          {isUsdaFood ? ' (total above scales with amount)' : ''}
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="calories">Calories</Label>
                            <Input
                              id="calories"
                              type="number" inputMode="decimal"
                              placeholder="0"
                              value={(isUsdaFood ? newFood.calories : baseMacros.calories) || ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (isUsdaFood) {
                                  setNewFood(prev => ({ ...prev, calories: raw }));
                                  if (raw !== '' && currentScale > 0) {
                                    setBaseMacros(prev => ({ ...prev, calories: Math.round((parseFloat(raw) || 0) / currentScale) }));
                                  }
                                } else {
                                  setBaseMacros({ ...baseMacros, calories: raw });
                                }
                              }}
                              className="mt-1"
                              min="0"
                            />
                          </div>

                          <div>
                            <Label htmlFor="protein">Protein (g)</Label>
                            <Input
                              id="protein"
                              type="number" inputMode="decimal"
                              placeholder="0"
                              value={(isUsdaFood ? newFood.protein_grams : baseMacros.protein_grams) || ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (isUsdaFood) {
                                  setNewFood(prev => ({ ...prev, protein_grams: raw }));
                                  if (raw !== '' && currentScale > 0) {
                                    setBaseMacros(prev => ({ ...prev, protein_grams: Math.round((parseFloat(raw) || 0) / currentScale * 10) / 10 }));
                                  }
                                } else {
                                  setBaseMacros({ ...baseMacros, protein_grams: raw });
                                }
                              }}
                              className="mt-1"
                              min="0"
                              step="0.1"
                            />
                          </div>

                          <div>
                            <Label htmlFor="carbs">Carbs (g)</Label>
                            <Input
                              id="carbs"
                              type="number" inputMode="decimal"
                              placeholder="0"
                              value={(isUsdaFood ? newFood.carbs_grams : baseMacros.carbs_grams) || ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (isUsdaFood) {
                                  setNewFood(prev => ({ ...prev, carbs_grams: raw }));
                                  if (raw !== '' && currentScale > 0) {
                                    setBaseMacros(prev => ({ ...prev, carbs_grams: Math.round((parseFloat(raw) || 0) / currentScale * 10) / 10 }));
                                  }
                                } else {
                                  setBaseMacros({ ...baseMacros, carbs_grams: raw });
                                }
                              }}
                              className="mt-1"
                              min="0"
                              step="0.1"
                            />
                          </div>

                          <div>
                            <Label htmlFor="fats">Fats (g)</Label>
                            <Input
                              id="fats"
                              type="number" inputMode="decimal"
                              placeholder="0"
                              value={(isUsdaFood ? newFood.fats_grams : baseMacros.fats_grams) || ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (isUsdaFood) {
                                  setNewFood(prev => ({ ...prev, fats_grams: raw }));
                                  if (raw !== '' && currentScale > 0) {
                                    setBaseMacros(prev => ({ ...prev, fats_grams: Math.round((parseFloat(raw) || 0) / currentScale * 10) / 10 }));
                                  }
                                } else {
                                  setBaseMacros({ ...baseMacros, fats_grams: raw });
                                }
                              }}
                              className="mt-1"
                              min="0"
                              step="0.1"
                            />
                          </div>

                          {/* Fiber is optional and stays null when blank. Blank
                              means unknown, which is not the same as zero — the
                              daily average only counts days where every entry
                              reported it. */}
                          <div>
                            <Label htmlFor="fiber">Fiber (g)</Label>
                            <Input
                              id="fiber"
                              type="number" inputMode="decimal"
                              placeholder="optional"
                              value={(isUsdaFood ? newFood.fiber_grams : baseMacros.fiber_grams) ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const blank = raw === "";
                                if (isUsdaFood) {
                                  setNewFood(prev => ({ ...prev, fiber_grams: blank ? null : raw }));
                                  if (!blank && currentScale > 0) {
                                    setBaseMacros(prev => ({ ...prev, fiber_grams: Math.round((parseFloat(raw) || 0) / currentScale * 10) / 10 }));
                                  }
                                  if (blank) setBaseMacros(prev => ({ ...prev, fiber_grams: null }));
                                } else {
                                  setBaseMacros({ ...baseMacros, fiber_grams: blank ? null : raw });
                                }
                              }}
                              className="mt-1"
                              min="0"
                              step="0.1"
                            />
                          </div>
                        </div>

                        {/* Form-validation attention, not a biometric — neutral
                            glass-inset + ink hierarchy; coral lives ONLY on the
                            corrective action (SYS-09c). */}
                        {macroCalcWarning && (
                          <div className="glass-inset px-3 py-2 text-xs text-ink-secondary">
                            <div className="flex items-center gap-1.5 font-semibold text-ink mb-1">
                              <AlertTriangle className="w-3.5 h-3.5 text-ink-muted" />
                              Macros don't match calories
                            </div>
                            <p>P+C+F = <strong className="text-ink">{macroCalcWarning.calculated} cal</strong>, but you entered <strong className="text-ink">{baseMacros.calories} cal</strong>.</p>
                            <button
                              type="button"
                              className="mt-1 underline font-semibold text-brand"
                              onClick={() => setBaseMacros(prev => ({ ...prev, calories: macroCalcWarning.calculated }))}
                            >
                              Use {macroCalcWarning.calculated} kcal instead
                            </button>
                          </div>
                        )}
                      </div>
                      )}
                  </div>
                </div>

              {/* Fixed footer — only mounts once a food is selected/typed, so
                  the search-first sheet isn't capped by a dead submit bar while
                  browsing results. */}
              {(editingEntry || newFood.food_name || (manualExpanded && baseMacros.calories > 0)) && (
              <div className="px-6 pt-4 border-t bg-charcoal-surface shrink-0" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                <Button
                  onClick={() => {
                    // No hard max, just a once-per-submit gut check: a typo'd
                    // amount (10000g instead of 1000g) silently wrecks the
                    // day's ring with no other feedback. Mirrors the
                    // train-logger heavy-weight confirm.
                    const computedCalories = Math.round(parseFloat(newFood.calories) || 0);
                    // Editing an already-logged big entry (renaming it, moving
                    // its meal) with the calories unchanged isn't a typo.
                    const unchangedEdit = editingEntry
                      && computedCalories === Math.round(Number(editingEntry.calories) || 0);
                    if (computedCalories > 2500 && !unchangedEdit) {
                      const ok = window.confirm(
                        `That's ${computedCalories.toLocaleString()} kcal, log it?`
                      );
                      if (!ok) return;
                    }
                    if (editingEntry) {
                      updateFoodMutation.mutate({ id: editingEntry.id, data: newFood });
                      return;
                    }
                    // Calorie-only quick add: no name typed means "Quick add",
                    // and a nameless entry is never worth a My Foods row.
                    const isQuickAdd = !newFood.food_name.trim();
                    addFoodMutation.mutate(isQuickAdd ? { ...newFood, food_name: QUICK_ADD_NAME } : newFood);
                    // Save manually-entered foods to custom_foods (fire-and-forget, per-serving values)
                    if (!isQuickAdd && baseMacros.calories > 0) {
                      saveCustomFoodMutation.mutate({ food: buildCustomFoodPayload(), activeFoodId });
                    }
                  }}
                  // Block a blank/zero amount: it would log a real entry with 0
                  // calories and serving_size coerced to 1 (a silent empty log).
                  disabled={(!newFood.food_name.trim() && (editingEntry || !(baseMacros.calories > 0))) || (parseFloat(newFood.serving_amount) || 0) <= 0 || addFoodMutation.isPending || updateFoodMutation.isPending}
                  variant="volt"
                  size="lg"
                  className="w-full"
                  data-tutorial="add-food-submit"
                >
                  {(addFoodMutation.isPaused || updateFoodMutation.isPaused) ? (
                    // React Query's default networkMode pauses (not fails) a
                    // mutation while navigator.onLine is false — it resumes on
                    // its own on reconnect, so this is honest, not an error.
                    "Offline - saves when you're back online"
                  ) : (addFoodMutation.isPending || updateFoodMutation.isPending) ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 spin-loop" />
                      {editingEntry ? "Saving..." : "Adding..."}
                    </>
                  ) : (
                    editingEntry ? "Save Changes" : "Add Food"
                  )}
                </Button>
              </div>
              )}
            </DialogContent>
          </Dialog>
        )}
    </>
  );
}
