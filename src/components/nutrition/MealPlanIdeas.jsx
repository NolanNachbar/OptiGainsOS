import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, UtensilsCrossed, X, Bookmark } from "lucide-react";
import { SaveAsTemplateDialog } from "@/components/nutrition/MealTemplates";
import { buildDayEntries } from "@/config/dietPlans";
import { useAuth } from "@/contexts/AuthContext";

const MEAL_LABELS = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };
const MEAL_ORDER  = ["breakfast", "lunch", "dinner", "snack"];
const PLAN_DAYS   = 3;

// One idea day = the same optimizer the Fuel page plans with, so the totals land
// on the calorie / protein / fat targets instead of depending on whichever past
// meals happened to be in the log. Variety comes from taking a different main
// protein off the menu each day.
function buildIdeaDay(dayNo, { cal, prot, fat, aggressiveCut, excludeFoods }) {
  const rows = buildDayEntries({
    date: null,
    trainingDay: true,
    calorieTarget: cal,
    proteinTarget: prot || null,
    fatTarget: fat || null,
    aggressiveCut,
    excludeFoods,
    floorBufferPct: 0.01,
  });
  const day = {};
  for (const mt of MEAL_ORDER) {
    const foods = rows
      .filter((r) => r.meal_type === mt)
      .map((r) => ({
        name: r.food_name,
        calories: r.calories,
        protein: r.protein_grams,
        carbs: r.carbs_grams,
        fats: r.fats_grams,
        serving_size: `${r.serving_size} g`,
        role: r.role,
      }));
    if (!foods.length) continue;
    const total = foods.reduce(
      (a, f) => ({ calories: a.calories + f.calories, protein: a.protein + f.protein, carbs: a.carbs + f.carbs, fats: a.fats + f.fats }),
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    );
    day[mt] = { key: `${dayNo}|${mt}`, meal_type: mt, foods, total };
  }
  return day;
}

// Protein foods in a day, biggest protein contribution first.
function rankedProteins(day) {
  const byFood = {};
  for (const inst of Object.values(day)) {
    for (const f of inst.foods) {
      if (f.role === "protein") byFood[f.name] = (byFood[f.name] || 0) + f.protein;
    }
  }
  return Object.entries(byFood).sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

function sumDay(day) {
  return Object.values(day)
    .flatMap((inst) => inst.foods)
    .reduce(
      (acc, f) => ({ calories: acc.calories + f.calories, protein: acc.protein + f.protein, carbs: acc.carbs + f.carbs, fats: acc.fats + f.fats }),
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    );
}

// `seed` (bumped by Regenerate) starts the rotation on a different protein, so
// the optimizer, which is deterministic, still gives a different set of days.
function generatePlan(opts, hidden, seed) {
  const base = [...hidden];
  const baseline = buildIdeaDay(0, { ...opts, excludeFoods: base });
  const ranks = rankedProteins(baseline);
  const rotated = seed > 0 && ranks.length ? [ranks[(seed - 1) % ranks.length]] : [];

  const days = [];
  for (let i = 0; i < PLAN_DAYS; i++) {
    let day = buildIdeaDay(i, { ...opts, excludeFoods: [...base, ...rotated] });
    // Taking a main protein off the menu can put the targets out of reach; if so,
    // show this day without the rotation instead of a plan that misses.
    if (rotated.length && Math.abs(sumDay(day).calories - opts.cal) > opts.cal * 0.05) {
      day = buildIdeaDay(i, { ...opts, excludeFoods: base });
    }
    days.push(day);
    const lead = rankedProteins(day).find((n) => !rotated.includes(n));
    if (lead) rotated.push(lead);
  }
  return days;
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

export default function MealPlanIdeas({ calorieGoal, proteinGoal, carbsGoal, fatsGoal, aggressiveCut = false }) {
  const { user } = useAuth();
  const [hidden,     setHidden]     = useState(new Set()); // food names the user skipped
  const [seed,       setSeed]       = useState(0);
  const [activeDay,  setActiveDay]  = useState(0);
  const [saveDialog, setSaveDialog] = useState(null);       // { entries, mealType }

  const cal  = calorieGoal || 2000;
  const prot = proteinGoal || 0;
  const fat  = fatsGoal    || 0;

  const plan = useMemo(
    () => generatePlan({ cal, prot, fat, aggressiveCut }, hidden, seed),
    [cal, prot, fat, aggressiveCut, hidden, seed]
  );

  const regenerate = useCallback(() => { setSeed((s) => s + 1); setActiveDay(0); }, []);

  const hideFood = useCallback((name) => {
    setHidden((prev) => new Set([...prev, name]));
  }, []);

  const currentDay = plan[Math.min(activeDay, plan.length - 1)] || {};
  const totals     = sumDay(currentDay);
  const calClose   = Math.abs(totals.calories - cal) < 150;

  if (!Object.keys(currentDay).length) {
    return (
      <div className="rounded-xl border border-dashed border-charcoal-border p-4 text-center space-y-2">
        <UtensilsCrossed className="w-6 h-6 text-ink-muted mx-auto" />
        <p className="text-body text-ink-muted">
          No plan fits your targets with the foods that are hidden.
        </p>
        {hidden.size > 0 && (
          <button onClick={() => setHidden(new Set())} className="text-caption text-brand">
            Bring back {hidden.size} hidden {hidden.size === 1 ? "food" : "foods"}
          </button>
        )}
      </div>
    );
  }

  return (
    <Card className="">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-emph flex items-center gap-2">
            <UtensilsCrossed className="w-4 h-4 text-brand" />
            Meal Plan Ideas
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-caption gap-1.5" onClick={regenerate}>
            <RefreshCw className="w-3 h-3" />
            Regenerate
          </Button>
        </div>
        <p className="text-caption text-ink-muted mt-0.5">
          Solved to your {cal.toLocaleString()} cal target from your plan foods
        </p>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {/* Day tabs */}
        <div className="flex gap-1.5">
          {plan.map((_, i) => (
            <button key={i} onClick={() => setActiveDay(i)}
              className={`flex-1 py-1.5 rounded-lg text-caption font-medium transition-all ${
                activeDay === i
                  ? "bg-brand text-[var(--color-action-dark)] font-semibold"
                  : "bg-charcoal-elevated text-ink-muted hover:bg-charcoal-elevated"
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
                  <span className="text-caption font-semibold text-ink-muted">
                    {MEAL_LABELS[mt]}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-caption text-ink-muted">{inst.total.calories} cal</span>
                    <Button
                      variant="plain"
                      size="icon"
                      className="min-h-11 min-w-11 hover:text-brand"
                      onClick={() => setSaveDialog({ entries: planFoodsToEntries(currentDay, mt), mealType: mt })}
                      title="Save as meal template"
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="bg-charcoal-surface rounded-lg divide-y divide-charcoal-border">
                  {inst.foods.map((food, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-body font-medium text-ink leading-tight break-words">
                          {food.name}
                        </div>
                        <div className="text-caption text-ink-muted mt-0.5">{food.serving_size}</div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <div className="text-caption font-semibold text-ink-muted">{food.calories} cal</div>
                        <div className="flex gap-1.5 text-caption mt-0.5">
                          <span className="text-coral">{Math.round(food.protein)}P</span>
                          <span className="text-carb">{Math.round(food.carbs)}C</span>
                          <span className="text-rose-500">{Math.round(food.fats)}F</span>
                        </div>
                      </div>
                      <Button
                        variant="plain"
                        size="icon"
                        className="min-h-11 min-w-11 -mr-2 shrink-0 text-ink-faint hover:text-bad"
                        onClick={() => hideFood(food.name)}
                        aria-label={`Don't use ${food.name}`}
                        title="Don't use this food"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
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
            <span className="text-caption font-semibold text-ink-muted">Day Total</span>
            <span className={`text-body font-semibold ${calClose ? "text-green-600" : "text-ink-muted"}`}>
              {totals.calories.toLocaleString()}
              <span className="text-caption font-normal text-ink-muted ml-1">/ {cal.toLocaleString()} cal</span>
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <MacroCell label="Protein" value={Math.round(totals.protein)} goal={proteinGoal} color="blue" />
            <MacroCell label="Carbs"   value={Math.round(totals.carbs)}   goal={carbsGoal}   color="amber" />
            <MacroCell label="Fats"    value={Math.round(totals.fats)}    goal={fatsGoal}    color="rose" />
          </div>
          <Button
            variant="outline"
            size="lg"
            className="w-full gap-1.5"
            onClick={() => setSaveDialog({ entries: planFoodsToEntries(currentDay), mealType: null })}
          >
            <Bookmark className="w-3.5 h-3.5" />
            Save Day as Template
          </Button>
        </div>

        {hidden.size > 0 && (
          <button
            onClick={() => setHidden(new Set())}
            className="text-caption text-ink-muted hover:text-ink transition-colors"
          >
            Bring back {hidden.size} hidden {hidden.size === 1 ? "food" : "foods"}
          </button>
        )}
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
    blue:  { bg: "bg-[rgba(59,130,246,0.08)]",  text: "text-coral",   sub: "text-coral"  },
    amber: { bg: "bg-warn/10", text: "text-warn", sub: "text-warn" },
    rose:  { bg: "bg-rose-50",   text: "text-rose-700",   sub: "text-bad"  },
  }[color];
  return (
    <div className={`py-1.5 rounded-lg text-center text-caption ${c.bg}`}>
      <div className={`font-semibold ${close ? "text-green-600" : c.text}`}>{value}g</div>
      <div className={`text-caption ${c.sub}`}>{label}{goal ? ` / ${goal}g` : ""}</div>
    </div>
  );
}
