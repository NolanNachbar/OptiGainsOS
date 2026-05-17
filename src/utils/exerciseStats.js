/**
 * Utility functions for analyzing workout log data
 */

/**
 * Get max weight ever lifted for an exercise
 * @param {Array} logs - Array of workout logs
 * @param {string} exerciseName - Name of the exercise
 * @returns {Object} { weight, date, reps }
 */
export const getExercisePR = (logs, exerciseName) => {
  if (!logs || logs.length === 0) return { weight: 0, date: null, reps: 0 };

  let maxWeight = 0;
  let prLog = null;

  logs.forEach(log => {
    if (!log.exercises) return;

    log.exercises.forEach(ex => {
      if (ex.name === exerciseName && ex.sets) {
        const weights = ex.sets.map(s => s.weight || 0);
        const weight = Math.max(...weights);

        if (weight > maxWeight) {
          maxWeight = weight;
          const prSet = ex.sets.find(s => s.weight === weight);
          prLog = {
            date: log.log_date,
            reps: prSet?.reps || 0
          };
        }
      }
    });
  });

  return prLog ? { weight: maxWeight, ...prLog } : { weight: 0, date: null, reps: 0 };
};

/**
 * Get total volume (weight × reps × sets) for a workout log
 * @param {Object} log - Workout log object
 * @returns {number} Total volume
 */
export const calculateVolume = (log) => {
  if (!log || !log.exercises) return 0;

  return log.exercises.reduce((total, ex) => {
    if (!ex.sets) return total;
    return total + ex.sets.reduce((sum, set) => {
      return sum + ((set.weight || 0) * (set.reps || 0));
    }, 0);
  }, 0);
};

/**
 * Get unique exercise names from all logs
 * @param {Array} logs - Array of workout logs
 * @returns {Array} Sorted array of unique exercise names
 */
export const getUniqueExercises = (logs) => {
  if (!logs || logs.length === 0) return [];

  const names = new Set();
  logs.forEach(log => {
    if (!log.exercises) return;
    log.exercises.forEach(ex => {
      if (ex.name) names.add(ex.name);
    });
  });

  return Array.from(names).sort();
};

/**
 * Check if a log contains any PRs compared to previous logs
 * @param {Object} log - Current workout log
 * @param {Array} allPreviousLogs - All logs before this one
 * @returns {Array} Array of PR objects [{exercise, weight, reps}]
 */
export const detectPRs = (log, allPreviousLogs) => {
  if (!log || !log.exercises) return [];

  const prs = [];

  log.exercises.forEach(ex => {
    if (!ex.sets || ex.sets.length === 0) return;

    const weights = ex.sets.map(s => s.weight || 0);
    const currentMax = Math.max(...weights);
    const previousPR = getExercisePR(allPreviousLogs, ex.name);

    if (currentMax > previousPR.weight) {
      const prSet = ex.sets.find(s => s.weight === currentMax);
      prs.push({
        exercise: ex.name,
        weight: currentMax,
        reps: prSet?.reps || 0
      });
    }
  });

  return prs;
};

/**
 * Get exercise history with max weight, volume, and avg reps per session
 * @param {Array} logs - Array of workout logs
 * @param {string} exerciseName - Name of the exercise
 * @returns {Array} Array of {date, maxWeight, totalVolume, avgReps}
 */
export const getExerciseHistory = (logs, exerciseName) => {
  if (!logs || logs.length === 0) return [];

  return logs
    .filter(log => log.exercises?.some(ex => ex.name === exerciseName))
    .map(log => {
      const exercise = log.exercises.find(ex => ex.name === exerciseName);
      if (!exercise || !exercise.sets || exercise.sets.length === 0) {
        return null;
      }

      const weights = exercise.sets.map(s => s.weight || 0);
      const maxWeight = Math.max(...weights);

      const totalVolume = exercise.sets.reduce((sum, s) =>
        sum + ((s.weight || 0) * (s.reps || 0)), 0
      );

      const avgReps = exercise.sets.reduce((sum, s) =>
        sum + (s.reps || 0), 0
      ) / exercise.sets.length;

      return {
        date: log.log_date,
        maxWeight,
        totalVolume,
        avgReps: Math.round(avgReps * 10) / 10, // Round to 1 decimal
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
};

/**
 * Get all personal records organized by exercise
 * @param {Array} logs - Array of workout logs
 * @returns {Object} Object with exercise names as keys and PR data as values
 */
export const getAllPersonalRecords = (logs) => {
  if (!logs || logs.length === 0) return {};

  const prsByExercise = {};

  logs.forEach(log => {
    if (!log.exercises) return;

    log.exercises.forEach(ex => {
      if (!ex.sets || ex.sets.length === 0) return;

      const weights = ex.sets.map(s => s.weight || 0);
      const maxWeight = Math.max(...weights);

      if (!prsByExercise[ex.name] || maxWeight > prsByExercise[ex.name].weight) {
        const prSet = ex.sets.find(s => s.weight === maxWeight);
        prsByExercise[ex.name] = {
          weight: maxWeight,
          date: log.log_date,
          reps: prSet?.reps || 0
        };
      }
    });
  });

  return prsByExercise;
};

/**
 * Calculate total volume by date for volume tracking chart
 * @param {Array} logs - Array of workout logs
 * @returns {Array} Array of {date, volume, duration}
 */
export const getVolumeByDate = (logs) => {
  if (!logs || logs.length === 0) return [];

  return logs
    .map(log => ({
      date: log.log_date,
      volume: calculateVolume(log),
      duration: log.duration_seconds || 0
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
};

/**
 * Get the most recent performance for a specific exercise
 * @param {Array} logs - Array of workout logs
 * @param {string} exerciseName - Name of the exercise
 * @returns {Object} { lastWeight, lastReps, lastDate, sets: [{weight, reps}] } or null
 */
export const getLastExercisePerformance = (logs, exerciseName) => {
  if (!logs || logs.length === 0) return null;

  // Sort logs by date descending (most recent first)
  const sortedLogs = [...logs].sort((a, b) => new Date(b.log_date) - new Date(a.log_date));

  // Find most recent log containing this exercise
  for (const log of sortedLogs) {
    if (!log.exercises) continue;

    const exercise = log.exercises.find(ex => ex.name === exerciseName);
    if (exercise && exercise.sets && exercise.sets.length > 0) {
      // Get all weights and reps from the sets
      const weights = exercise.sets.map(s => s.weight || 0);
      const reps = exercise.sets.map(s => s.reps || 0);

      // Find the max weight used
      const lastWeight = Math.max(...weights);
      const maxWeightSet = exercise.sets.find(s => s.weight === lastWeight);
      const lastReps = maxWeightSet?.reps || 0;

      return {
        lastWeight,
        lastReps,
        lastDate: log.log_date,
        sets: exercise.sets.map(s => ({
          weight: s.weight || 0,
          reps: s.reps || 0
        }))
      };
    }
  }

  return null;
};
