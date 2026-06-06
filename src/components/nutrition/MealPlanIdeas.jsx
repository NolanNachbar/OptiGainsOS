import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, UtensilsCrossed, X, Plus, Search, Bookmark } from "lucide-react";
import { SaveAsTemplateDialog } from "@/components/nutrition/MealTemplates";
import { useAuth } from "@/contexts/AuthContext";

const MEAL_ALLOC  = { breakfast: 0.25, lunch: 0.35, dinner: 0.30, snack: 0.10 };
const MEAL_LABELS = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };
const MEAL_ORDER  = ["breakfast", "lunch", "dinner", "snack"];

function isSuspicious(entry) {
  // Use either serving_amount or parse numeric part from serving_size string
  const amt = entry.serving_amount ?? parseFloat(String(entry.serving_size || ""));
  const unit = entry.serving_unit ?? (String(entry.serving_size || "").split(' ')[1] || "serving");
  const calories = entry.calories;
  
  if (amt > 0 && (unit === "g" || unit === "oz")) {
    const calPerG = unit === "oz" ? calories / (amt * 28.35) : calories / amt;
    if (calPerG > 10) return true; // physically impossible (fat = 9 cal/g max)
  }
  return false;
}

// Group food log entries into meal "instances" — all foods eaten together on one date+slot.
// Each instance is what the user actually ate for that meal on a real day.
function buildMealPool(entries, excluded, additions) {
  const byKey = {};
  for (const e of entries) {
    if (!e.calories || e.calories <= 0 || isSuspicious(e)) continue;
    if (!e.meal_type || !e.date) continue;
    const key = `${e.date}|${e.meal_type}`;
    if (excluded.has(key)) continue;
    if (!byKey[key]) byKey[key] = { key, date: e.date, meal_type: e.meal_type, foods: [] };
    
    // Format serving size for display
    let displayServing = e.serving_size;
    if (typeof e.serving_size === 'number') {
      displayServing = `${e.serving_size} ${e.serving_unit || 'serving'}`;
    }

    byKey[key].foods.push({
      name: e.food_name,
      calories: e.calories,
      protein: e.protein_grams || 0,
      carbs:   e.carbs_grams   || 0,
      fats:    e.fats_grams    || 0,
      serving_size: displayServing || "1 serving",
    });
  }

  // Synthetic instances from manual additions
  for (const a of additions) {
    const key = `addition|${a.name}|${a.meal_type}`;
    if (!excluded.has(key)) {
      byKey[key] = {
        key,
        date: null,
        meal_type: a.meal_type,
        foods: [{ name: a.name, calories: a.calories, protein: a.protein, carbs: a.carbs, fats: a.fats, serving_size: a.serving_size }],
      };
    }
  }

  // Compute totals and group by meal_type
  const pool = { breakfast: [], lunch: [], dinner: [], snack: [] };
  for (const inst of Object.values(byKey)) {
    const total = inst.foods.reduce(
      (acc, f) => ({ calories: acc.calories + f.calories, protein: acc.protein + f.protein, carbs: acc.carbs + f.carbs, fats: acc.fats + f.fats }),
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    );
    if (pool[inst.meal_type]) pool[inst.meal_type].push({ ...inst, total });
  }
  return pool;
}

function scoreMeal(inst, calTarget, protTarget, carbTarget, fatTarget) {
  const { calories: cal, protein: prot, carbs, fats } = inst.total;
  const calErr  = Math.abs(cal  - calTarget)  / Math.max(calTarget,  1);
  const protErr = protTarget > 0 ? Math.abs(prot  - protTarget)  / protTarget  : 0;
  const carbErr = carbTarget > 0 ? Math.abs(carbs - carbTarget)  / carbTarget  : 0;
  const fatErr  = fatTarget  > 0 ? Math.abs(fats  - fatTarget)   / fatTarget   : 0;
  return calErr * 0.35 + protErr * 0.30 + carbErr * 0.25 + fatErr * 0.10;
}

function generateDay(pool, calGoal, protGoal, carbGoal, fatGoal, usedKeys) {
  const day = {};
  for (const mt of MEAL_ORDER) {
    const calTarget  = Math.round(calGoal  * MEAL_ALLOC[mt]);
    const protTarget = protGoal ? Math.round(protGoal * MEAL_ALLOC[mt]) : 0;
    const carbTarget = carbGoal ? Math.round(carbGoal * MEAL_ALLOC[mt]) : 0;
    const fatTarget  = fatGoal  ? Math.round(fatGoal  * MEAL_ALLOC[mt]) : 0;

    // Prefer unused instances; fall back to all if exhausted
    let candidates = pool[mt].filter((i) => !usedKeys.has(i.key));
    if (!candidates.length) candidates = [...pool[mt]];
    if (!candidates.length) { day[mt] = null; continue; }

    // Sort by macro score, randomly pick from top 3 for variety on regenerate
    candidates.sort((a, b) => scoreMeal(a, calTarget, protTarget, carbTarget, fatTarget) - scoreMeal(b, calTarget, protTarget, carbTarget, fatTarget));
    const topN = candidates.slice(0, Math.min(3, candidates.length));
    const chosen = topN[Math.floor(Math.random() * topN.length)];

    usedKeys.add(chosen.key);
    day[mt] = chosen;
  }
  return day;
}

function generatePlan(pool, calGoal, protGoal, carbGoal, fatGoal, days = 3) {
  const usedKeys = new Set();
  return Array.from({ length: days }, () =>
    generateDay(pool, calGoal, protGoal, carbGoal, fatGoal, usedKeys)
  );
}

function sumDay(day) {
  return Object.values(day)
    .filter(Boolean)
    .flatMap((inst) => inst.foods)
    .reduce(
      (acc, f) => ({ calories: acc.calories + f.calories, protein: acc.protein + f.protein, carbs: acc.carbs + f.carbs, fats: acc.fats + f.fats }),
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    );
}

function buildSearchIndex(entries) {
  const seen = new Map();
  for (const e of entries) {
    if (!e.calories || e.calories <= 0 || isSuspicious(e)) continue;
    if (!seen.has(e.food_name)) {
      let displayServing = e.serving_size;
      if (typeof e.serving_size === 'number') {
        displayServing = `${e.serving_size} ${e.serving_unit || 'serving'}`;
      }
      seen.set(e.food_name, {
        name: e.food_name, calories: e.calories,
        protein: e.protein_grams || 0, carbs: e.carbs_grams || 0, fats: e.fats_grams || 0,
        serving_size: displayServing || "1 serving", meal_type: e.meal_type,
      });
    }
  }
  return [...seen.values()];
}

function planFoodsToEntries(day, mealType = null) {
  const slots = mealType ? [mealType] : MEAL_ORDER;
  return slots.flatMap((mt) =>
    (day[mt]?.foods || []).map((f) => ({
      food_name: f.name,
      serving_size: f.serving_size,
      calories: f.calories,
      protein_grams: f.protein,
      carbs_grams: f.carbs,
      fats_grams: f.fats,
      meal_type: mt,
    }))
  );
}

export default function MealPlanIdeas({ allFoodEntries = [], calorieGoal, proteinGoal, carbsGoal, fatsGoal }) {
  const { user } = useAuth();
  const [excluded,    setExcluded]    = useState(new Set());
  const [additions,   setAdditions]   = useState([]);
  const [activeDay,   setActiveDay]   = useState(0);
  const [showAdd,     setShowAdd]     = useState(false);
  const [addSearch,   setAddSearch]   = useState("");
  const [addMealType, setAddMealType] = useState("breakfast");
  const [saveDialog,  setSaveDialog]  = useState(null); // { entries, mealType }

  const cal  = calorieGoal  || 2000;
  const prot = proteinGoal  || 0;
  const carb = carbsGoal    || 0;
  const fat  = fatsGoal     || 0;

  const pool = useMemo(
    () => buildMealPool(allFoodEntries, excluded, additions),
    [allFoodEntries, excluded, additions]
  );

  const hasData = useMemo(
    () => Object.values(pool).reduce((n, arr) => n + arr.length, 0) >= 3,
    [pool]
  );

  const [plan, setPlan] = useState(() =>
    hasData ? generatePlan(pool, cal, prot, carb, fat) : []
  );

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (hasData) { setPlan(generatePlan(pool, cal, prot, carb, fat)); setActiveDay(0); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excluded, additions]);

  const regenerate = useCallback(() => {
    setPlan(generatePlan(pool, cal, prot, carb, fat));
    setActiveDay(0);
  }, [pool, cal, prot, carb, fat]);

  const excludeMeal = useCallback((key) => setExcluded((prev) => new Set([...prev, key])), []);

  const searchIndex   = useMemo(() => buildSearchIndex(allFoodEntries), [allFoodEntries]);
  const searchResults = useMemo(() => {
    if (!addSearch.trim()) return [];
    const q = addSearch.toLowerCase();
    return searchIndex.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 6);
  }, [addSearch, searchIndex]);

  const addToPool = (food) => {
    setAdditions((prev) => {
      const key = `addition|${food.name}|${addMealType}`;
      return [...prev.filter((a) => `addition|${a.name}|${a.meal_type}` !== key), { ...food, meal_type: addMealType }];
    });
    setAddSearch("");
    setShowAdd(false);
  };

  if (!hasData) {
    return (
      <div className="rounded-xl border border-dashed border-charcoal-border border-charcoal-border p-4 text-center space-y-2">
        <UtensilsCrossed className="w-6 h-6 text-slate-400 mx-auto" />
        <p className="text-sm text-slate-500">
          Log a few more meals to unlock meal plan ideas based on your food history.
        </p>
      </div>
    );
  }

  const currentDay = plan[activeDay] || {};
  const totals     = sumDay(currentDay);
  const calClose   = Math.abs(totals.calories - cal) < 150;

  return (
    <Card className="">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <UtensilsCrossed className="w-4 h-4 text-brand" />
            Meal Plan Ideas
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={regenerate}>
            <RefreshCw className="w-3 h-3" />
            Regenerate
          </Button>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          Meals from your log history · {cal.toLocaleString()} cal target
        </p>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {/* Day tabs */}
        <div className="flex gap-1.5">
          {plan.map((_, i) => (
            <button key={i} onClick={() => setActiveDay(i)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeDay === i
                  ? "bg-brand text-black font-bold"
                  : "bg-charcoal-elevated bg-charcoal-elevated text-slate-400 text-slate-400 hover:bg-charcoal-elevated "
              }`}
            >
              Day {i + 1}
            </button>
          ))}
        </div>

        {/* Meals */}
        <div className="space-y-3">
          {MEAL_ORDER.map((mt) => {
            const inst = currentDay[mt];
            if (!inst) return null;
            return (
              <div key={mt}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {MEAL_LABELS[mt]}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{inst.total.calories} cal</span>
                    <button
                      onClick={() => setSaveDialog({ entries: planFoodsToEntries(currentDay, mt), mealType: mt })}
                      className="p-0.5 rounded hover:bg-charcoal-elevated  text-slate-400 hover:text-brand transition-colors"
                      title="Save as meal template"
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => excludeMeal(inst.key)}
                      className="p-0.5 rounded hover:bg-charcoal-elevated  text-slate-400 hover:text-slate-500 transition-colors"
                      title="Skip this meal"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="bg-charcoal-surface rounded-lg divide-y divide-charcoal-border">
                  {inst.foods.map((food, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-white  leading-tight break-words">
                          {food.name}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">{food.serving_size}</div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <div className="text-xs font-semibold text-slate-400 text-slate-400">{food.calories} cal</div>
                        <div className="flex gap-1.5 text-xs mt-0.5">
                          <span className="text-[#60a5fa]">{Math.round(food.protein)}P</span>
                          <span className="text-amber-500">{Math.round(food.carbs)}C</span>
                          <span className="text-rose-500">{Math.round(food.fats)}F</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Day totals */}
        <div className="pt-2 border-t border-charcoal-border space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Day Total</span>
            <span className={`text-sm font-bold ${calClose ? "text-green-600" : "text-slate-400 text-slate-400"}`}>
              {totals.calories.toLocaleString()}
              <span className="text-xs font-normal text-slate-400 ml-1">/ {cal.toLocaleString()} cal</span>
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <MacroCell label="Protein" value={Math.round(totals.protein)} goal={proteinGoal} color="blue" />
            <MacroCell label="Carbs"   value={Math.round(totals.carbs)}   goal={carbsGoal}   color="amber" />
            <MacroCell label="Fats"    value={Math.round(totals.fats)}    goal={fatsGoal}    color="rose" />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs gap-1.5"
            onClick={() => setSaveDialog({ entries: planFoodsToEntries(currentDay), mealType: null })}
          >
            <Bookmark className="w-3.5 h-3.5" />
            Save Day as Template
          </Button>
        </div>

        {/* Add food */}
        <div className="pt-1 space-y-2">
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-brand hover:text-brand transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add a food as a meal option
          </button>

          {showAdd && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <Input
                    value={addSearch}
                    onChange={(e) => setAddSearch(e.target.value)}
                    placeholder="Search your foods…"
                    className="pl-8 h-8 text-sm"
                    autoFocus
                  />
                </div>
                <Select value={addMealType} onValueChange={setAddMealType}>
                  <SelectTrigger className="w-32 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEAL_ORDER.map((mt) => (
                      <SelectItem key={mt} value={mt} className="text-xs">{MEAL_LABELS[mt]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-1">
                  {searchResults.map((food) => (
                    <button key={food.name} onClick={() => addToPool(food)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-charcoal-surface bg-charcoal-surface rounded-lg hover:bg-charcoal-elevated hover:bg-charcoal-elevated transition-colors text-left"
                    >
                      <div>
                        <div className="text-sm font-medium text-white ">{food.name}</div>
                        <div className="text-xs text-slate-400">{food.serving_size}</div>
                      </div>
                      <div className="text-right text-xs shrink-0 ml-3">
                        <div className="text-slate-500">{food.calories} cal</div>
                        <div className="flex gap-1.5 text-xs mt-0.5">
                          <span className="text-[#60a5fa]">{Math.round(food.protein)}P</span>
                          <span className="text-amber-500">{Math.round(food.carbs)}C</span>
                          <span className="text-rose-500">{Math.round(food.fats)}F</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {addSearch.trim() && !searchResults.length && (
                <p className="text-xs text-slate-400 text-center py-2">No matching foods found in your log.</p>
              )}
            </div>
          )}

          {excluded.size > 0 && (
            <button
              onClick={() => setExcluded(new Set())}
              className="text-xs text-slate-400 hover:text-slate-400 transition-colors"
            >
              Reset exclusions ({excluded.size} hidden)
            </button>
          )}
        </div>
      </CardContent>

      {saveDialog && (
        <SaveAsTemplateDialog
          open={!!saveDialog}
          onOpenChange={(open) => { if (!open) setSaveDialog(null); }}
          entries={saveDialog.entries}
          mealType={saveDialog.mealType}
          userId={user?.id}
        />
      )}
    </Card>
  );
}

function MacroCell({ label, value, goal, color }) {
  const close = goal ? Math.abs(value - goal) / goal < 0.1 : false;
  const c = {
    blue:  { bg: "bg-[rgba(59,130,246,0.08)]",  text: "text-[#60a5fa]",   sub: "text-[#60a5fa]"  },
    amber: { bg: "bg-[rgba(245,158,11,0.08)]", text: "text-[#fbbf24]", sub: "text-[#fbbf24]" },
    rose:  { bg: "bg-rose-50",   text: "text-rose-700",   sub: "text-rose-400"  },
  }[color];
  return (
    <div className={`py-1.5 rounded-lg text-center text-xs ${c.bg}`}>
      <div className={`font-bold ${close ? "text-green-600" : c.text}`}>{value}g</div>
      <div className={`text-xs ${c.sub}`}>{label}{goal ? ` / ${goal}g` : ""}</div>
    </div>
  );
}
