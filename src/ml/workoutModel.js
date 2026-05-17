// src/ml/workoutModel.js
//
// ============================================================================
// SISYPHUS' SCHEDULE -- RULE-BASED RECOMMENDATION ENGINE (Production Fallback)
// ============================================================================
//
// ROLE IN THE SYSTEM:
//   This file is the rule-based fallback layer. It runs when the Random Forest
//   ML model (rfModel.js) is unavailable, still training, or has insufficient
//   confidence. In practice it also powers the WorkoutApprovalModal review step
//   since that UI generates plans before the ML model initializes.
//
// WHAT IT DOES:
//   - Generates weekly workout plans from hand-coded split templates
//   - Selects exercises using weighted scoring functions (goal fit, equipment,
//     difficulty, movement pattern)
//   - Replaces disliked exercises using muscle overlap + pattern matching
//   - Applies training phase logic (intro / progression / deload)
//
// WHAT IT IS NOT:
//   This is NOT a machine learning model. Every rule in this file was written
//   explicitly by a developer. Nothing is learned from data. It encodes the
//   same domain knowledge a trained ML model would discover automatically --
//   but as explicit weighted functions rather than learned parameters.
//
// RELATIONSHIP TO OTHER ML FILES:
//   workoutModelML.js  -- original SVD + Apriori architecture (not in production)
//   rfModel.js         -- Random Forest classifier (primary ML, runs first)
//   mlRecommender.js   -- routes between RF model and this fallback
//   fitnessTemplates.js-- fitness archetype templates used by the RF model
//
// WHY THIS EXISTS INSTEAD OF PURE ML:
//   The SVD and Apriori models in workoutModelML.js required 200+ user
//   reactions and 500+ workout completions to train meaningfully. Beta testing
//   produced 21 reactions across 3 users -- insufficient for either model.
//   This rule-based system was implemented as the designed fallback. The Random
//   Forest (rfModel.js) handles ML using synthetic data augmentation until
//   sufficient real interaction data accumulates.
//
// Inputs:  onboarding profile (goal, level, daysPerWeek, equipment, duration)
// Output:  weekly workout plan + replacement alternatives for disliked exercises
// ============================================================================

import { EXERCISE_DB } from "./exerciseDB";

// ============================================================================
// SPLIT TEMPLATES
// ============================================================================

const SPLITS = {
  2: {
    "General Fitness": ["Full Body", "Full Body"],
    "Weight Loss": ["Full Body", "Full Body"],
    "Muscle Gain": ["Upper", "Lower"],
    "Build Endurance": ["Full Body", "Full Body"],
    "Improve Flexibility": ["Full Body", "Full Body"],
  },
  3: {
    "General Fitness": ["Full Body", "Full Body", "Full Body"],
    "Weight Loss": ["Full Body", "Full Body", "Full Body"],
    "Muscle Gain": ["Upper", "Lower", "Full Body"],
    "Build Endurance": ["Full Body", "Full Body", "Full Body"],
    "Improve Flexibility": ["Full Body", "Full Body", "Full Body"],
  },
  4: {
    "General Fitness": ["Upper", "Lower", "Upper", "Lower"],
    "Weight Loss": ["Upper", "Lower", "Upper", "Lower"],
    "Muscle Gain": ["Upper", "Lower", "Upper", "Lower"],
    "Build Endurance": ["Upper", "Lower", "Upper", "Lower"],
  },
  5: {
    "General Fitness": ["Push", "Pull", "Legs", "Full Body", "Full Body"],
    "Weight Loss": ["Push", "Pull", "Legs", "Full Body", "Full Body"],
    "Muscle Gain": ["Push", "Pull", "Legs", "Push", "Pull"],
    "Build Endurance": ["Push", "Pull", "Legs", "Full Body", "Full Body"],
  },
  6: {
    "Muscle Gain": ["Push", "Pull", "Legs", "Push", "Pull", "Legs"],
    "General Fitness": ["Push", "Pull", "Legs", "Push", "Pull", "Legs"],
    "Weight Loss": ["Push", "Pull", "Legs", "Push", "Pull", "Legs"],
  }
};

const DAY_PATTERNS = {
  Push:       ["Horizontal Push", "Incline Press", "Decline Press", "Vertical Push"],
  Pull:       ["Vertical Pull", "Horizontal Pull", "Elevation"],   // NO Hinge — hinges stay on Legs/Lower
  Legs:       ["Squat", "Hinge", "Lunge", "Step", "Bridge", "Plantar Flexion"],
  Upper:      ["Horizontal Push", "Incline Press", "Vertical Push", "Vertical Pull", "Horizontal Pull", "Elevation"],
  Lower:      ["Squat", "Hinge", "Lunge", "Step", "Bridge", "Plantar Flexion"],
  "Full Body":["Squat", "Hinge", "Horizontal Push", "Horizontal Pull", "Vertical Push", "Vertical Pull", "Lunge", "Bridge"],
};

// ============================================================================
// TRAINING PHASES
// ============================================================================

// Training phases cycle over weeks:
//   Weeks 1-3:  Starting Phase  — learn movements, lighter load
//   Weeks 4-7:  Strength Phase  — progressive overload (4 weeks)
//   Week  8:    Deload Phase    — recover (1 week)
//   Then repeats: Strength x4 → Deload x1

export const TRAINING_PHASES = {
  starting: {
    name: "Starting Phase",
    description: "Focus on learning movements and building your foundation",
    setsMultiplier: 0.75,   // 25% fewer sets
    repsModifier: "+2",     // slightly higher reps to practice form
    restMultiplier: 1.25,   // more rest between sets
    intensityNote: "Light weight — focus on form and technique"
  },
  strength: {
    name: "Strength Phase",
    description: "Progressive overload to build strength and muscle",
    setsMultiplier: 1.0,
    repsModifier: "0",
    restMultiplier: 1.0,
    intensityNote: "Increase weight when you hit the top of the rep range"
  },
  deload: {
    name: "Deload Phase",
    description: "Reduced volume for recovery — you earned it",
    setsMultiplier: 0.5,    // cut volume in half
    repsModifier: "-2",     // slightly fewer reps
    restMultiplier: 1.5,    // more rest
    intensityNote: "Use ~50% of normal weight, prioritise movement quality"
  }
};

/**
 * Determine which training phase a given week falls into.
 *
 * Phase schedule:
 *   Weeks 1-3  → Starting
 *   Then repeating cycles of [Strength x4, Deload x1]
 *
 * @param {number} weekNumber - 1-indexed week number
 * @returns {{ phase, phaseWeek, totalWeek, name, description, intensityNote,
 *             setsMultiplier, repsModifier, restMultiplier }}
 */
export function getTrainingPhase(weekNumber) {
  const week = Math.max(1, weekNumber);

  if (week <= 3) {
    return { phase: "starting", phaseWeek: week, totalWeek: week, ...TRAINING_PHASES.starting };
  }

  // After week 3: 5-week cycles (4 strength + 1 deload)
  const cyclePos = (week - 4) % 5; // 0-3 = strength, 4 = deload

  if (cyclePos === 4) {
    return { phase: "deload", phaseWeek: 1, totalWeek: week, ...TRAINING_PHASES.deload };
  }

  return { phase: "strength", phaseWeek: cyclePos + 1, totalWeek: week, ...TRAINING_PHASES.strength };
}

/**
 * Return a human-readable phase schedule over N weeks.
 * Useful for displaying a monthly/programme calendar.
 *
 * @param {number} totalWeeks
 * @returns {Array<{ week, phase, name, description, intensityNote }>}
 */
export function getPhaseSchedule(totalWeeks = 12) {
  return Array.from({ length: totalWeeks }, (_, i) => {
    const info = getTrainingPhase(i + 1);
    return {
      week: i + 1,
      phase: info.phase,
      name: info.name,
      description: info.description,
      intensityNote: info.intensityNote
    };
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function normalize(s) {
  return String(s || "").trim().toLowerCase();
}

function toSet(arr) {
  return new Set((arr || []).map(normalize));
}

// ============================================================================
// EQUIPMENT & DIFFICULTY FILTERS
// ============================================================================

// Maps profile equipment values to exact exerciseDB equipment strings.
//
// Profile stores:  'none' | 'dumbbells' | 'barbells' | 'resistance_bands' |
//                  'pull_up_bar' | 'bench' | 'full_gym'
//
// ExerciseDB uses: 'bodyweight' | 'dumbbells' | 'kettlebell' | 'barbell' |
//                  'rack' | 'bench' | 'cable' | 'machine' | 'resistance_bands' |
//                  'pull_up_bar' | 'trap_bar' | 'box'

// Tags that count as "no equipment needed" in exerciseDB
const BODYWEIGHT_ONLY_TAGS = new Set(["bodyweight", "body weight", "none", ""]);

// What each profile equipment value unlocks in exerciseDB
const EQUIPMENT_ALIAS_MAP = {
  "none":             [],  // bodyweight-only gate — handled separately
  "dumbbells":        ["dumbbells", "kettlebell"],
  "barbells":         ["barbell", "rack", "trap_bar"],
  "resistance_bands": ["resistance_bands"],
  "pull_up_bar":      ["pull_up_bar"],
  "bench":            ["bench"],
  // cable + machine only unlock with full_gym
};

// Returns expanded Set of allowed equipment tags, or null for full_gym (allow all).
function expandEquipment(userEquipment) {
  if (!userEquipment || userEquipment.length === 0) {
    // Nothing selected — treat as bodyweight only
    return new Set(["__bodyweight_only__", "bodyweight", "body weight"]);
  }

  const normalized = userEquipment.map(normalize);

  // Full gym unlocks everything
  if (normalized.some(k => k === "full_gym" || k === "full gym access" || k === "full gym")) {
    return null;
  }

  // Only 'none' selected — strict bodyweight gate
  const nonNone = normalized.filter(k => k !== "none");
  if (nonNone.length === 0) {
    return new Set(["__bodyweight_only__", "bodyweight", "body weight"]);
  }

  // Build expanded set from all real equipment selected
  // ('none' alongside real equipment is ignored — user has actual equipment)
  const expanded = new Set();
  expanded.add("bodyweight");
  expanded.add("body weight");

  for (const key of normalized) {
    if (key === "none") continue;
    expanded.add(key);
    for (const alias of (EQUIPMENT_ALIAS_MAP[key] || [])) {
      expanded.add(normalize(alias));
    }
  }

  return expanded;
}

function fitsEquipment(ex, userEquipment) {
  const expanded = expandEquipment(userEquipment);

  // Full gym — everything passes
  if (expanded === null) return true;

  const needed = (ex.equipment || []).map(normalize);

  // Strict bodyweight-only gate: ALL equipment tags must be bodyweight variants
  if (expanded.has("__bodyweight_only__")) {
    return needed.every(e => BODYWEIGHT_ONLY_TAGS.has(e));
  }

  // Standard check — but with an important nuance:
  // If an exercise lists BOTH bodyweight AND specific equipment (e.g. pull_up_bar),
  // it means you NEED that equipment to do the exercise — bodyweight alone isn't enough.
  // So we filter out the generic bodyweight tags and check the remaining specific
  // equipment requirements separately.
  //
  // Example: Pull-Up = ["bodyweight", "pull_up_bar"]
  //   - User has resistance_bands only
  //   - Without this fix: passes (bodyweight is in expanded)
  //   - With this fix: fails (pull_up_bar is not in expanded)
  //
  // Example: Push-Up = ["bodyweight"]
  //   - User has resistance_bands only
  //   - Passes correctly (pure bodyweight, no special equipment needed)

  const specificEquipment = needed.filter(e => !BODYWEIGHT_ONLY_TAGS.has(e));

  // Pure bodyweight exercise — always passes (no equipment needed)
  if (specificEquipment.length === 0) return true;

  // Has specific equipment requirements — user must have at least one of them
  return specificEquipment.some(e => expanded.has(e));
}

function fitsDifficulty(ex, level) {
  const l = normalize(level);
  const d = Number(ex.difficulty || 2);
  if (l === "beginner") return d <= 1;
  if (l === "intermediate") return d <= 2;
  return d >= 2; // advanced: skip trivial difficulty-1 bodyweight basics
}

function fitsDifficultyLoose(ex, level) {
  const l = normalize(level);
  const d = Number(ex.difficulty || 2);
  if (l === "beginner") return d <= 1;
  if (l === "intermediate") return d <= 2;
  return true; // advanced fallback: allow all
}

// ============================================================================
// SIMILARITY SCORING
// ============================================================================

function tagsFor(ex) {
  return Array.from(new Set([
    ...(ex.primaryMuscle || []),
    ex.type,
    ...(ex.equipment || []),
    ex.pattern,
    ex.name
  ].map(normalize))).filter(Boolean);
}

function scoreSimilarity(a, b) {
  const A = toSet(tagsFor(a));
  const B = toSet(tagsFor(b));
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Score an exercise for a single goal string
function scoreExerciseForSingleGoal(ex, goalStr) {
  const g = normalize(goalStr);
  const type = normalize(ex.type);
  const pattern = normalize(ex.pattern);
  const tags = (ex.goalTags || []).map(normalize);
  let score = 0;

  // Bonus if exercise explicitly lists this goal in its goalTags
  if (tags.includes(g)) score += 2;

  if (g.includes("muscle") || g.includes("gain")) {
    if (type === "compound") score += 3;
    if (type === "isolation") score += 2;
    if (pattern.includes("olympic")) score += 2;
    // Prefer heavy patterns for muscle gain
    if (["squat","hinge","horizontal push","vertical pull","horizontal pull"].includes(pattern)) score += 1;
  }
  if (g.includes("weight") || g.includes("loss")) {
    if (type === "compound") score += 3;
    if (pattern.includes("olympic")) score += 2;
    // Full-body and multi-joint moves burn more calories
    if (["squat","hinge","lunge"].includes(pattern)) score += 1;
    score += 1;
  }
  if (g.includes("endurance")) {
    // Bodyweight and band exercises suit endurance better than heavy barbell
    const eq = (ex.equipment || []).map(normalize);
    if (eq.some(e => e === "bodyweight" || e === "resistance_bands")) score += 2;
    if (type === "compound") score += 2;
    score += 1;
  }
  if (g.includes("flexibility")) {
    if (pattern.includes("stretch") || pattern.includes("mobility")) score += 4;
    if (ex.isCardio) score += 1;
    score += 1;
  }
  if (g.includes("general") || g.includes("fitness")) {
    if (type === "compound") score += 2;
    score += 1;
  }

  return score;
}

// Handle goal as either a string or an array of goals.
// When multiple goals are selected, score against all of them and sum.
// This means exercises that fit MULTIPLE goals rank highest.
function scoreExerciseForGoal(ex, goal) {
  if (Array.isArray(goal)) {
    // Multi-goal: sum scores across all goals
    return goal.reduce((total, g) => total + scoreExerciseForSingleGoal(ex, g), 0);
  }
  return scoreExerciseForSingleGoal(ex, goal);
}

// ============================================================================
// PUSH DAY ANCHOR — guarantee a press with gym equipment as first exercise
// ============================================================================

// Shared anchor helper — picks the best compound movement from given patterns
function selectAnchor({ level, equipment, goal, usedNames, patterns, scoreFn, dislikedExercises = [] }) {
  const normPatterns = patterns.map(normalize);
  const dislikedSet = new Set((dislikedExercises || []).map(normalize));

  const makePool = (diffFn) => EXERCISE_DB.filter(ex => {
    if (usedNames.has(ex.name)) return false;
    if (dislikedSet.has(normalize(ex.name))) return false;
    if (!diffFn(ex, level)) return false;
    if (!fitsEquipment(ex, equipment)) return false;
    if (normalize(ex.type) !== "compound") return false;
    return normPatterns.includes(normalize(ex.pattern));
  });

  let candidates = makePool(fitsDifficulty);
  if (candidates.length === 0) candidates = makePool(fitsDifficultyLoose);
  if (candidates.length === 0) return null;

  const scored = candidates.map(ex => ({
    ex,
    priority: scoreFn(ex) + scoreExerciseForGoal(ex, goal)
  }));
  scored.sort((a, b) => b.priority - a.priority);
  return scored[0]?.ex || null;
}

// Push day anchor: Bench Press > Dumbbell Bench > Machine Press
function selectPushAnchor({ level, equipment, goal, usedNames }) {
  return selectAnchor({
    level, equipment, goal, usedNames,
    patterns: ["Horizontal Push", "Incline Press", "Decline Press"],
    scoreFn: (ex) => {
      const n = normalize(ex.name);
      const e = (ex.equipment || []).map(normalize);
      let p = 0;
      if (n === "bench press") p += 20;
      else if (n.includes("bench press")) p += 15;
      else if (n.includes("dumbbell bench")) p += 13;
      else if (n.includes("machine chest") || n.includes("chest press")) p += 11;
      if (e.some(x => ["barbell", "dumbbells", "machine"].includes(x))) p += 5;
      if (normalize(ex.pattern) === "horizontal push") p += 3;
      return p;
    },
  });
}

// Leg day anchor: Back Squat > Front Squat > barbell squat > Goblet Squat
// NOTE: Hinges (deadlifts/RDLs) stay on Legs day too, but squat is the primary anchor
function selectLegAnchor({ level, equipment, goal, usedNames }) {
  return selectAnchor({
    level, equipment, goal, usedNames,
    patterns: ["Squat", "Split Squat"],   // Hinge left for fill step on Legs day
    scoreFn: (ex) => {
      const n = normalize(ex.name);
      const e = (ex.equipment || []).map(normalize);
      let p = 0;
      if (n === "back squat") p += 20;
      else if (n === "front squat") p += 17;
      else if (n.includes("squat") && e.includes("barbell")) p += 12;
      else if (n.includes("goblet squat")) p += 9;
      else if (n.includes("squat") && !n.includes("sissy") && !n.includes("smith")) p += 6;
      if (e.some(x => ["barbell", "rack", "dumbbells"].includes(x))) p += 5;
      return p;
    },
  });
}

// Pull day anchor: Rows and Pull-Ups ONLY — no hinges (deadlifts belong on Legs/Lower)
function selectPullAnchor({ level, equipment, goal, usedNames }) {
  return selectAnchor({
    level, equipment, goal, usedNames,
    patterns: ["Horizontal Pull", "Vertical Pull"],  // NO Hinge here
    scoreFn: (ex) => {
      const n = normalize(ex.name);
      const e = (ex.equipment || []).map(normalize);
      let p = 0;
      if (n.includes("barbell row") || n.includes("bent over row")) p += 18;
      else if (n.includes("pendlay row") || n.includes("yates row")) p += 16;
      else if (n.includes("t-bar row") || n.includes("meadows row")) p += 14;
      else if (n.includes("dumbbell row") || n.includes("single-arm") || n.includes("single arm")) p += 12;
      else if (n === "pull-up" || n === "pullup") p += 15;
      else if (n.includes("pull-up") || n.includes("pullup")) p += 13;
      else if (n.includes("chest-supported row") || n.includes("chest supported row")) p += 11;
      if (e.some(x => ["barbell", "dumbbells", "cable"].includes(x))) p += 5;
      return p;
    },
  });
}

// Hinge anchor for Legs/Lower: Deadlift > RDL > Stiff-Leg DL
function selectHingeAnchor({ level, equipment, goal, usedNames }) {
  return selectAnchor({
    level, equipment, goal, usedNames,
    patterns: ["Hinge"],
    scoreFn: (ex) => {
      const n = normalize(ex.name);
      const e = (ex.equipment || []).map(normalize);
      let p = 0;
      if (n === "deadlift" || n === "conventional deadlift") p += 20;
      else if (n.includes("romanian deadlift") || n === "rdl") p += 17;
      else if (n.includes("deadlift")) p += 14;
      else if (n.includes("good morning")) p += 10;
      if (e.some(x => ["barbell", "dumbbells"].includes(x))) p += 5;
      return p;
    },
  });
}

// ============================================================================
// WORKOUT PRESCRIPTION (SETS / REPS / REST)
// ============================================================================


// Base prescription for a single goal
function prescriptionForGoal(goalStr, isCompound, level) {
  const g = normalize(goalStr);
  const l = normalize(level);

  if (g.includes("muscle") || g.includes("gain")) {
    if (isCompound) {
      return {
        sets: 4,
        repsLo: l === "beginner" ? 8 : l === "advanced" ? 4 : 6,
        repsHi: l === "beginner" ? 10 : l === "advanced" ? 6 : 8,
        rest: l === "advanced" ? 180 : 120,
      };
    }
    return { sets: 3, repsLo: l === "advanced" ? 8 : 10, repsHi: l === "advanced" ? 12 : 12, rest: 75 };
  }

  if (g.includes("weight") || g.includes("loss")) {
    if (isCompound) return { sets: 4, repsLo: 12, repsHi: 15, rest: 45 };
    return { sets: 3, repsLo: 15, repsHi: 20, rest: 30 };
  }

  if (g.includes("endurance")) {
    if (isCompound) return { sets: 3, repsLo: 15, repsHi: 20, rest: 30 };
    return { sets: 3, repsLo: 20, repsHi: 25, rest: 30 };
  }

  if (g.includes("flexibility")) {
    return { sets: 3, repsLo: null, repsHi: null, rest: 45, timedReps: "30-45s" };
  }

  // General fitness default
  if (isCompound) return { sets: 3, repsLo: l === "beginner" ? 10 : 8, repsHi: l === "beginner" ? 12 : 12, rest: 75 };
  return { sets: 3, repsLo: 12, repsHi: 15, rest: 50 };
}

function getPrescription(ex, goal, level, weekNumber = 1) {
  const l = normalize(level);
  const isCompound = normalize(ex.type) === "compound";

  // Normalize goal to array for unified handling
  const goals = Array.isArray(goal) ? goal : (goal ? [goal] : ["general_fitness"]);

  let sets, reps, rest;

  if (goals.length === 1) {
    // Single goal — use exact prescription
    const p = prescriptionForGoal(goals[0], isCompound, level);
    sets = p.sets;
    reps = p.timedReps || `${p.repsLo}-${p.repsHi}`;
    rest = p.rest;
  } else {
    // Multiple goals — blend prescriptions by averaging numeric values
    // Priority: if muscle_gain + weight_loss → moderate reps (10-12), moderate rest (60s)
    // This gives a physique/recomp style prescription
    const prescriptions = goals.map(g => prescriptionForGoal(g, isCompound, level));
    const validReps = prescriptions.filter(p => p.repsLo !== null);

    sets = Math.round(prescriptions.reduce((s, p) => s + p.sets, 0) / prescriptions.length);
    rest = Math.round(prescriptions.reduce((s, p) => s + p.rest, 0) / prescriptions.length);

    if (validReps.length > 0) {
      const avgLo = Math.round(validReps.reduce((s, p) => s + p.repsLo, 0) / validReps.length);
      const avgHi = Math.round(validReps.reduce((s, p) => s + p.repsHi, 0) / validReps.length);
      reps = `${avgLo}-${avgHi}`;
    } else {
      reps = "30-45s";
    }
  }

  // ─── Level adjustments ───────────────────────────────────────────────────────
  if (l === "beginner") {
    sets = Math.max(2, sets - 1);
    rest = Math.round(rest * 1.25);
  } else if (l === "advanced") {
    sets = Math.min(5, sets + 1);
    rest = Math.max(30, Math.round(rest * 0.85));
  }

  // ─── Training phase modifiers ────────────────────────────────────────────────
  const phaseInfo = getTrainingPhase(weekNumber);
  sets = Math.max(1, Math.round(sets * phaseInfo.setsMultiplier));

  if (phaseInfo.repsModifier !== "0" && typeof reps === "string") {
    const mod = parseInt(phaseInfo.repsModifier);
    const repMatch = reps.match(/^(\d+)-(\d+)$/);
    if (repMatch) {
      const lo = Math.max(1, parseInt(repMatch[1]) + mod);
      const hi = Math.max(lo + 1, parseInt(repMatch[2]) + mod);
      reps = `${lo}-${hi}`;
    }
  }

  rest = Math.round(rest * phaseInfo.restMultiplier);

  return { sets, reps, rest, phase: phaseInfo.phase, phaseName: phaseInfo.name };
}

// ============================================================================
// SMART EXERCISE SELECTION
// ============================================================================

function selectExercises({ patterns, level, equipment, goal, count, usedNames, likedExercises = [], dislikedExercises = [] }) {
  const patternSet = new Set((patterns || []).map(normalize));
  const likedSet = new Set((likedExercises || []).map(normalize));
  const dislikedSet = new Set((dislikedExercises || []).map(normalize));

  // Fallback chain — patterns ALWAYS take priority over difficulty broadening.
  // We NEVER cross day-type pattern boundaries (Pull exercises never appear on Legs day etc.)
  // 1. strict difficulty + correct patterns
  // 2. loose difficulty + correct patterns  (handles advanced bodyweight-only users)
  // 3. strict difficulty + no pattern filter (last resort — only if pool still too small)
  // 4. loose difficulty + no pattern filter (absolute last resort)
  const makePool = (diffFn, usePatterns) =>
    EXERCISE_DB.filter(ex => {
      if (usedNames.has(ex.name)) return false;
      // Exclude disliked exercises — user explicitly doesn't want them
      if (dislikedSet.has(normalize(ex.name))) return false;
      if (!diffFn(ex, level)) return false;
      if (!fitsEquipment(ex, equipment)) return false;
      if (usePatterns && patternSet.size > 0) return patternSet.has(normalize(ex.pattern));
      return true;
    });

  let pool = makePool(fitsDifficulty, true);
  if (pool.length < count) pool = makePool(fitsDifficultyLoose, true);
  if (pool.length < count) pool = makePool(fitsDifficulty, false);
  if (pool.length < count) pool = makePool(fitsDifficultyLoose, false);

  const scored = pool.map(ex => ({
    ex,
    score: scoreExerciseForGoal(ex, goal),
    isPattern: patternSet.has(normalize(ex.pattern)),
    isCompound: normalize(ex.type) === "compound",
    // Boost liked exercises — user wants to see these more often
    likeBump: likedSet.has(normalize(ex.name)) ? 12 : 0,
    // Penalize bodyweight push exercises when user has real gym equipment available
    // (no penalty for bodyweight-only users — bodyweight pushes are all they have)
    equipPenalty: (() => {
      const expanded = expandEquipment(equipment);
      // Only penalize when user has real equipment (full gym or specific gear)
      // Don't penalize bodyweight-only users — push-ups are their only option
      if (expanded === null || (expanded && !expanded.has("__bodyweight_only__"))) {
        const eq = (ex.equipment || []).map(normalize);
        const isBodyweightOnly = eq.every(e => e === "bodyweight" || e === "body weight");
        const isPushPattern = ["horizontal push","incline press","decline press","vertical push"].includes(normalize(ex.pattern));
        return isBodyweightOnly && isPushPattern ? -8 : 0;
      }
      return 0;
    })()
  }));

  scored.sort((a, b) => {
    if (a.isPattern !== b.isPattern) return b.isPattern - a.isPattern;
    if (a.isCompound !== b.isCompound) return b.isCompound - a.isCompound;
    const scoreA = a.score + a.equipPenalty + a.likeBump;
    const scoreB = b.score + b.equipPenalty + b.likeBump;
    if (Math.abs(scoreA - scoreB) > 0.5) return scoreB - scoreA;
    return Math.random() - 0.5;
  });

  const selected = [];
  const patternCounts = {};

  for (const item of scored) {
    if (selected.length >= count) break;
    const exPattern = normalize(item.ex.pattern);
    if (patternCounts[exPattern] >= 3) continue;
    selected.push(item.ex);
    usedNames.add(item.ex.name);
    patternCounts[exPattern] = (patternCounts[exPattern] || 0) + 1;
  }

  return selected;
}

// ============================================================================
// WORKOUT STRUCTURE
// ============================================================================

function determineExercisesPerDay(duration, goal) {
  const s = String(duration || "");
  // Handle both array and string goals
  const goals = Array.isArray(goal) ? goal.map(normalize) : [normalize(goal)];
  let baseCount = 4;
  if (s.includes("60")) baseCount = 6;
  else if (s.includes("45")) baseCount = 5;
  else if (s.includes("30")) baseCount = 4;
  else if (s.includes("15")) baseCount = 3;
  if (goals.some(g => g.includes("muscle"))) baseCount = Math.max(baseCount, 5);
  if (goals.some(g => g.includes("endurance"))) baseCount = Math.max(baseCount - 1, 3);
  return baseCount;
}

function determineSplit(daysPerWeek, goal, level) {
  const d = Number(daysPerWeek);
  // For split selection use primary goal string — pick first if array
  const g = Array.isArray(goal)
    ? String(goal[0] || "General Fitness")
    : String(goal || "General Fitness");
  const template = SPLITS?.[d]?.[g];
  if (template && template.length) return template;

  if (d === 1) return ["Full Body"];
  if (d === 2) return ["Upper", "Lower"];
  if (d === 3) {
    if (g.includes("Muscle")) return ["Upper", "Lower", "Full Body"];
    return ["Full Body", "Full Body", "Full Body"];
  }
  if (d === 4) return ["Upper", "Lower", "Upper", "Lower"];
  if (d === 5) return ["Push", "Pull", "Legs", "Upper", "Full Body"];
  if (d === 6) return ["Push", "Pull", "Legs", "Push", "Pull", "Legs"];
  if (d === 7) return ["Push", "Pull", "Legs", "Upper", "Lower", "Full Body", "Active Recovery"];
  return Array(d).fill("Full Body");
}

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

/**
 * Generate a weekly workout plan.
 *
 * @param {object} input   - Profile or explicit params
 * @param {number} weekNumber - Which week of the programme (affects phase/prescription)
 */
export function generateWorkoutPlan(input, weekNumber = 1) {
  let daysPerWeek, goal, level, equipment, duration, exercisesPerDayOverride, customSplit;
  let likedExercises = input.likedExercises || [];
  let dislikedExercises = input.dislikedExercises || [];

  if (input.daysPerWeek !== undefined) {
    ({ daysPerWeek, goal, level, equipment, duration } = input);
    exercisesPerDayOverride = input.exercisesPerDay ?? null;
    customSplit = input.split ?? null;
  } else if (input.days_per_week !== undefined) {
    daysPerWeek = input.days_per_week;
    level = input.fitness_level;
    equipment = input.available_equipment || [];
    duration = input.workout_duration_preference;
    exercisesPerDayOverride = input.exercises_per_day ?? null;
    customSplit = input.split ?? null;
    const goalMapping = {
      weight_loss: "Weight Loss",
      muscle_gain: "Muscle Gain",
      endurance: "Build Endurance",
      general_fitness: "General Fitness",
      flexibility: "Improve Flexibility"
    };
    // Handle both array (multi-goal) and string (single goal / legacy)
    if (Array.isArray(input.primary_goal) && input.primary_goal.length > 0) {
      // Map each goal key to its display name, keep as array for multi-goal scoring
      goal = input.primary_goal.map(g => goalMapping[g] || g);
    } else {
      goal = goalMapping[input.primary_goal] || "General Fitness";
    }
  } else {
    throw new Error("Invalid input format for generateWorkoutPlan");
  }

  // Use the user's chosen split if provided, otherwise derive one from profile
  const split = (customSplit && customSplit.length > 0)
    ? customSplit
    : determineSplit(daysPerWeek || customSplit?.length, goal, level);
  const exercisesPerDay = (exercisesPerDayOverride && Number(exercisesPerDayOverride) >= 1)
    ? Number(exercisesPerDayOverride)
    : determineExercisesPerDay(duration, goal);
  const usedNames = new Set();
  const phaseInfo = getTrainingPhase(weekNumber);

  const week = split.map((focus, idx) => {
    let patterns = DAY_PATTERNS[focus] || DAY_PATTERNS["Full Body"] || [];

    if (focus === "Active Recovery") {
      patterns = ["Mobility", "Stretch", "Light Cardio"];
    }

    let exercises = [];

    const anchorArgs = { level, equipment, goal, usedNames, likedExercises, dislikedExercises };

    // Anchor the primary compound(s) first — they count toward exercisesPerDay total
    if (focus === "Push") {
      const a = selectPushAnchor(anchorArgs);
      if (a) { usedNames.add(a.name); exercises.push(a); }

    } else if (focus === "Legs" || focus === "Lower") {
      // Squat anchor first, then a hinge anchor — both are core to leg days
      const squat = selectLegAnchor(anchorArgs);
      if (squat) { usedNames.add(squat.name); exercises.push(squat); }
      if (exercises.length < exercisesPerDay) {
        const hinge = selectHingeAnchor(anchorArgs);
        if (hinge) { usedNames.add(hinge.name); exercises.push(hinge); }
      }

    } else if (focus === "Pull") {
      // Row/pull-up anchor ONLY — no deadlifts here, those belong on Legs
      const a = selectPullAnchor(anchorArgs);
      if (a) { usedNames.add(a.name); exercises.push(a); }

    } else if (focus === "Upper") {
      const push = selectPushAnchor(anchorArgs);
      if (push) { usedNames.add(push.name); exercises.push(push); }
      const pull = selectPullAnchor(anchorArgs);
      if (pull) { usedNames.add(pull.name); exercises.push(pull); }

    } else if (focus === "Full Body") {
      const squat = selectLegAnchor(anchorArgs);
      if (squat) { usedNames.add(squat.name); exercises.push(squat); }
      const push = selectPushAnchor(anchorArgs);
      if (push) { usedNames.add(push.name); exercises.push(push); }
    }

    // Fill remaining slots up to exercisesPerDay (anchor counts toward total)
    const remaining = exercisesPerDay - exercises.length;
    if (remaining > 0) {
      const rest = selectExercises({
        patterns,
        level,
        equipment,
        goal,
        count: remaining,
        usedNames,
        likedExercises,
        dislikedExercises,
      });
      exercises = [...exercises, ...rest];
    }

    return {
      dayIndex: idx,
      focus,
      duration: duration || "45 min",
      phase: phaseInfo.phase,
      phaseName: phaseInfo.name,
      exercises: exercises.map(ex => {
        const pres = getPrescription(ex, goal, level, weekNumber);
        return {
          name: ex.name,
          pattern: ex.pattern,
          primaryMuscle: ex.primaryMuscle || [],
          secondaryMuscle: ex.secondaryMuscle || [],
          type: ex.type,
          equipment: ex.equipment || [],
          sets: pres.sets,
          reps: pres.reps,
          rest: pres.rest,
          phase: pres.phase,
          phaseName: pres.phaseName
        };
      })
    };
  });

  return {
    daysPerWeek: Number(daysPerWeek),
    goal,
    level,
    equipment,
    duration,
    week,
    weekNumber,
    phase: phaseInfo.phase,
    phaseName: phaseInfo.name,
    phaseDescription: phaseInfo.description,
    intensityNote: phaseInfo.intensityNote,
    createdAt: new Date().toISOString(),
    version: "3.0"
  };
}

// ============================================================================
// !! ML IMPLEMENTATION — COMMENTED OUT DUE TO FAILED BETA TESTING !!
// ============================================================================
//
// The following section contains the intended machine learning implementation
// for exercise recommendation and replacement. This was designed to replace
// the rule-based heuristic scorer below with a genuine trained model.
//
// WHY IT IS COMMENTED OUT:
//   During beta testing, we were unable to collect sufficient user interaction
//   data to train the model properly. A collaborative filter requires a minimum
//   of ~500-1000 unique user interactions before it outperforms a well-designed
//   rule-based baseline. Beta testing did not produce enough like/dislike signal
//   data across a diverse enough user pool, causing the model to overfit to the
//   small sample and return poor-quality recommendations.
//
//   The rule-based fallback below is used in production until sufficient
//   training data is collected. The data pipeline (exercise_reactions table
//   in Supabase) is fully operational and collecting training data now.
//   Once enough interactions are logged, this model can be trained and
//   swapped in by uncommenting this section and removing the rule-based
//   replaceExercise function.
//
// ============================================================================

// ----------------------------------------------------------------------------
// APPROACH 1 — k-Nearest Neighbors Collaborative Filter (scikit-learn / Python)
// ----------------------------------------------------------------------------
// This would run as a Python microservice called from the React frontend.
// The model finds users with similar like/dislike patterns and recommends
// exercises those users liked that the current user hasn't tried yet.
//
// PYTHON MICROSERVICE (flask_ml_service.py):
// ----------------------------------------------------------------------------
//
// from flask import Flask, request, jsonify
// from flask_cors import CORS
// import pandas as pd
// import numpy as np
// from sklearn.neighbors import NearestNeighbors
// from sklearn.preprocessing import LabelEncoder
// from supabase import create_client
//
// app = Flask(__name__)
// CORS(app)
//
// supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
//
// def build_interaction_matrix():
//     """
//     Pulls all like/dislike data from Supabase and builds a
//     user x exercise interaction matrix.
//
//     Each cell is:
//       +1  = user liked this exercise
//       -1  = user disliked this exercise
//        0  = no interaction (fill value)
//
//     Example matrix:
//                    Squat  Deadlift  Bench  Leg Raise  Pull Up
//     user_abc          1        1      0        -1        1
//     user_def          0        1      1        -1        0
//     user_ghi          1        0      1         0        1
//     """
//     response = supabase.table("exercise_reactions").select("*").execute()
//     reactions = response.data
//
//     df = pd.DataFrame(reactions)
//     df['score'] = df['reaction'].map({'like': 1, 'dislike': -1})
//
//     matrix = df.pivot_table(
//         values='score',
//         index='created_by',       # user_id
//         columns='exercise_name',  # exercise name
//         fill_value=0
//     )
//     return matrix
//
// # Train once on startup — retrain nightly in production via cron job
// interaction_matrix = build_interaction_matrix()
// exercise_names = interaction_matrix.columns.tolist()
//
// model = NearestNeighbors(
//     n_neighbors=10,       # find 10 most similar users
//     metric='cosine',      # cosine similarity on preference vectors
//     algorithm='brute'     # exact search (fine at this scale)
// )
// model.fit(interaction_matrix)
//
// @app.route('/recommend', methods=['POST'])
// def recommend():
//     """
//     Given a disliked exercise and user_id, find k nearest neighbor users
//     and return exercises they liked that this user hasn't interacted with.
//     """
//     data = request.json
//     user_id = data['userId']
//     disliked_exercise = data['dislikedExercise']
//     difficulty_filter = data.get('difficulty', None)  # 'easier'|'same'|'harder'
//
//     if user_id not in interaction_matrix.index:
//         # Cold start problem — new user with no history
//         # Fall back to rule-based scorer (see JavaScript below)
//         return jsonify({ 'fallback': True, 'reason': 'cold_start' })
//
//     user_vector = interaction_matrix.loc[user_id].values.reshape(1, -1)
//
//     # Find the 10 most similar users by cosine similarity
//     distances, indices = model.kneighbors(user_vector, n_neighbors=10)
//     similar_user_ids = interaction_matrix.index[indices.flatten()].tolist()
//
//     # Get exercises those similar users liked
//     similar_users_data = interaction_matrix.loc[similar_user_ids]
//     liked_by_similar = (similar_users_data > 0).sum(axis=0)  # count of likes per exercise
//
//     # Remove exercises the current user already interacted with
//     user_interactions = interaction_matrix.loc[user_id]
//     already_seen = user_interactions[user_interactions != 0].index.tolist()
//     already_seen.append(disliked_exercise)
//
//     candidates = liked_by_similar.drop(
//         labels=[e for e in already_seen if e in liked_by_similar.index],
//         errors='ignore'
//     ).sort_values(ascending=False)
//
//     # Return top 3 recommendations
//     top_recommendations = candidates.head(3).index.tolist()
//     return jsonify({ 'recommendations': top_recommendations, 'fallback': False })
//
// if __name__ == '__main__':
//     app.run(port=5001)
//
// ----------------------------------------------------------------------------
// REACT SIDE — calling the ML service instead of the rule-based scorer:
// ----------------------------------------------------------------------------
//
// async function replaceExerciseML({ dislikedName, userId, goal, level, equipment }) {
//   try {
//     const response = await fetch('http://localhost:5001/recommend', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({
//         userId,
//         dislikedExercise: dislikedName,
//       })
//     });
//
//     const data = await response.json();
//
//     if (data.fallback) {
//       // Cold start — user is new, no interaction history yet
//       // Fall back to rule-based replaceExercise() below
//       console.warn('ML cold start for user, using rule-based fallback');
//       return replaceExercise({ dislikedName, goal, level, equipment });
//     }
//
//     // Map recommendation names back to full exercise objects from EXERCISE_DB
//     const [easier, same, harder] = data.recommendations.map(name => {
//       const ex = EXERCISE_DB.find(e => e.name === name);
//       if (!ex) return null;
//       const pres = getPrescription(ex, goal, level);
//       return {
//         name: ex.name,
//         pattern: ex.pattern,
//         primaryMuscle: ex.primaryMuscle || [],
//         difficulty: ex.difficulty,
//         sets: pres.sets,
//         reps: pres.reps,
//         rest: pres.rest,
//       };
//     });
//
//     return { easier, same, harder };
//
//   } catch (err) {
//     // Service unavailable — fall back to rule-based
//     console.error('ML service unreachable, using rule-based fallback:', err);
//     return replaceExercise({ dislikedName, goal, level, equipment });
//   }
// }

// ----------------------------------------------------------------------------
// APPROACH 2 — Neural Network in JavaScript using brain.js (no Python needed)
// ----------------------------------------------------------------------------
// This runs entirely in the browser. The neural network learns which exercises
// tend to be liked together by the same users.
//
// import brain from 'brain.js';
//
// async function trainExerciseNet(supabase, userId) {
//   /**
//    * Fetch all reactions from Supabase and build training examples.
//    *
//    * Each training example looks like:
//    *   input:  { squat: 1, deadlift: 1, benchPress: 1, lyingLegRaise: 0 }
//    *   output: { pullUp: 1 }
//    *
//    * Meaning: "a user who liked squat, deadlift, and bench press
//    *           is likely to like pull ups"
//    *
//    * The network learns these co-occurrence patterns automatically
//    * — we never explicitly tell it that deadlift and pull-up go together.
//    */
//
//   const { data: reactions } = await supabase
//     .from('exercise_reactions')
//     .select('created_by, exercise_name, reaction');
//
//   // Group by user
//   const byUser = {};
//   for (const r of reactions) {
//     if (!byUser[r.created_by]) byUser[r.created_by] = {};
//     byUser[r.created_by][r.exercise_name] = r.reaction === 'like' ? 1 : 0;
//   }
//
//   // All exercise names as the feature space
//   const allExercises = [...new Set(reactions.map(r => r.exercise_name))];
//
//   // Build training pairs — for each user, each liked exercise is a prediction target
//   const trainingData = [];
//   for (const [, prefs] of Object.entries(byUser)) {
//     const likedExercises = Object.keys(prefs).filter(e => prefs[e] === 1);
//     for (const target of likedExercises) {
//       const input = {};
//       const output = {};
//       for (const ex of allExercises) {
//         if (ex !== target) input[ex] = prefs[ex] ?? 0;
//       }
//       output[target] = 1;
//       trainingData.push({ input, output });
//     }
//   }
//
//   // Train the neural network
//   // WHY THIS FAILED IN BETA:
//   //   We only had ~12 beta users each with 3-8 reactions = ~60 total data points.
//   //   A neural network needs hundreds of diverse examples to generalize.
//   //   With 60 points the network memorized the training data (overfit) and
//   //   returned the same 2-3 exercises for every user regardless of their profile.
//   //   The rule-based scorer outperformed it significantly on the beta cohort.
//
//   const net = new brain.NeuralNetwork({
//     hiddenLayers: [64, 32],     // two hidden layers
//     activation: 'relu',          // ReLU activation (standard for recommendation)
//     learningRate: 0.01,
//   });
//
//   net.train(trainingData, {
//     iterations: 2000,
//     errorThresh: 0.005,
//     log: true,
//     logPeriod: 100,
//   });
//
//   return { net, allExercises };
// }
//
// function predictReplacements(net, allExercises, userReactions, dislikedExercise) {
//   /**
//    * Given the trained net and a user's current reactions,
//    * predict which exercises they would like as replacements.
//    */
//   const input = {};
//   for (const ex of allExercises) {
//     if (ex === dislikedExercise) {
//       input[ex] = 0;  // they disliked this one
//     } else {
//       input[ex] = userReactions[ex] ?? 0;
//     }
//   }
//
//   const output = net.run(input);
//
//   // Sort all exercises by predicted probability descending
//   const ranked = Object.entries(output)
//     .sort(([, a], [, b]) => b - a)
//     .map(([name]) => EXERCISE_DB.find(e => e.name === name))
//     .filter(Boolean);
//
//   // Return top 3 as easier/same/harder by difficulty
//   const disliked = EXERCISE_DB.find(e => e.name === dislikedExercise);
//   const dislikedDiff = disliked?.difficulty ?? 2;
//
//   return {
//     easier: ranked.find(e => e.difficulty < dislikedDiff) ?? ranked[0] ?? null,
//     same:   ranked.find(e => e.difficulty === dislikedDiff) ?? ranked[1] ?? null,
//     harder: ranked.find(e => e.difficulty > dislikedDiff) ?? ranked[2] ?? null,
//   };
// }

// ============================================================================
// CURRENT IMPLEMENTATION — Rule-Based Heuristic Scorer (Production Fallback)
// ============================================================================
//
// This is the rule-based fallback used because the ML model above could not
// be trained properly due to insufficient beta testing data. It uses the same
// conceptual framework as content-based filtering but with hand-coded weights
// instead of learned ones.
//
// Data collection is ongoing. Once the exercise_reactions table accumulates
// enough interactions across a diverse user base, the ML implementation above
// will be trained and replace this function.
//
// ============================================================================

// EXERCISE REPLACEMENT — 3 alternatives: easier / same / harder
// ============================================================================

/**
 * When a user dislikes an exercise, return 3 alternatives:
 *   easier — lower difficulty, similar pattern
 *   same   — same difficulty, similar pattern
 *   harder — higher difficulty, similar pattern
 *
 * All options respect the user's equipment and day focus.
 *
 * @returns {{ easier, same, harder }} — each is a full exercise object or null
 */
export function replaceExercise({
  dislikedName,
  currentWeekExerciseNames,
  goal,
  level,
  equipment,
  dayFocus
}) {
  const disliked = EXERCISE_DB.find(
    ex => normalize(ex.name) === normalize(dislikedName)
  );
  if (!disliked) return null;

  const avoid = new Set((currentWeekExerciseNames || []).map(String));
  avoid.add(disliked.name);

  const patterns = DAY_PATTERNS[dayFocus] || [];
  const patternSet = new Set(patterns.map(normalize));
  const dislikedDiff = Number(disliked.difficulty || 2);

  // Pre-compute disliked exercise's muscle set for overlap scoring
  const dislikedMuscles = new Set(
    [...(disliked.primaryMuscle || []), ...(disliked.secondaryMuscle || [])].map(normalize)
  );
  const dislikedPrimaryMuscles = new Set((disliked.primaryMuscle || []).map(normalize));

  // Build sorted candidate list — no difficulty restriction yet
  const allCandidates = EXERCISE_DB
    .filter(ex => {
      if (avoid.has(ex.name)) return false;
      if (!fitsEquipment(ex, equipment)) return false;
      return true;
    })
    .map(ex => {
      const exMuscles = new Set(
        [...(ex.primaryMuscle || []), ...(ex.secondaryMuscle || [])].map(normalize)
      );
      const exPrimaryMuscles = new Set((ex.primaryMuscle || []).map(normalize));

      // Count primary muscle overlaps (highest priority — keeps replacement on-topic)
      let primaryMuscleOverlap = 0;
      for (const m of exPrimaryMuscles) {
        if (dislikedPrimaryMuscles.has(m)) primaryMuscleOverlap++;
      }

      // Count any muscle overlaps (secondary signal)
      let anyMuscleOverlap = 0;
      for (const m of exMuscles) {
        if (dislikedMuscles.has(m)) anyMuscleOverlap++;
      }

      return {
        ex,
        diff: Number(ex.difficulty || 2),
        similarity: scoreSimilarity(disliked, ex),
        goalScore: scoreExerciseForGoal(ex, goal),
        samePattern: normalize(ex.pattern) === normalize(disliked.pattern),
        patternInDay: patternSet.has(normalize(ex.pattern)),
        sameType: normalize(ex.type) === normalize(disliked.type),
        primaryMuscleOverlap,
        anyMuscleOverlap,
      };
    })
    .sort((a, b) => {
      // 1. Primary muscle overlap is the top priority — keeps replacement specific
      if (b.primaryMuscleOverlap !== a.primaryMuscleOverlap) return b.primaryMuscleOverlap - a.primaryMuscleOverlap;
      // 2. Any muscle overlap (includes secondary)
      if (b.anyMuscleOverlap !== a.anyMuscleOverlap) return b.anyMuscleOverlap - a.anyMuscleOverlap;
      // 3. Same movement pattern (e.g. both are "Hinge")
      if (a.samePattern !== b.samePattern) return b.samePattern - a.samePattern;
      // 4. Same exercise type (Compound / Isolation)
      if (a.sameType !== b.sameType) return b.sameType - a.sameType;
      // 5. Jaccard similarity (equipment + muscle tags)
      if (Math.abs(a.similarity - b.similarity) > 0.05) return b.similarity - a.similarity;
      // 6. Goal fit as tiebreaker
      return b.goalScore - a.goalScore;
    });

  function buildOption(candidateItem) {
    if (!candidateItem) return null;
    const ex = candidateItem.ex || candidateItem;
    const pres = getPrescription(ex, goal, level);
    return {
      name: ex.name,
      pattern: ex.pattern,
      primaryMuscle: ex.primaryMuscle || [],
      secondaryMuscle: ex.secondaryMuscle || [],
      type: ex.type,
      equipment: ex.equipment || [],
      difficulty: ex.difficulty,
      sets: pres.sets,
      reps: pres.reps,
      rest: pres.rest
    };
  }

  // Tier by difficulty
  const easierPool  = allCandidates.filter(c => c.diff < dislikedDiff);
  const samePool    = allCandidates.filter(c => c.diff === dislikedDiff);
  const harderPool  = allCandidates.filter(c => c.diff > dislikedDiff);

  // Fallbacks if a tier is empty
  const easierPick = easierPool[0]
    ?? allCandidates.filter(c => c.diff <= dislikedDiff)[0]
    ?? null;

  const samePick = samePool[0]
    ?? allCandidates[0]
    ?? null;

  const harderPick = harderPool[0]
    ?? allCandidates.filter(c => c.diff >= dislikedDiff).slice(-1)[0]
    ?? null;

  return {
    easier: buildOption(easierPick),
    same:   buildOption(samePick),
    harder: buildOption(harderPick)
  };
}

// ============================================================================
// VALIDATION & UTILITIES
// ============================================================================

export function validateInputs({ daysPerWeek, goal, level, equipment }) {
  const errors = [];
  if (!daysPerWeek || daysPerWeek < 1 || daysPerWeek > 7)
    errors.push("Days per week must be between 1-7");
  if (!["beginner", "intermediate", "advanced"].includes(normalize(level)))
    errors.push("Fitness level must be: beginner, intermediate, or advanced");
  if (!Array.isArray(equipment))
    errors.push("Equipment must be an array");
  if (!goal || typeof goal !== "string")
    errors.push("Goal is required");
  if (errors.length > 0) throw new Error(`Validation failed: ${errors.join(", ")}`);
  return true;
}

export function getWorkoutSummary(plan) {
  if (!plan || !plan.week) return null;
  const totalExercises = plan.week.reduce((sum, day) => sum + day.exercises.length, 0);
  const uniqueExercises = new Set(
    plan.week.flatMap(day => day.exercises.map(ex => ex.name))
  ).size;
  const patterns = new Set(plan.week.flatMap(day => day.exercises.map(ex => ex.pattern)));
  const muscleGroups = new Set(
    plan.week.flatMap(day => day.exercises.flatMap(ex => ex.primaryMuscle || []))
  );
  return {
    totalDays: plan.week.length,
    totalExercises,
    uniqueExercises,
    patterns: Array.from(patterns),
    muscleGroups: Array.from(muscleGroups),
    avgExercisesPerDay: (totalExercises / plan.week.length).toFixed(1),
    phase: plan.phase,
    phaseName: plan.phaseName
  };
}
