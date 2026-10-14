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
