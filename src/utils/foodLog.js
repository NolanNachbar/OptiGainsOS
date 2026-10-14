// Pure helpers for the food log (FoodTracker, MealTemplates, DataExport).
// Kept free of React/Supabase so they can be unit-checked by bundling alone.

/**
 * Short in-flight guard for one-tap log actions ("Log again", Recent "+").
 *
 * `isPending` from a mutation lags a render behind the tap, so two taps in the
 * same frame both get through, and a fast second tap right after success logs
 * the same food again. This blocks (a) anything while one is in flight and
 * (b) the SAME key for `windowMs` after the previous one settled. It's a
 * double-tap guard, not a debounce: a different food, or the same food after
 * the window, goes straight through.
 */
export function createTapGuard(windowMs = 800, now = () => Date.now()) {
  let busy = false;
  let lastKey = null;
  let lastAt = -Infinity;
  return {
    tryAcquire(key) {
      if (busy) return false;
      if (key === lastKey && now() - lastAt < windowMs) return false;
      busy = true;
      lastKey = key;
      lastAt = now();
      return true;
    },
    release() {
      busy = false;
      lastAt = now();
    },
  };
}

// ── My Foods saves ─────────────────────────────────────────────────────────

// Where a saved food's numbers came from. 'ai_estimate' and 'label_scan' are
// estimates and get a quiet badge; the rest are plain.
export const FOOD_SOURCE_LABELS = {
  ai_estimate: "AI estimate",
  label_scan: "Label scan",
};

const sameName = (a, b) =>
  String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

const macrosDiffer = (a, b) =>
  r1(a.calories) !== r1(b.calories) ||
  r1(a.protein_grams) !== r1(b.protein_grams) ||
  r1(a.carbs_grams) !== r1(b.carbs_grams) ||
  r1(a.fats_grams) !== r1(b.fats_grams);

/**
 * Decide what an implicit "save this food to My Foods" should do.
 *
 *  - no same-name food            -> create
 *  - same name, form is editing
 *    that very saved food and its
 *    macros were changed          -> update (an explicit edit)
 *  - same name otherwise          -> keep (never overwrite silently)
 *
 * Without the "keep" branch, logging a USDA "Egg" or an AI estimate called
 * "Chicken breast" replaced the macros of whatever was already saved under
 * that name.
 */
export function planCustomFoodSave(existing, food, { activeFoodId = null } = {}) {
  const match = (existing || []).find((f) => sameName(f.food_name, food.food_name));
  if (!match) return { action: "create" };
  if (activeFoodId && match.id === activeFoodId && macrosDiffer(match, food)) {
    return { action: "update", id: match.id, match };
  }
  return { action: "keep", id: match.id, match };
}

/** True when a Supabase/PostgREST error is about the named column not existing. */
export function isMissingColumnError(err, column) {
  const msg = String(err?.message || "");
  return (
    msg.includes(column) &&
    (err?.code === "PGRST204" || err?.code === "42703" || /column/i.test(msg))
  );
}

// ── Meal templates ─────────────────────────────────────────────────────────

/**
 * Template items keep the serving as "300 g" (what the edit dialog shows) plus
 * the structured unit/grams. A logged entry's serving_size is a bare number with
 * its unit in a separate column, so saving serving_size alone turned a 300 g
 * item into "300" and re-applied it as "300 serving".
 */
export function templateItemFromEntry(e) {
  const unit = e.serving_unit || null;
  const size = e.serving_size;
  const hasNumber = size != null && size !== "" && Number.isFinite(Number(size));
  return {
    food_name: e.food_name,
    serving_size: hasNumber && unit ? `${Number(size)} ${unit}` : size,
    serving_unit: unit,
    serving_grams: e.serving_grams ?? null,
    calories: e.calories,
    protein_grams: e.protein_grams,
    carbs_grams: e.carbs_grams,
    fats_grams: e.fats_grams,
    fiber_grams: e.fiber_grams ?? null,
    meal_type: e.meal_type,
  };
}

/** Amount + unit of a template item, whichever shape it was saved in. */
export function parseTemplateServing(item) {
  const raw = item?.serving_size;
  const text = String(raw ?? "").trim();
  const parts = text.split(/\s+/);
  const amount = parseFloat(parts[0]) || 1;
  const inline = parts.slice(1).join(" ");
  const unit = inline || item?.serving_unit || "serving";
  return { amount, unit };
}
