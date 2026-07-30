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
 * silently destroyed the logged sets. Nothing auto-finishes now.
 */
export const STALE_SESSION_MS = 24 * 60 * 60 * 1000;

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
