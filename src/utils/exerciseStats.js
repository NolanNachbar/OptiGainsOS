/**
 * Utility functions for analyzing workout log data
 */

/**
 * Compare exercise names the way the rest of the app already does.
 *
 * Stored history carries more than one spelling for the same lift — a catalog
 * rename, a manual entry typed in a different case, a trailing space — and
 * every comparison in this file was strict `===`. The effect was silent and
 * one-directional: a PR set logged under the old spelling simply stopped
 * existing, the history chart started at the rename, and "last time" offered
 * nothing to tap, which is exactly when a wrong number gets typed by hand.
 *
 * coachingEngine.js:65 already keys on `(ex.name || '').toLowerCase().trim()`,
 * so this makes the stats agree with the engine rather than inventing a rule.
 */
const sameExercise = (a, b) =>
  (a || "").toLowerCase().trim() === (b || "").toLowerCase().trim();

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
      if (sameExercise(ex.name, exerciseName) && ex.sets) {
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
    .filter(log => log.exercises?.some(ex => sameExercise(ex.name, exerciseName)))
    .map(log => {
      const exercise = log.exercises.find(ex => sameExercise(ex.name, exerciseName));
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
 * Estimate a one-rep max from a single set (Epley formula), matching the
 * formula coachingEngine.js and config/failureReasons.js already use
 * elsewhere in the app — this doesn't invent a second convention.
 * @param {number} weight
 * @param {number} reps
 * @returns {number} estimated 1RM, or 0 if weight/reps are missing
 */
export const estimateOneRepMax = (weight, reps) => {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (!w || !r) return 0;
  return w * (1 + r / 30);
};

// Epley (like every 1RM formula) skews harder the more reps go in — a 20-rep
// calf-raise set "estimates" a max nobody could ever touch for one. There's
// no explicit warmup flag on a logged set in workout_logs, so this rep cap
// does double duty: it keeps a light high-rep warmup set out of the math,
// and it keeps lifts that are only ever trained for high reps (calf raises,
// most isolation/burnout work) from reporting a fabricated e1RM at all.
const MAX_E1RM_REPS = 12;

const isE1rmEligibleSet = (s) =>
  !!s?.completed && Number(s?.weight) > 0 && Number(s?.reps) > 0 && Number(s?.reps) <= MAX_E1RM_REPS;

/**
 * Normalize an exercise name for grouping. sameExercise() above already
 * treats case/leading-trailing-whitespace as equal; this also treats a run
 * of hyphens or spaces as the same separator, since "Chest-Supported Row"
 * vs "Chest-supported Row" vs "Chest Supported Row" are all the same lift
 * typed slightly differently, not three different rows.
 * @param {string} name
 * @returns {string}
 */
const normalizeExerciseName = (name) =>
  (name || "").toLowerCase().trim().replace(/[\s-]+/g, " ");

/**
 * Per-session estimated 1RM history for one exercise: the best (highest)
 * e1RM among that session's e1RM-eligible sets (completed, real weight/reps,
 * ≤ MAX_E1RM_REPS reps), one point per log date. A session with no eligible
 * set (e.g. every set that day was high-rep) contributes no point.
 * @param {Array} logs - Array of workout logs
 * @param {string} exerciseName
 * @returns {Array} Array of {date, e1rm} sorted oldest → newest
 */
export const getExerciseE1rmHistory = (logs, exerciseName) => {
  if (!logs || logs.length === 0) return [];

  return logs
    .filter(log => log.exercises?.some(ex => sameExercise(ex.name, exerciseName)))
    .map(log => {
      const exercise = log.exercises.find(ex => sameExercise(ex.name, exerciseName));
      if (!exercise || !exercise.sets || exercise.sets.length === 0) return null;

      const eligible = exercise.sets.filter(isE1rmEligibleSet);
      if (eligible.length === 0) return null;

      const best = Math.max(...eligible.map(s => estimateOneRepMax(s.weight, s.reps)));
      if (!best) return null;

      return { date: log.log_date, e1rm: Math.round(best * 10) / 10 };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
};

/**
 * Every logged exercise with its e1RM trend, for the Body → Lifts list.
 * Spelling variants of the same lift (case, hyphen-vs-space, doubled
 * whitespace) are grouped under one normalized key and shown under whichever
 * spelling was logged most recently. Sorted by recency (most recently
 * logged first), frequency as the tiebreak, since that's the order a daily
 * lifter scans for "what did I just do".
 *
 * The 4-week delta compares the current best e1RM (best eligible session in
 * the last 2 weeks) against the best e1RM from 4–6 weeks earlier, not a
 * single arbitrary session on each side — comparing single sessions is what
 * previously produced deltas like -196.3 on a 283.7 e1RM: whichever single
 * "prior" session happened to land nearest the cutoff could itself have
 * been contaminated by a high-rep set inflating its e1RM (now excluded by
 * MAX_E1RM_REPS above), or just be a noisy single data point. Either side
 * missing (less than ~2 weeks of eligible history on that side) reports no
 * delta rather than fabricating one.
 *
 * A lift with no e1RM-eligible set at all (only ever trained for high reps)
 * reports currentE1rm: null plus its best logged weight × reps instead.
 * @param {Array} logs - Array of workout logs
 * @returns {Array} Array of {name, history, lastDate, count, currentE1rm, bestWeight, bestReps, change4w}
 */
export const getLoggedExerciseSummaries = (logs) => {
  if (!logs || logs.length === 0) return [];

  // Group every logged exercise entry by normalized name so spelling
  // variants share one row and one history.
  const groups = new Map();
  logs.forEach(log => {
    if (!log.exercises || !log.log_date) return;
    log.exercises.forEach(ex => {
      if (!ex.name || !ex.sets || ex.sets.length === 0) return;
      const key = normalizeExerciseName(ex.name);
      if (!key) return;

      let group = groups.get(key);
      if (!group) {
        group = { displayName: ex.name, displayDate: log.log_date, sessions: [] };
        groups.set(key, group);
      }
      // Most recently logged spelling wins for display.
      if (log.log_date >= group.displayDate) {
        group.displayName = ex.name;
        group.displayDate = log.log_date;
      }
      group.sessions.push({ date: log.log_date, sets: ex.sets });
    });
  });

  return Array.from(groups.values())
    .map(({ displayName, sessions }) => {
      const sorted = [...sessions].sort((a, b) => new Date(a.date) - new Date(b.date));
      const lastDate = sorted[sorted.length - 1].date;
      const count = sorted.length;

      const eligibleHistory = sorted
        .map(s => {
          const eligible = s.sets.filter(isE1rmEligibleSet);
          if (eligible.length === 0) return null;
          const best = Math.max(...eligible.map(x => estimateOneRepMax(x.weight, x.reps)));
          if (!best) return null;
          return { date: s.date, e1rm: Math.round(best * 10) / 10 };
        })
        .filter(Boolean);

      if (eligibleHistory.length === 0) {
        // Never trained ≤12 reps — no honest e1RM to show. Best weight ×
        // reps ever logged (completed sets only) instead — or, for a lift
        // that's only ever logged at weight 0 (a bodyweight movement like
        // neck curls with no added load), the best rep count on its own,
        // rather than a blank number in front of the unit label.
        let bestWeight = 0;
        let bestReps = 0;
        let bestBodyweightReps = 0;
        sorted.forEach(s => s.sets.forEach(set => {
          if (!set?.completed) return;
          const w = Number(set.weight) || 0;
          const r = Number(set.reps) || 0;
          // A set logged with weight but 0 reps (a data-entry artifact —
          // completed before reps were entered) isn't a real PR; "225lbs × 0"
          // is nonsense, so it's excluded here the same way a 0-rep set would
          // never count toward a bodyweight rep max either.
          if (r > 0 && w > 0 && w > bestWeight) {
            bestWeight = w;
            bestReps = r;
          }
          if (w === 0 && r > bestBodyweightReps) bestBodyweightReps = r;
        }));

        return {
          name: displayName,
          history: [],
          lastDate,
          count,
          currentE1rm: null,
          bestWeight: bestWeight || null,
          bestReps: bestWeight ? bestReps : null,
          bodyweightReps: bestWeight ? null : (bestBodyweightReps || null),
          change4w: null,
        };
      }

      const anchor = eligibleHistory[eligibleHistory.length - 1].date;
      const anchorDate = new Date(`${anchor}T00:00:00`);
      const daysBefore = (n) => {
        const d = new Date(anchorDate);
        d.setDate(d.getDate() - n);
        return d.toISOString().slice(0, 10);
      };
      // Current: best eligible e1RM in the last 2 weeks (always includes at
      // least the anchor session itself). Prior: best eligible e1RM in the
      // 4-6-weeks-earlier window. Either window empty → no delta.
      const currentFloor = daysBefore(13);
      const priorFloor = daysBefore(41);
      const priorCeil = daysBefore(27);

      const currentWindow = eligibleHistory.filter(h => h.date >= currentFloor && h.date <= anchor);
      const priorWindow = eligibleHistory.filter(h => h.date >= priorFloor && h.date <= priorCeil);

      const currentBest = Math.max(...currentWindow.map(h => h.e1rm));
      const priorBest = priorWindow.length ? Math.max(...priorWindow.map(h => h.e1rm)) : null;

      return {
        name: displayName,
        history: eligibleHistory,
        lastDate,
        count,
        currentE1rm: currentBest,
        bestWeight: null,
        bestReps: null,
        bodyweightReps: null,
        change4w: priorBest != null ? Math.round((currentBest - priorBest) * 10) / 10 : null,
      };
    })
    .sort((a, b) => {
      if (a.lastDate !== b.lastDate) return a.lastDate < b.lastDate ? 1 : -1;
      return b.count - a.count;
    });
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

    const exercise = log.exercises.find(ex => sameExercise(ex.name, exerciseName));
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
