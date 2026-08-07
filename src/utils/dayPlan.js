// One day of the generated meal plan, resolved from targets + what's already
// eaten + that day's manual overrides. Extracted from WeeklyPlanCard so the
// single-day rebuild after a food swap solves the day EXACTLY the way the week
// view does — two copies of this arithmetic would drift the moment either moved.

import { buildDayEntries, entriesCost, entriesUnpriced, swapCatalogItem, FOOD_CATALOG } from "@/config/dietPlans";
import { clampCutProtein, profileWeightLb, CUT_PROTEIN_HARD_FLOOR_PER_LB } from "@/hooks/useDailyTargets";

// A day needs at least this much un-eaten budget before we bother planning food
// into it — below this, portions would shrink past edible.
export const MIN_DAY_BUDGET = 150;

const CATALOG_BY_NAME = Object.fromEntries(FOOD_CATALOG.map((f) => [f.food, f]));

export const sumRows = (rows) =>
  rows.reduce(
    (t, e) => ({
      calories: t.calories + (e.calories || 0),
      protein: t.protein + (e.protein_grams || 0),
      carbs: t.carbs + (e.carbs_grams || 0),
      fats: t.fats + (e.fats_grams || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  );

/**
 * A day's { original food -> replacement food } swap map + the user's custom
 * foods → the excludeFoods / extraFoods pair optimizeDay takes.
 *
 * The replacement inherits the original's meal slot and timing, so swapping the
 * evening dairy keeps it in the evening rather than landing at breakfast.
 * A replacement with no gram basis is dropped (and reported) rather than
 * silently removing the original food and putting nothing back.
 */
export function resolveSwaps(swaps, customFoods = []) {
  const excludeFoods = [];
  const extraFoods = [];
  const unresolved = [];
  const byName = new Map((customFoods || []).map((f) => [f.food_name, f]));

  for (const [original, replacement] of Object.entries(swaps || {})) {
    if (!replacement || replacement === original) continue;
    if (CATALOG_BY_NAME[replacement]) {
      // Swapping into a food the catalog already knows: nothing to add, its own
      // row is already a variable. Just take the original off the menu.
      excludeFoods.push(original);
      continue;
    }
    const slot = CATALOG_BY_NAME[original] || {};
    const item = swapCatalogItem(byName.get(replacement), {
      meal: slot.meal || "snack",
      timing: slot.timing || "anytime",
    });
    if (!item) {
      unresolved.push({ original, replacement });
      continue;
    }
    excludeFoods.push(original);
    extraFoods.push(item);
  }
  return { excludeFoods, extraFoods, unresolved };
}

/**
 * Solve one day. `dayContext` is the shape useDayPlanContext returns.
 * Pure — no hooks, no queries — so it can be called from a memo or from a
 * mutation that rebuilds a single date.
 */
export function resolveDayPlan({
  date,
  trainingDay,
  dayContext,
  calTarget,
  proteinTarget,
  fatTarget,
  isCut,
  profile,
  aggressiveCut,
  customFoods,
}) {
  const overridden = !!dayContext?.overrides?.[date];
  const dayTarget = dayContext?.targets?.[date]?.calories || calTarget;
  // Per-day engine protein is raw athlete_state — clamp it through the same
  // cut rule (1.3–1.5 g/lb) as useDailyTargets so no path bypasses the floor.
  // A manually-typed protein number is his call — don't clamp it back down.
  let dayProtein = dayContext?.targets?.[date]?.protein || proteinTarget;
  const weightLb = profileWeightLb(profile);
  if (isCut && dayProtein && !overridden) dayProtein = clampCutProtein(dayProtein, weightLb);
  // Hard floor the optimizer may ease down to when the calorie wall binds.
  const dayProteinFloor = isCut && weightLb ? Math.round(CUT_PROTEIN_HARD_FLOOR_PER_LB * weightLb) : null;
  const eatenCal = dayContext?.eaten?.[date]?.calories || 0;
  const eatenProtein = dayContext?.eaten?.[date]?.protein || 0;
  const eatenFats = dayContext?.eaten?.[date]?.fats || 0;
  const budget = Math.max(0, (dayTarget || 0) - eatenCal);

  const swaps = dayContext?.foodSwaps?.[date] || {};
  const { excludeFoods, extraFoods, unresolved } = resolveSwaps(swaps, customFoods);

  const rows = budget >= MIN_DAY_BUDGET
    ? buildDayEntries({
        date,
        trainingDay,
        calorieTarget: budget,
        proteinTarget: dayProtein ? Math.max(0, dayProtein - eatenProtein) : null,
        proteinFloor: dayProteinFloor ? Math.max(0, dayProteinFloor - eatenProtein) : null,
        fatTarget: fatTarget ? Math.max(0, fatTarget - eatenFats) : null,
        aggressiveCut,
        foodMins: dayContext?.foodMins?.[date] || {},
        excludeFoods,
        extraFoods,
      })
    : [];

  return {
    date,
    trainingDay,
    target: dayTarget,
    overridden,
    eatenCal,
    budget,
    rows,
    totals: sumRows(rows),
    cost: entriesCost(rows),
    // A hand-swapped food has no purchase price, so the cost is a floor, not a
    // total — the UI marks it approximate instead of showing a number that
    // looks like the day got cheaper.
    costApproximate: entriesUnpriced(rows) > 0,
    swaps,
    unresolvedSwaps: unresolved,
  };
}
