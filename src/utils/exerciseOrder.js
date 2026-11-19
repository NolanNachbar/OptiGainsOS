import { findExercise } from "./muscleVolumeUtils";

// One ordering rule for every place a workout's exercise list is built, so the
// program view, the day card and the logger all show the same sequence. Within
// a workout, no two neighbouring movements train the same muscle, and where
// possible they alternate push / pull / legs, so chest isn't fatigued while
// back sits fresh. Reorder only: nothing is added, dropped or renamed.

const GROUP_BY_MUSCLE = {
  "Chest": "chest", "Upper Chest": "chest", "Lower Chest": "chest",
  "Lats": "back", "Upper Back": "back", "Back": "back", "Rhomboids": "back", "Traps": "back",
  "Front Delts": "shoulders", "Shoulders": "shoulders", "Side Delts": "shoulders",
  "Rear Delts": "rear_delts",
  "Triceps": "triceps",
  "Biceps": "biceps", "Brachialis": "biceps", "Forearms": "biceps",
  "Quads": "legs", "Legs": "legs", "Hamstrings": "legs", "Posterior Chain": "legs",
  "Glutes": "legs", "Calves": "legs", "Soleus": "legs", "Adductors": "legs",
  "Hip Adductors": "legs", "Abductors": "legs", "Hip Abductors": "legs",
  "Abs": "core", "Core": "core", "Lower Abs": "core", "Obliques": "core", "Lower Back": "core",
};
const CHAIN_BY_GROUP = {
  chest: "push", shoulders: "push", triceps: "push",
  back: "pull", rear_delts: "pull", biceps: "pull",
  legs: "legs", core: "core",
};

// Exercises missing from EXERCISE_DB (Larsen Press, Weighted Dip, ...) fall back
// to their name. Order matters: the specific patterns come first.
const NAME_RULES = [
  [/hamstring curl|leg curl|leg ext|calf|squat|deadlift|hip thrust|lunge|leg press/i, "legs"],
  [/pull-?up|chin-?up|row|pulldown|pull-down/i, "back"],
  [/face pull|rear delt|reverse fly/i, "rear_delts"],
  [/curl/i, "biceps"],
  [/skull|tricep|pushdown|close.grip bench/i, "triceps"],
  [/lateral raise|overhead press|shoulder press|kettlebell/i, "shoulders"],
  [/bench|press|dip|fly|push-?up|larsen/i, "chest"],
  [/plank|crunch|leg raise|ab wheel/i, "core"],
];

function groupOf(ex) {
  const name = ex?.name || ex?.exercise_name || "";
  const primary = findExercise(name)?.primaryMuscle?.[0];
  if (GROUP_BY_MUSCLE[primary]) return GROUP_BY_MUSCLE[primary];
  return NAME_RULES.find(([re]) => re.test(name))?.[1] || "other";
}
const chainOf = (g) => CHAIN_BY_GROUP[g] || "other";

// A warm-up / activation drill stays glued to the lift that follows it.
const isLeadIn = (ex) => /warm-?up|activation/i.test(ex?.notes || "");

// Lexicographic: is score a strictly better than b?
function beats(a, b) {
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] > b[k];
  return false;
}

export function orderExercisesForFatigue(exercises) {
  if (!Array.isArray(exercises) || exercises.length < 3) return exercises;

  // Units: a lead-in drill travels with the next movement.
  const units = [];
  for (let i = 0; i < exercises.length; i++) {
    const unit = [exercises[i]];
    while (isLeadIn(unit[unit.length - 1]) && i + 1 < exercises.length) unit.push(exercises[++i]);
    units.push({ items: unit, group: groupOf(unit[unit.length - 1]) });
  }
  for (const u of units) u.chain = chainOf(u.group);

  // The first unit is the day's opening lift; it stays put.
  const ordered = [units[0]];
  const rest = units.slice(1);
  let prev = units[0];
  while (rest.length) {
    const chainLeft = {};
    for (const u of rest) chainLeft[u.chain] = (chainLeft[u.chain] || 0) + 1;
    let best = 0, bestScore = null;
    rest.forEach((u, i) => {
      const score = [u.group !== prev.group ? 1 : 0, u.chain !== prev.chain ? 1 : 0, chainLeft[u.chain], -i];
      if (!bestScore || beats(score, bestScore)) { best = i; bestScore = score; }
    });
    prev = rest.splice(best, 1)[0];
    ordered.push(prev);
  }
  return ordered.flatMap((u) => u.items);
}
