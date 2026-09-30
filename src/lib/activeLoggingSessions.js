/**
 * Module-level registry of workout_session ids being actively logged into
 * right now, on THIS tab, in WorkoutDetail or QuickWorkout.
 *
 * useGlobalAutoFinish's sweep consults this to skip only the session(s)
 * genuinely open, instead of the old body[data-logging-active] check, which
 * was a single whole-app on/off flag: any logger open anywhere bailed the
 * ENTIRE sweep, so a second, separately-stale session (he trains twice in a
 * day) never got picked up while today's session was still open. It also
 * only ever got set by WorkoutDetail -- QuickWorkout never touched it -- so
 * a backgrounded-then-idle Quick Workout session was never skipped at all.
 *
 * Registering by id fixes both: only the id(s) actually in this Set are
 * skipped, and both pages register through the same useWorkoutSession calls
 * (createSession/restoreSession add, completeSession/cancelSession/unmount
 * remove), so neither page can forget to opt in.
 *
 * index.css's hide-chrome rule still keys off body[data-logging-active]
 * (WorkoutDetail's own isLogging toggle) -- that concern is unrelated to
 * this registry and is left alone.
 */
const activeSessionIds = new Set();

export function registerActiveLoggingSession(sessionId) {
  if (sessionId) activeSessionIds.add(sessionId);
}

export function unregisterActiveLoggingSession(sessionId) {
  if (sessionId) activeSessionIds.delete(sessionId);
}

export function isActivelyLoggingSession(sessionId) {
  return !!sessionId && activeSessionIds.has(sessionId);
}
