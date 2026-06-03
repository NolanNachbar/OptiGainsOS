/**
 * Coaching engine — phase detection, pre-session insights, between-set chips.
 *
 * Philosophy: 2 sets to failure per exercise, 10-12 hard sets/week/muscle for hypertrophy.
 * Phase 1 (< 5 RIR sessions): watch only — build calibration data
 * Phase 2 (5–14 RIR sessions): one pre-session insight card
 * Phase 3 (≥ 15 RIR sessions): between-set coaching chips
 */

const PHASE2_THRESHOLD = 5;
const PHASE3_THRESHOLD = 15;
const PLATE = 2.5;

function roundWeight(w) {
  return Math.round(w / PLATE) * PLATE;
}

function epley(weight, reps) {
  if (!weight || !reps) return 0;
  return weight * (1 + reps / 30);
}

/** Count workout sessions where at least one set has RIR logged */
function countRirSessions(workoutLogs) {
  return workoutLogs.filter(log =>
    (log.exercises || []).some(ex =>
      (ex.sets || []).some(s => s.rir != null)
    )
  ).length;
}

export function getCoachingPhase(workoutLogs) {
  const n = countRirSessions(workoutLogs);
  if (n >= PHASE3_THRESHOLD) return 3;
  if (n >= PHASE2_THRESHOLD) return 2;
  return 1;
}

/**
 * Returns progress toward next phase as a fraction 0–1, for UI display.
 */
export function getPhaseProgress(workoutLogs) {
  const n = countRirSessions(workoutLogs);
  if (n >= PHASE3_THRESHOLD) return { phase: 3, progress: 1, sessionsLogged: n };
  if (n >= PHASE2_THRESHOLD) {
    return { phase: 2, progress: (n - PHASE2_THRESHOLD) / (PHASE3_THRESHOLD - PHASE2_THRESHOLD), sessionsLogged: n };
  }
  return { phase: 1, progress: n / PHASE2_THRESHOLD, sessionsLogged: n };
}

/**
 * Build per-exercise history from workout logs.
 * Returns Map<exerciseNameLower, Array<{ date, sets, avgRir, maxWeight, e1rm }>>
 * sorted oldest → newest.
 */
function buildExerciseHistory(workoutLogs) {
  const map = new Map();

  const sorted = [...workoutLogs].sort((a, b) =>
    (a.log_date || '').localeCompare(b.log_date || '')
  );

  for (const log of sorted) {
    for (const ex of (log.exercises || [])) {
      const key = (ex.name || '').toLowerCase().trim();
      if (!key) continue;

      const workingSets = (ex.sets || []).filter(s => s.completed !== false);
      if (workingSets.length === 0) continue;

      const setsWithRir = workingSets.filter(s => s.rir != null);
      const avgRir = setsWithRir.length > 0
        ? setsWithRir.reduce((sum, s) => sum + s.rir, 0) / setsWithRir.length
        : null;

      const maxWeight = Math.max(...workingSets.map(s => s.weight || 0));
      const bestE1rm = Math.max(...workingSets.map(s => epley(s.weight || 0, s.reps || 0)));

      const entry = { date: log.log_date, sets: workingSets, avgRir, maxWeight, e1rm: bestE1rm };
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(entry);
    }
  }

  return map;
}

/**
 * Phase 2: Find the single most actionable pre-session insight.
 * Returns null if nothing meaningful to say.
 *
 * { exerciseName, message, suggestedWeight, currentWeight, action: 'increase'|'hold'|'deload' }
 */
export function getPreSessionInsight(workoutLogs) {
  const history = buildExerciseHistory(workoutLogs);
  const candidates = [];

  for (const [key, sessions] of history) {
    const recent = sessions.slice(-5);
    const withRir = recent.filter(s => s.avgRir != null);
    if (withRir.length < 3) continue;

    const last = withRir[withRir.length - 1];
    const prev = withRir.slice(-3);

    // RIR trend over last 3 sessions
    const rirValues = prev.map(s => s.avgRir);
    const rirTrend = rirValues[rirValues.length - 1] - rirValues[0]; // negative = getting harder
    const avgRirLast3 = rirValues.reduce((a, b) => a + b, 0) / rirValues.length;
    const currentWeight = last.maxWeight;

    // Exercise name: capitalize
    const exerciseName = sessions[sessions.length - 1].sets[0]
      ? key.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      : key;

    // Already near failure consistently — potential deload
    if (avgRirLast3 < 1 && prev.length >= 3) {
      candidates.push({
        exerciseName,
        currentWeight,
        suggestedWeight: roundWeight(currentWeight * 0.9),
        action: 'deload',
        message: `Your last ${prev.length} ${exerciseName} sessions averaged RIR ${avgRirLast3.toFixed(1)} — you're grinding near failure. Consider dropping to ${roundWeight(currentWeight * 0.9)} to reset and rebuild.`,
        priority: 3,
      });
      continue;
    }

    // RIR trending down + still some reserve → ready to progress
    if (rirTrend <= -0.5 && last.avgRir >= 1 && last.avgRir <= 2.5) {
      const increment = currentWeight >= 200 ? 5 : 2.5;
      const suggestedWeight = roundWeight(currentWeight + increment);
      const trendStr = rirValues.map(r => r.toFixed(1)).join(' → ');
      candidates.push({
        exerciseName,
        currentWeight,
        suggestedWeight,
        action: 'increase',
        message: `${exerciseName} RIR trend: ${trendStr}. You're earning the weight — attempt ${suggestedWeight} today?`,
        priority: 2,
      });
      continue;
    }

    // Consistently too easy (high RIR) → nudge up
    if (avgRirLast3 >= 4) {
      const increment = currentWeight >= 200 ? 10 : 5;
      const suggestedWeight = roundWeight(currentWeight + increment);
      candidates.push({
        exerciseName,
        currentWeight,
        suggestedWeight,
        action: 'increase',
        message: `${exerciseName} has felt easy lately (avg RIR ${avgRirLast3.toFixed(1)}). You're leaving gains on the table — try ${suggestedWeight} today.`,
        priority: 1,
      });
    }
  }

  if (candidates.length === 0) return null;
  // Return highest priority, then most recent
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0];
}

/**
 * Phase 3: Between-set coaching chip.
 * Called after a set is logged with RIR.
 *
 * @param {Array} workoutLogs - All historical logs
 * @param {string} exerciseName
 * @param {Object} completedSet - { weight, reps, rir, set_number }
 * @param {number} totalSetsPlanned - Total sets for this exercise
 * @param {Array} sessionSets - All sets logged so far this session for this exercise
 * @returns {{ message, suggestedWeight, type: 'go_heavier'|'affirm'|'back_off' } | null}
 */
export function getBetweenSetCoaching(workoutLogs, exerciseName, completedSet, totalSetsPlanned, sessionSets) {
  const { weight, reps, rir, set_number } = completedSet;
  if (rir == null) return null;

  const isLastSet = set_number >= totalSetsPlanned;

  // Last set to failure is the goal — affirm it, no suggestion
  if (isLastSet && rir === 0) return null;

  // Significant reserve on a non-last set → go heavier
  if (rir >= 3 && !isLastSet) {
    const increment = weight >= 200 ? 5 : 2.5;
    const suggested = roundWeight(weight + increment);
    return {
      type: 'go_heavier',
      suggestedWeight: suggested,
      message: `RIR ${rir} — you've got more. Next set: ${suggested}?`,
    };
  }

  // Good reserve on last set → could've gone heavier, note for next session
  if (isLastSet && rir >= 3) {
    return {
      type: 'note',
      suggestedWeight: null,
      message: `RIR ${rir} on your final set — add weight next session.`,
    };
  }

  // Perfect execution: RIR 1-2 on last set
  if (isLastSet && rir >= 1 && rir <= 2) {
    return {
      type: 'affirm',
      suggestedWeight: null,
      message: `RIR ${rir} — perfect execution.`,
    };
  }

  return null;
}
