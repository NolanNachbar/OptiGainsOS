/**
 * Cross-cutting "is a workout in progress right now" flag.
 *
 * useWorkoutSession sets/clears this whenever a session starts/ends; main.jsx
 * reads it (outside React) to decide whether a pending service-worker reload
 * is safe to fire immediately or must wait until the workout is over — a
 * reload should never interrupt a set just because the phone got locked and
 * a new build happened to ship in the meantime.
 *
 * localStorage's own `storage` event only fires in OTHER tabs, not the tab
 * that made the change, so pair it with a same-tab custom event.
 */
/**
 * How old an in-progress session must be before we stop auto-resuming it and
 * ask instead. Anything newer restores silently: a workout must never appear to
 * restart because the phone locked or the tab reloaded mid-set.
 *
 * A full day, not the old 8h — and the old 8h branch *auto-finished* the
 * session, marking it completed while never writing a workout_logs row, which
 * silently destroyed the logged sets.
 */
export const STALE_SESSION_MS = 24 * 60 * 60 * 1000;

/**
 * How long a session can go with no set logged before we finish it *and write
 * its workout_log* on the next app open.
 *
 * This is the clock the removed 8h auto-finish should have used, in both
 * senses. It measures silence, not age: `updated_at` is bumped by saveProgress
 * on every set change, so a six-hour workout with sets throughout is never
 * touched, while this morning's forgotten session is. And it goes through the
 * log writer — the old branch flipped `status` alone, which is precisely how a
 * finished workout became invisible to every downstream learner.
 *
 * The write order is load-bearing: workout_log first, `status` only if that
 * succeeded. Never the reverse.
 *
 * Ordering, pinned by scripts/smoke.py:
 *   AUTO_FINISH_STALE_MS (3h, silence) < ACTIVE_SESSION_MAX_AGE_MS (12h, age)
 *                                      < STALE_SESSION_MS (24h, age)
 * Two different clocks. Auto-finish asks "still lifting?", the other two ask
 * "is this still today's workout?". A session past 24h old is never
 * auto-finished — back-dating a log that far retroactively rewrites MRV and
 * volume history, so those still go to the Resume?/Start Fresh dialog.
 */
export const AUTO_FINISH_STALE_MS = 3 * 60 * 60 * 1000;

const KEY = "optigains-workout-active";
const EVENT = "optigains-workout-flag-changed";

export function setWorkoutActive(active) {
  if (active) localStorage.setItem(KEY, "1");
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVENT));
}

export function isWorkoutActive() {
  return !!localStorage.getItem(KEY);
}

export function onWorkoutActiveChange(cb) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}
