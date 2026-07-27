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
