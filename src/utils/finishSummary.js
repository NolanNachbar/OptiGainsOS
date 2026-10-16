import {
  calculateVolume,
  detectPRs,
  estimateOneRepMax,
  getExerciseE1rmHistory,
  isE1rmEligibleSet,
} from "./exerciseStats";
import { isWarmupSet } from "./setTypes";

// The session being finished is unsaved and newer than everything stored, so a
// date past any real log date makes every saved log "strictly before" it.
const UNSAVED_LOG_DATE = "9999-12-31";

/**
 * Plain end-of-workout numbers computed from what is on screen plus history.
 * Pure and read-only: nothing here is persisted or feeds the save path.
 *
 *   volume        sum of weight x reps over completed, non-warm-up sets
 *   exercises[]   per lift: volume, best set (the highest-e1RM eligible set,
 *                 else the heaviest set), e1RM now vs the last session's best
 *                 e1RM (null when either side has no eligible set)
 *   prs[]         per-rep-count records from detectPRs; first-ever baselines
 *                 (`first`) are not records and are left out
 *
 * @param {Array} exerciseLogs - [{name, sets:[{weight, reps, completed, set_type}]}]
 * @param {Array} allLogs - saved workout_logs (the session itself is not in it)
 */
export function buildFinishSummary(exerciseLogs, allLogs) {
  const done = (Array.isArray(exerciseLogs) ? exerciseLogs : [])
    .map((ex) => ({
      ...ex,
      sets: (ex?.sets || []).filter((s) => s?.completed && !isWarmupSet(s)),
    }))
    .filter((ex) => ex.name && ex.sets.length > 0);

  const session = { log_date: UNSAVED_LOG_DATE, exercises: done };

  const exercises = done.map((ex) => {
    const volume = calculateVolume({ exercises: [ex] });
    const eligible = ex.sets.filter(isE1rmEligibleSet);
    let best = null;
    if (eligible.length > 0) {
      const top = eligible.reduce((a, b) =>
        estimateOneRepMax(b.weight, b.reps) > estimateOneRepMax(a.weight, a.reps) ? b : a
      );
      best = { weight: Number(top.weight), reps: Number(top.reps) };
    } else {
      const loaded = ex.sets.filter((s) => Number(s.weight) > 0 && Number(s.reps) > 0);
      if (loaded.length > 0) {
        const top = loaded.reduce((a, b) => (Number(b.weight) > Number(a.weight) ? b : a));
        best = { weight: Number(top.weight), reps: Number(top.reps) };
      }
    }
    const e1rm = eligible.length > 0
      ? Math.round(Math.max(...eligible.map((s) => estimateOneRepMax(s.weight, s.reps))) * 10) / 10
      : null;
    const history = getExerciseE1rmHistory(allLogs || [], ex.name);
    const prevE1rm = history.length > 0 ? history[history.length - 1].e1rm : null;
    const delta = e1rm != null && prevE1rm != null ? Math.round((e1rm - prevE1rm) * 10) / 10 : null;
    return { name: ex.name, volume: Math.round(volume), best, e1rm, prevE1rm, delta };
  });

  return {
    volume: Math.round(calculateVolume(session)),
    exercises,
    prs: detectPRs(session, allLogs || []).filter((p) => !p.first),
  };
}
