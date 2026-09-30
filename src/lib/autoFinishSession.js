import { db, supabase } from "@/api/supabaseClient";
import { clearDraft } from "@/lib/workoutDraft";
import {
  buildWorkoutLogFromSession,
  sessionHasLoggedSets,
  logMatchesSession,
} from "@/lib/buildWorkoutLogFromSession";

/**
 * Finish a stale session and write its workout_log -- the shared core behind
 * both the page-level check (WorkoutDetail/QuickWorkout, scoped to the one
 * workout being opened) and the app-wide sweep (useGlobalAutoFinish, which
 * can observe the same row on mount or on a visibilitychange). Both callers
 * can legitimately fire for the same session in the same tick; the in-flight
 * guard below is what stops that from becoming two workout_log writes.
 *
 * logMatchesSession (content-fingerprint dedup) alone is not race-safe: two
 * concurrent callers can both read "no matching log yet" before either has
 * written one. This Set closes that window -- the second caller for the same
 * session id gets `false` immediately instead of racing the DB.
 *
 * Log first, status second, exactly as before: a session stuck in_progress is
 * recoverable by hand; a session marked completed with no log is silent data
 * loss and looks identical to a workout that never happened.
 */
const inFlight = new Set();

export async function autoFinishStaleSession(session, timezone) {
  if (!session?.id) return false;
  if (inFlight.has(session.id)) return false;
  inFlight.add(session.id);

  try {
    if (!sessionHasLoggedSets(session)) return false;

    const payload = buildWorkoutLogFromSession(session, timezone);

    try {
      const sameDay = await db.entities.WorkoutLog.filter({
        created_by: payload.created_by,
        log_date: payload.log_date,
      });
      const alreadyWritten = (sameDay || []).some((log) => logMatchesSession(log, payload));
      if (!alreadyWritten) await db.entities.WorkoutLog.create(payload);
    } catch (error) {
      console.error("Auto-finish aborted, workout_log write failed:", error);
      return false;
    }

    const { error } = await supabase
      .from("workout_sessions")
      .update({ status: "completed" })
      .eq("id", session.id);
    if (error) {
      console.error("Auto-finish wrote the log but could not close the session:", error);
      return false;
    }
    clearDraft(session.id);
    return true;
  } finally {
    inFlight.delete(session.id);
  }
}
