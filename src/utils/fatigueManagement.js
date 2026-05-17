import { lookupExercise } from '@/ml/exerciseDB';
import { differenceInHours } from 'date-fns';

/**
 * Fatigue management utilities.
 *
 * All functions return advisory messages — they never block the user.
 * The UI displays these as toast nudges or banners.
 */

const COMPOUND_REST_SECONDS = 180; // 3 minutes
const ISOLATION_REST_SECONDS = 90; // 1.5 minutes
const HIGH_VOLUME_THRESHOLD = 4; // >4 hard sets per muscle = high volume
const RECOVERY_WINDOW_HOURS = 48;
const HIGH_FREQUENCY_THRESHOLD = 5; // 5+ sessions per week
const REPEATED_BOUT_WEEKS = 8; // keep compound movements for at least 8 weeks

/**
 * Check if any muscle groups in the upcoming workout are under-recovered.
 * Called before starting a program workout.
 *
 * @param {Array<string>} muscleGroups - Muscle groups in today's workout
 * @param {Object} progressionState - Current progression state with _muscle_groups
 * @returns {Array<{ muscle: string, message: string, hoursAgo: number }>}
 */
export function checkRecoveryWindow(muscleGroups, progressionState = {}) {
  const warnings = [];
  const muscleData = progressionState._muscle_groups || {};

  for (const muscle of muscleGroups) {
    const data = muscleData[muscle];
    if (!data?.last_trained) continue;

    const hoursAgo = differenceInHours(
      new Date(),
      new Date(data.last_trained + 'T12:00:00')
    );

    if (
      hoursAgo < RECOVERY_WINDOW_HOURS &&
      data.hard_sets_this_week > HIGH_VOLUME_THRESHOLD
    ) {
      warnings.push({
        muscle,
        hoursAgo,
        message: `${muscle} was trained heavily ${hoursAgo} hours ago. Performance may be affected.`,
      });
    }
  }

  return warnings;
}

/**
 * Check volume constraints for a muscle group.
 * Called when planning or during a session.
 *
 * @param {string} muscleGroup - The muscle group to check
 * @param {number} plannedSets - Number of hard sets planned for this session
 * @param {Object} progressionState - Current state with _muscle_groups
 * @returns {{ type: 'volume'|'frequency', message: string }|null}
 */
export function checkVolumeConstraints(
  muscleGroup,
  plannedSets,
  progressionState = {}
) {
  const muscleData = progressionState._muscle_groups?.[muscleGroup];

  // High volume warning
  if (plannedSets > HIGH_VOLUME_THRESHOLD) {
    return {
      type: 'volume',
      message: `High volume session for ${muscleGroup} (${plannedSets} sets). Allow 48-72hrs before hitting ${muscleGroup} again.`,
    };
  }

  // Weekly frequency check (rough estimate based on hard sets accumulated)
  if (muscleData && muscleData.hard_sets_this_week > 20) {
    return {
      type: 'frequency',
      message: `High weekly volume for ${muscleGroup} (${muscleData.hard_sets_this_week} sets this week). Consider reducing per-session volume.`,
    };
  }

  return null;
}

/**
 * Get the recommended rest duration based on exercise category.
 *
 * @param {string} exerciseName - Name of the exercise
 * @returns {number} Rest duration in seconds
 */
export function getSmartRestDuration(exerciseName) {
  const dbEntry = lookupExercise(exerciseName);

  if (!dbEntry) return COMPOUND_REST_SECONDS; // default to longer rest

  const isCompound =
    dbEntry.type === 'Compound' || dbEntry.type === 'Machine';
  const isIsolation = dbEntry.type === 'Isolation';

  if (isIsolation) return ISOLATION_REST_SECONDS;
  return COMPOUND_REST_SECONDS;
}

/**
 * Check if a compound exercise has been in the program long enough.
 * Used in the program builder when user tries to swap an exercise.
 *
 * @param {string} exerciseName - Name of the exercise being swapped
 * @param {string|null} firstProgrammedAt - ISO date string when exercise was first added
 * @returns {{ message: string, weeksActive: number }|null}
 */
export function checkRepeatedBoutProtection(exerciseName, firstProgrammedAt) {
  if (!firstProgrammedAt) return null;

  const dbEntry = lookupExercise(exerciseName);
  if (!dbEntry || dbEntry.type !== 'Compound') return null;

  const startDate = new Date(firstProgrammedAt);
  const now = new Date();
  const weeksActive = Math.floor(
    (now - startDate) / (7 * 24 * 60 * 60 * 1000)
  );

  if (weeksActive < REPEATED_BOUT_WEEKS) {
    return {
      weeksActive,
      message: `Keeping ${exerciseName} for at least 8-12 weeks allows the repeated bout effect to reduce soreness and improve consistent overload. Currently at ${weeksActive} weeks.`,
    };
  }

  return null;
}

/**
 * Get all muscle groups involved in a list of exercises.
 *
 * @param {Array<{ name: string, muscle_groups?: string[] }>} exercises
 * @returns {string[]} Unique muscle groups
 */
export function getWorkoutMuscleGroups(exercises) {
  const groups = new Set();

  for (const ex of exercises) {
    // Use exercise config muscle_groups first, fall back to DB
    const muscles =
      ex.muscle_groups?.length > 0
        ? ex.muscle_groups
        : lookupExercise(ex.name)?.primaryMuscle || [];

    for (const m of muscles) {
      groups.add(m);
    }
  }

  return [...groups];
}

/**
 * Reset weekly muscle group counters.
 * Should be called at the start of each training week.
 *
 * @param {Object} progressionState
 * @returns {Object} Updated state with reset weekly counters
 */
export function resetWeeklyCounters(progressionState) {
  const state = { ...progressionState };
  if (state._muscle_groups) {
    for (const muscle of Object.keys(state._muscle_groups)) {
      state._muscle_groups[muscle] = {
        ...state._muscle_groups[muscle],
        hard_sets_this_week: 0,
      };
    }
  }
  return state;
}
