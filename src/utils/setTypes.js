/**
 * User-entered set marks (warm-up / drop / failure) layered on `set.set_type`.
 *
 * Sets live inside workout_logs.exercises (jsonb) and are saved verbatim, so
 * `set_type` persists with no column or migration. Programmed sets already
 * carry structural types ('working', 'top_set', 'daily_min', 'backoff', ...);
 * a mark overwrites `set_type` but stashes the structural one in
 * `set_type_base` so un-marking restores it exactly.
 *
 * Semantics (one rule, used by every consumer):
 *   warmup  - NOT work. Excluded from volume, e1RM, PRs, progression, engine.
 *   drop    - counted as work (volume/e1RM/PR), but not a progression input:
 *             a lighter back-down set would otherwise read as the working load.
 *   failure - counted as work everywhere, including progression (it is a
 *             working set taken to failure).
 */

export const SET_MARKS = ["warmup", "drop", "failure"];

export const SET_MARK_LABEL = {
  working: "Working",
  warmup: "Warm-up",
  drop: "Drop set",
  failure: "Failure",
};

/** Short tag shown beside the set number. */
export const SET_MARK_TAG = { warmup: "W", drop: "D", failure: "F" };

export const isWarmupSet = (s) => /warm/i.test(s?.set_type || "");

/** True for any set that counts as real work (everything but warm-ups). */
export const isWorkSet = (s) => !isWarmupSet(s);

export const workSets = (sets) => (Array.isArray(sets) ? sets.filter(isWorkSet) : []);

/** The mark currently on a set, or null when it is unmarked. */
export const currentMark = (s) => (SET_MARKS.includes(s?.set_type) ? s.set_type : null);

/**
 * Field patch for setting `mark` ('warmup' | 'drop' | 'failure' | 'working')
 * on a set. 'working' (or the mark already present) clears the mark.
 */
export function markPatch(set, mark) {
  const marked = currentMark(set);
  const base = marked ? (set.set_type_base || "working") : (set.set_type || "working");
  if (!SET_MARKS.includes(mark) || mark === marked) {
    return { set_type: base, set_type_base: undefined };
  }
  return { set_type: mark, set_type_base: base };
}
