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
