import { EXERCISE_DB } from "@/ml/exerciseDB";

// Maps our EXERCISE_DB muscle names → react-body-highlighter muscle keys
const MUSCLE_NAME_MAP = {
  "Chest": "chest", "Upper Chest": "chest", "Lower Chest": "chest",
  "Lats": "upper-back", "Upper Back": "upper-back", "Back": "upper-back", "Rhomboids": "upper-back",
  "Lower Back": "lower-back", "Spine": "lower-back",
  "Traps": "trapezius", "Neck": "neck",
  "Front Delts": "front-deltoids", "Shoulders": "front-deltoids", "Side Delts": "front-deltoids",
  "Rear Delts": "back-deltoids",
  "Biceps": "biceps", "Brachialis": "biceps",
  "Triceps": "triceps",
  "Forearms": "forearm", "Grip": "forearm",
  "Abs": "abs", "Core": "abs", "Lower Abs": "abs",
  "Obliques": "obliques",
  "Quads": "quadriceps", "Legs": "quadriceps",
  "Hamstrings": "hamstring", "Posterior Chain": "hamstring",
  "Glutes": "gluteal",
  "Calves": "calves", "Soleus": "calves",
  "Adductors": "adductor", "Hip Adductors": "adductor", "Inner Thighs": "adductor",
  "Abductors": "abductors", "Hip Abductors": "abductors",
};

// Build exact lookup (lowercase) for fast O(1) hits
const EXERCISE_LOOKUP = new Map(
  EXERCISE_DB.map((ex) => [ex.name.toLowerCase(), ex])
);

// Normalize: lowercase, strip hyphens/punctuation, collapse spaces
function normalize(str) {
  return (str || "").toLowerCase().replace(/[-_]/g, " ").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

// Pre-build normalized lookup and token sets for fuzzy fallback
const NORMALIZED_DB = EXERCISE_DB.map((ex) => ({
  entry: ex,
  norm: normalize(ex.name),
  tokens: new Set(normalize(ex.name).split(" ")),
}));

function findExercise(name) {
  if (!name) return null;

  // 1. Exact match
  const exact = EXERCISE_LOOKUP.get(name.toLowerCase());
  if (exact) return exact;

  // 2. Normalized exact match (handles hyphen differences like "Close-Grip" vs "Close Grip")
  const normQuery = normalize(name);
  const normMatch = NORMALIZED_DB.find((d) => d.norm === normQuery);
  if (normMatch) return normMatch.entry;

  // 3. Substring match — query is contained in a DB name or vice versa
  const subMatch = NORMALIZED_DB.find(
    (d) => d.norm.includes(normQuery) || normQuery.includes(d.norm)
  );
  if (subMatch) return subMatch.entry;

  // 4. Token overlap — pick the DB entry that shares the most words
  const queryTokens = new Set(normQuery.split(" ").filter((t) => t.length > 2));
  let bestEntry = null;
  let bestScore = 0;
  for (const d of NORMALIZED_DB) {
    let overlap = 0;
    for (const t of queryTokens) if (d.tokens.has(t)) overlap++;
    // Require at least 2 matching tokens and more than half of query tokens matched
    if (overlap >= 2 && overlap / queryTokens.size > 0.5 && overlap > bestScore) {
      bestScore = overlap;
      bestEntry = d.entry;
    }
  }
  return bestEntry;
}

function toLibMuscles(muscleNames = []) {
  return [...new Set(muscleNames.map((m) => MUSCLE_NAME_MAP[m]).filter(Boolean))];
}

/**
 * For a workout detail view — shows which muscles are hit (primary vs secondary intensity).
 * Returns IExerciseData[] for react-body-highlighter.
 */
export function getWorkoutBodyData(exercises = []) {
  const result = [];
  for (const ex of exercises) {
    const dbEntry = findExercise(ex.name || ex.exercise_name);
    if (!dbEntry) continue;

    const primary = toLibMuscles(dbEntry.primaryMuscle);
    const secondary = toLibMuscles(dbEntry.secondaryMuscle);

    if (primary.length) result.push({ name: ex.name, muscles: primary, frequency: 2 });
    if (secondary.length) result.push({ name: `${ex.name} (secondary)`, muscles: secondary, frequency: 1 });
  }
  return result;
}

/**
 * For the weekly dashboard heat map — sums actual set counts per muscle.
 * workoutLogs is an array of log objects with an `exercises` array.
 * Returns IExerciseData[] for react-body-highlighter.
 */
export function getWeeklyBodyData(workoutLogs = []) {
  // Tally sets per library muscle name
  const setsByMuscle = {};

  for (const log of workoutLogs) {
    for (const ex of log.exercises || []) {
      const dbEntry = findExercise(ex.name || ex.exercise_name);
      if (!dbEntry) continue;

      const setCount = ex.sets?.length || 1;
      const primary = toLibMuscles(dbEntry.primaryMuscle);
      const secondary = toLibMuscles(dbEntry.secondaryMuscle);

      for (const m of primary) setsByMuscle[m] = (setsByMuscle[m] || 0) + setCount;
      for (const m of secondary) setsByMuscle[m] = (setsByMuscle[m] || 0) + Math.round(setCount * 0.5);
    }
  }

  // Convert to IExerciseData format (one entry per muscle, frequency = set count)
  return Object.entries(setsByMuscle).map(([muscle, sets]) => ({
    name: muscle,
    muscles: [muscle],
    frequency: sets,
  }));
}
