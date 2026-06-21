import { lookupExercise } from '@/ml/exerciseDB';
import { format, parseISO, startOfWeek } from 'date-fns';

const PLATE_INCREMENT = 2.5;
const STALL_THRESHOLD = 3; // sessions at same weight before flagging stall

function roundWeight(weight) {
  return Math.round(weight / PLATE_INCREMENT) * PLATE_INCREMENT;
}

// Percentage-based increment: upper body ~2.5%, lower body ~5%.
// Uses the exercise's explicit weight_increment if one is configured.
function deriveSuggestedIncrement(exercise, currentWeight) {
  const explicit = exercise.progression?.weight_increment;
  if (explicit) return explicit;

  const dbEntry = lookupExercise(exercise.name);
  const lowerBodyPatterns = new Set(['Squat', 'Hinge', 'Lunge', 'Step', 'Bridge', 'Split Squat']);
  const isLowerBody = lowerBodyPatterns.has(dbEntry?.pattern);
  const raw = (currentWeight || 45) * (isLowerBody ? 0.05 : 0.025);
  return Math.max(2.5, roundWeight(raw));
}

function deriveStallSuggestion(avgRir, rirTarget, sessionsAtWeight) {
  if (avgRir === null) {
    return 'Log RIR on your sets to get progression coaching.';
  }
  if (avgRir < 2) {
    if (sessionsAtWeight >= 5) {
      return `${sessionsAtWeight} sessions grinding near failure (avg RIR ${avgRir.toFixed(1)}). Consider a deload week, then return to 90% of this weight.`;
    }
    return `Working close to failure (avg RIR ${avgRir.toFixed(1)}). Focus on completing all reps before adding weight.`;
  }
  if (avgRir > rirTarget + 1) {
    return `Weight feels manageable (avg RIR ${avgRir.toFixed(1)}) but reps aren't there yet. Focus on hitting all target reps.`;
  }
  if (sessionsAtWeight >= 5) {
    return `${sessionsAtWeight} sessions at this weight. Consider a deload week, come back to this weight fresh.`;
  }
  return `${sessionsAtWeight} sessions without progress. Check sleep and nutrition are supporting recovery.`;
}

// Returns the Monday date string for a given date string (ISO week start).
// parseISO treats date-only strings as local midnight; startOfWeek stays in local time.
function getWeekStart(dateStr) {
  return format(startOfWeek(parseISO(dateStr), { weekStartsOn: 1 }), 'yyyy-MM-dd');
}

/**
 * Calculate today's target weights and RIR for an exercise.
 *
 * @param {Object} exercise - Exercise config from program_workouts.exercises
 * @param {Object} progressionState - Current progression state from enrollment
 * @returns {{ dailyMin: number|null, workingWeight: number|null, rirTarget: number, suggestedSets: number }}
 */
export function calculateDailyTargets(exercise, progressionState = {}) {
  const { name, rir_target = 2, sets = 3, progression = {} } = exercise;
  const { daily_min_pct = 0.85 } = progression;

  const exerciseState = progressionState[name];

  if (exerciseState?.working_weight) {
    const increment = deriveSuggestedIncrement(exercise, exerciseState.working_weight);
    const workingWeight = exerciseState.ready_to_progress
      ? roundWeight(exerciseState.working_weight + increment)
      : exerciseState.working_weight;

    return {
      dailyMin: roundWeight(workingWeight * daily_min_pct),
      workingWeight,
      rirTarget: rir_target,
      suggestedSets: sets,
      stalled: exerciseState.stalled || false,
      stallSuggestion: exerciseState.stall_suggestion || null,
    };
  }

  return {
    dailyMin: null,
    workingWeight: null,
    rirTarget: rir_target,
    suggestedSets: sets,
    stalled: false,
    stallSuggestion: null,
  };
}

/**
 * Evaluate a set's performance and return an advisory nudge message.
 * Called after the user logs RIR on a daily minimum or working set.
 *
 * @param {Object} exercise - Exercise config
 * @param {{ rpe: number, weight: number, set_type: string, set_number: number }} setData - The completed set
 * @param {number} workingWeight - Today's planned working weight
 * @param {number} [totalSets] - Total number of sets for this exercise (used to detect final set)
 * @returns {{ type: 'success'|'warning'|'info', message: string }|null}
 */
export function evaluateSetPerformance(exercise, setData, workingWeight, totalSets) {
  // Support both `rir` (new) and `rpe` (legacy field name) for backwards compatibility
  const rir = setData.rir ?? setData.rpe;
  if (rir == null || !setData.set_type) return null;

  const { set_type, set_number } = setData;
  const dbEntry = lookupExercise(exercise.name);
  const isCompound = dbEntry?.type === 'Compound';
  const isFinalSet = totalSets != null && set_number >= totalSets;

  if (set_type === 'daily_min') {
    if (rir >= 3) {
      return {
        type: 'success',
        message: `Weight moved well. Working weight: ${workingWeight}. Feel free to go heavier.`,
      };
    } else if (rir >= 2) {
      return {
        type: 'info',
        message: `Solid. Proceed to working sets at ${workingWeight}.`,
      };
    } else {
      const reducedWeight = roundWeight(workingWeight * 0.92);
      return {
        type: 'warning',
        message: `Tough day. Consider reducing to ${reducedWeight} or doing back-off sets.`,
      };
    }
  }

  // Taking the last set to failure is a deliberate training strategy — only warn on non-final sets.
  if (set_type === 'working' && rir === 0 && isCompound && !isFinalSet) {
    return {
      type: 'warning',
      message: 'Training to failure on compounds increases recovery time. Consider stopping 1-2 reps short.',
    };
  }

  return null;
}

/**
 * Update progression state after a workout is completed.
 * Decides whether the user is ready to progress next session.
 *
 * @param {Object} currentState - Current progression_state from enrollment
 * @param {Object} exercise - Exercise config from program_workouts.exercises
 * @param {Array<{ reps: number, weight: number, rir: number|null, set_type: string }>} completedSets
 * @returns {Object} Updated progression state
 */
export function updateProgressionState(currentState, exercise, completedSets) {
  const state = { ...currentState };
  const { name, rir_target = 2, rep_target, progression = {} } = exercise;

  const workingSets = completedSets.filter(
    (s) => s.set_type === 'working' || s.set_type === 'daily_max'
  );

  if (workingSets.length === 0) return state;

  // Reset weekly muscle counters if we've entered a new calendar week.
  // Runs on the first workout of each new week automatically.
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayWeekStart = getWeekStart(today);
  const muscleData = state._muscle_groups || {};
  const lastTrainedDates = Object.values(muscleData).map(m => m.last_trained).filter(Boolean);
  if (lastTrainedDates.length > 0) {
    const mostRecentTrained = [...lastTrainedDates].sort().pop();
    if (getWeekStart(mostRecentTrained) !== todayWeekStart) {
      for (const muscle of Object.keys(muscleData)) {
        state._muscle_groups[muscle] = { ...state._muscle_groups[muscle], hard_sets_this_week: 0 };
      }
    }
  }

  // Calculate average RIR excluding the last set — users may intentionally
  // take the final set to failure, which shouldn't penalize progression.
  // Reads `rir` field; falls back to `rpe` for backwards compatibility with old logged sets.
  const setsWithRir = workingSets.filter((s) => (s.rir ?? s.rpe) != null);
  const nonFinalSetsWithRir = setsWithRir.length > 1 ? setsWithRir.slice(0, -1) : setsWithRir;
  const avgRir =
    nonFinalSetsWithRir.length > 0
      ? nonFinalSetsWithRir.reduce((sum, s) => sum + (s.rir ?? s.rpe), 0) / nonFinalSetsWithRir.length
      : null;

  const maxWorkingWeight = Math.max(...workingSets.map((s) => s.weight));
  const targetReps = parseInt(rep_target) || 0;
  const allSetsHitTarget = targetReps > 0 && workingSets.every((s) => s.reps >= targetReps);

  // Progress only when the user hit all target reps AND still had adequate reserve (≥2 RIR).
  // Grinding near failure (RIR 0-1) means the weight is already at the edge — don't add more.
  const readyToProgress = allSetsHitTarget && avgRir != null && avgRir >= 2;

  const prevState = state[name] || {};
  const sessionsAtWeight =
    maxWorkingWeight === prevState.working_weight
      ? (prevState.sessions_at_current_weight || 0) + 1
      : 1;

  const stalled = !readyToProgress && sessionsAtWeight >= STALL_THRESHOLD;
  const stallSuggestion = stalled
    ? deriveStallSuggestion(avgRir, rir_target, sessionsAtWeight)
    : null;

  state[name] = {
    working_weight: maxWorkingWeight,
    last_session_rir_avg: avgRir,
    last_session_date: today,
    sessions_at_current_weight: sessionsAtWeight,
    ready_to_progress: readyToProgress,
    stalled,
    stall_suggestion: stallSuggestion,
    suggested_increment: deriveSuggestedIncrement(exercise, maxWorkingWeight),
    first_programmed_at: prevState.first_programmed_at || today,
  };

  // Update muscle group tracking
  const dbEntry = lookupExercise(name);
  if (dbEntry?.primaryMuscle) {
    if (!state._muscle_groups) state._muscle_groups = {};
    const hardSets = workingSets.length;
    for (const muscle of dbEntry.primaryMuscle) {
      const prev = state._muscle_groups[muscle] || { last_trained: null, hard_sets_this_week: 0 };
      state._muscle_groups[muscle] = {
        last_trained: today,
        hard_sets_this_week: prev.hard_sets_this_week + hardSets,
      };
    }
  }

  return state;
}

/**
 * Project weights across weeks for the program builder review step.
 * Assumes progression happens every session (best case).
 *
 * @param {Object} exercise - Exercise config
 * @param {number} totalWeeks - Total weeks in program
 * @param {number} startingWeight - User-provided starting weight
 * @returns {Array<{ week: number, weight: number }>}
 */
export function projectProgression(exercise, totalWeeks, startingWeight) {
  const projections = [];
  let weight = startingWeight;

  for (let week = 1; week <= totalWeeks; week++) {
    projections.push({ week, weight: roundWeight(weight) });
    weight += deriveSuggestedIncrement(exercise, weight);
  }
  return projections;
}

/**
 * Transfer progression state when an exercise is replaced mid-program.
 * Carries the working weight over for reference but resets session count
 * since the new exercise needs independent calibration.
 */
export function transferProgressionState(currentState, oldExerciseName, newExerciseName) {
  const old = currentState[oldExerciseName];
  if (!old) return currentState;

  const state = { ...currentState };
  state[newExerciseName] = {
    working_weight: old.working_weight,
    last_session_date: old.last_session_date,
    sessions_at_current_weight: 0,
    ready_to_progress: false,
    stalled: false,
    stall_suggestion: null,
    first_programmed_at: format(new Date(), 'yyyy-MM-dd'),
    _transferred_from: oldExerciseName,
  };
  delete state[oldExerciseName];
  return state;
}

/**
 * Returns true if more than half the program exercises are stalled.
 * Used to surface an advisory coaching tip — nothing is forced.
 */
export function hasWidespreadStalling(progressionState, exercises) {
  if (!progressionState || !exercises?.length) return false;
  const stalledCount = exercises.filter(
    (ex) => progressionState[ex.name]?.stalled
  ).length;
  return stalledCount >= Math.ceil(exercises.length / 2);
}
