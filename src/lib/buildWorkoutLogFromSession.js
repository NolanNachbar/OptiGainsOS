import { localDateOf } from "@/utils/dateUtils";

/**
 * The workout_logs payload for a session the athlete never finished by hand.
 *
 * The Finish button builds its payload inline in WorkoutDetail from live React
 * state (exerciseLogs, startTime, the pre/post note fields). The auto-finisher
 * has none of that — it runs on mount against a row it just read — so this
 * derives the same shape from the session row alone.
 *
 * Everything here comes from the session, never from the clock:
 *   log_date          the session's own local start date, so a forgotten
 *                     Tuesday workout is filed under Tuesday
 *   duration_seconds  start -> last set logged, not start -> now, which would
 *                     bill every idle hour since as training time
 *
 * program_id is absent from workout_sessions, so it stays null unless a caller
 * resolves it from the enrollment. That is the same null the 98 existing rows
 * carry; auto-finish does not make the linkage gap worse, and does not fix it.
 */
export function buildWorkoutLogFromSession(session, timezone) {
  if (!session) return null;

  const exercises = Array.isArray(session.exercises) ? session.exercises : [];
  const startedAt = session.start_time || session.started_at || session.created_at;
  const lastTouched = session.updated_at || startedAt;

  const durationSeconds = startedAt
    ? Math.max(0, Math.floor((new Date(lastTouched) - new Date(startedAt)) / 1000))
    : null;

  return {
    created_by: session.created_by,
    workout_schedule_id: null,
    workout_id: session.workout_id || null,
    program_id: null,
    enrollment_id: session.enrollment_id || null,
    log_date: localDateOf(startedAt, timezone),
    exercises,
    duration_seconds: durationSeconds,
    notes: session.notes || null,
  };
}

/**
 * How long this session has been silent, or null if that is unknowable.
 *
 * Null matters more than the number. `updated_at` is what makes "stale" mean
 * "no set logged in three hours"; without it the only timestamps are
 * start-of-session, and falling back to those turns a three-hour silence rule
 * into a three-hour *guillotine* that finishes a long workout out from under
 * the athlete mid-set. So when the column is missing — migration not applied,
 * not yet propagated, a row written before it existed — this returns null and
 * every caller declines to auto-finish. Doing nothing is always recoverable.
 */
export function sessionSilenceMs(session) {
  if (!session?.updated_at) return null;
  const touched = new Date(session.updated_at).getTime();
  if (!Number.isFinite(touched)) return null;
  return Date.now() - touched;
}

/**
 * Does this session hold real work? A session with no completed set is an
 * abandoned start, not a workout — finishing it would write an empty log and
 * teach the engine a session happened that did not.
 */
export function sessionHasLoggedSets(session) {
  if (!session || !Array.isArray(session.exercises)) return false;
  return session.exercises.some(
    (ex) => Array.isArray(ex?.sets) && ex.sets.some((s) => s?.completed)
  );
}

/**
 * A content fingerprint of the work actually completed.
 *
 * Only completed sets, in order, with their load and reps. Two logs built from
 * the same session produce the same string; two different workouts on the same
 * day do not, unless every exercise and every completed set matched exactly, in
 * which case they are indistinguishable anyway.
 */
function completedSignature(exercises) {
  return (Array.isArray(exercises) ? exercises : [])
    .map((ex) => {
      const sets = (Array.isArray(ex?.sets) ? ex.sets : [])
        .filter((s) => s?.completed)
        .map((s) => `${s?.weight ?? ""}x${s?.reps ?? ""}`)
        .join(",");
      return `${ex?.name ?? ""}:${sets}`;
    })
    .join("|");
}

/**
 * Was this existing log already written by this same session?
 *
 * The retry it guards is narrow: the log write landed, the status flip failed,
 * and the next mount runs auto-finish on the same row again. Matching on
 * (created_by, log_date) alone is far too wide — a genuine second workout the
 * same day would read as a duplicate, get skipped, and have its session closed
 * anyway. That is the exact silent set-destruction this whole feature exists to
 * stop, reintroduced through its own safety valve. So compare the work itself.
 */
export function logMatchesSession(log, payload) {
  if (!log || !payload) return false;
  return completedSignature(log.exercises) === completedSignature(payload.exercises);
}
