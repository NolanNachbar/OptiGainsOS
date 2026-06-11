/**
 * usePlannedDayRebalance — keeps a day's planned (not-yet-checked-off) meal-plan
 * rows in sync with the day's CURRENT budget.
 *
 * The weekly plan is approved once, but the engine's recovery-gated target moves
 * day to day and the user logs off-plan foods. Without this, checking off every
 * planned item lands wherever the plan stood at approval time — which can be
 * well over (or under) the day's budget. Here we rescale the remaining planned
 * portions so that eaten + planned ≈ useDailyTargets(date).calories, then write
 * the corrected rows back so what you check off is what you actually counted.
 *
 * Checking an item off doesn't retrigger a rescale (eaten goes up exactly as
 * planned goes down), and a written rescale converges in one pass — the next
 * render falls inside the tolerance band (or, when the cut protein floor
 * clamps the shrink, lands exactly on the floor and stops).
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { db } from "@/api/supabaseClient";
import { invalidateFood } from "@/lib/queryKeys";
import { FIXED_ITEMS } from "@/config/dietPlans";

const r1 = (n) => Math.round(n * 10) / 10;

// Fixed staples (whey scoop, post-lift dextrose) stay at their exact serving —
// rescaling a 31 g scoop to 28 g is noise nobody measures. The flexible food
// rows absorb the whole adjustment instead.
const STAPLE_NAMES = new Set(FIXED_ITEMS.map((f) => f.food));

// Don't bother correcting drifts under 2% of the target (or 25 kcal) — that's
// rounding noise, and writing it would churn rows for nothing.
const tolerance = (target) => Math.max(25, target * 0.02);

// Portions only stretch/shrink so far before the food stops making sense as a
// meal; outside this band we leave the rows alone and let the UI flag it.
const FACTOR_MIN = 0.5;
const FACTOR_MAX = 1.75;

export function usePlannedDayRebalance(date, entries, calorieTarget, proteinFloor = null) {
  const qc = useQueryClient();
  const attempted = useRef(null);

  const planned = (entries || []).filter((e) => e.planned);
  const eaten = (entries || []).filter((e) => !e.planned);
  const eatenCal = eaten.reduce((s, e) => s + (e.calories || 0), 0);
  const eatenProtein = eaten.reduce((s, e) => s + (e.protein_grams || 0), 0);
  const plannedCal = planned.reduce((s, e) => s + (e.calories || 0), 0);
  const plannedProtein = planned.reduce((s, e) => s + (e.protein_grams || 0), 0);
  const remaining = (calorieTarget || 0) - eatenCal;

  const flexible = planned.filter((p) => !STAPLE_NAMES.has(p.food_name));
  const flexibleCal = flexible.reduce((s, e) => s + (e.calories || 0), 0);
  const flexibleProtein = flexible.reduce((s, e) => s + (e.protein_grams || 0), 0);
  const stapleCal = plannedCal - flexibleCal;
  const stapleProtein = plannedProtein - flexibleProtein;

  const drift = plannedCal - remaining;
  const needsRescale =
    flexible.length > 0 && calorieTarget > 0 && flexibleCal > 0 &&
    Math.abs(drift) > tolerance(calorieTarget);
  const rawFactor = needsRescale ? (remaining - stapleCal) / flexibleCal : 1;
  // Cut-floor guard: shrinking scales protein down with calories, and the cut
  // rule (1.3 g/lb) is a hard FLOOR — never rewrite the day's rows below it.
  // The factor bottoms out where eaten + staples + flexible×factor lands ON
  // the floor; calories then run over budget and `proteinHeld` says why.
  const floorFactor =
    proteinFloor && flexibleProtein > 0
      ? Math.min(1, (proteinFloor - eatenProtein - stapleProtein) / flexibleProtein)
      : -Infinity;
  const factor = rawFactor < 1 ? Math.max(rawFactor, floorFactor) : rawFactor;
  const proteinHeld = needsRescale && rawFactor < floorFactor;
  const canRescale =
    needsRescale && remaining >= 100 &&
    factor >= FACTOR_MIN && factor <= FACTOR_MAX &&
    // A floor-clamped factor of ~1 means "leave the rows alone" — writing
    // identical values back would churn forever without converging.
    Math.abs(factor - 1) > 0.002;

  useEffect(() => {
    if (!canRescale) return;
    // One attempt per observed (date, target, totals) state — a successful write
    // changes the totals, so a repeat key means the write didn't land; skip it.
    const key = `${date}|${calorieTarget}|${Math.round(plannedCal)}|${Math.round(eatenCal)}`;
    if (attempted.current === key) return;
    attempted.current = key;

    Promise.all(
      flexible.map((p) => {
        const oldGrams = parseFloat(p.serving_size) || 0;
        if (oldGrams <= 0) return null;
        const grams = Math.max(1, Math.round(oldGrams * factor));
        const f = grams / oldGrams;
        return db.entities.FoodEntry.update(p.id, {
          serving_size: grams,
          calories: Math.round((p.calories || 0) * f),
          protein_grams: r1((p.protein_grams || 0) * f),
          carbs_grams: r1((p.carbs_grams || 0) * f),
          fats_grams: r1((p.fats_grams || 0) * f),
        });
      })
    )
      .then(() => invalidateFood(qc))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRescale, date, calorieTarget, plannedCal, eatenCal]);

  return {
    plannedCount: planned.length,
    plannedCal: Math.round(plannedCal),
    remaining: Math.round(remaining),
    // true when checking everything off would land within budget
    fits: plannedCal <= remaining + tolerance(calorieTarget || 0),
    // true when the cut protein floor stopped (or limited) a shrink — the day
    // will run over its calories, deliberately, to hold protein
    proteinHeld,
    // true when a corrective write is in flight this render
    rebalancing: canRescale,
  };
}
