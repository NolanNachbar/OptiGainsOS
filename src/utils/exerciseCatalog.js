// Exercise identity for the app, mirroring scripts/engine/log_ingest.py canon()
// exactly so the UI and the engine agree on which logged names are the same
// exercise. Both read src/data/exerciseCatalog.json; exerciseCatalog.test.js and
// scripts/test_exercise_catalog.py check the same cases against each side.
import catalog from "@/data/exerciseCatalog.json";

const ALIASES = catalog.aliases;
const ABBREVIATIONS = catalog.abbreviations;
const ROLE_MAP = catalog.role_map || {};
const EXERCISES = catalog.exercises;
const EXERCISES_LOWER = Object.fromEntries(Object.entries(EXERCISES).map(([k, v]) => [k.toLowerCase(), v]));

const singularize = (key) => {
  const words = key.split(" ");
  if (!words.length) return key;
  const last = words[words.length - 1];
  if (/(sses|shes|ches|xes)$/.test(last)) words[words.length - 1] = last.slice(0, -2);
  else if (last.length > 3 && last.endsWith("s") && !last.endsWith("ss")) words[words.length - 1] = last.slice(0, -1);
  return words.join(" ");
};

// Python's re.sub(r"[a-z]+", first-letter-upper) on the lowercased key.
const canonCase = (key) => key.replace(/[a-z]+/g, (m) => m[0].toUpperCase() + m.slice(1));

const collapse = (name) => String(name || "").split(/\s+/).filter(Boolean).join(" ").toLowerCase();

/** Canonical exercise name; same output as the engine's canon(). */
export function canon(name) {
  let key = collapse(name);
  if (!key) return "";
  if (ALIASES[key]) return ALIASES[key];
  key = key.replace(/[a-z0-9]+/g, (m) => ABBREVIATIONS[m] ?? m);
  if (ALIASES[key]) return ALIASES[key];
  key = singularize(key);
  if (ALIASES[key]) return ALIASES[key];
  return canonCase(key);
}

/**
 * Name an exercise is listed under in the app: set-role variants ("Bench Press
 * (Top Set)", "(Back-off Vol)") fold into their base lift, then canon().
 */
export function displayExercise(name) {
  return ROLE_MAP[collapse(name)] || canon(name);
}

/** Catalog record {primary, secondary, pattern, equipment, goal?} or null. */
export function exerciseInfo(name) {
  const n = displayExercise(name);
  return EXERCISES[n] || EXERCISES_LOWER[n.toLowerCase()] || null;
}

/** True when two logged names are the same exercise (set role kept apart). */
export const sameExercise = (a, b) => {
  const ca = canon(a);
  return !!ca && ca.toLowerCase() === canon(b).toLowerCase();
};
