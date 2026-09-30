import { db, supabase } from "@/api/supabaseClient";
import { clearDraft, preferDraft } from "@/lib/workoutDraft";
import {
  buildWorkoutLogFromSession,
  sessionHasLoggedSets,
  logMatchesSession,
} from "@/lib/buildWorkoutLogFromSession";

/**
 * Finish (or close out) a stale session -- the shared core behind both the
 * page-level check (WorkoutDetail/QuickWorkout, scoped to the one workout
 * being opened) and the app-wide sweep (useGlobalAutoFinish, which can
 * observe the same row on mount or on a visibilitychange). Both callers can
 * legitimately fire for the same session in the same tick.
 *
 * Returns one of:
 *   'logged'    a workout_log was written and the session marked completed
 *   'cancelled' the session had no completed sets; closed with no log, same
 *               as a manual Cancel, so it stops pinning optigains-workout-active
 *   false       nothing changed (still in_progress) -- a log write or status
 *               update failed; recoverable by hand, safe to leave alone
 *
 * inFlight is a Map<sessionId, Promise<result>>, not a Set. A bare Set can
 * only tell a second caller "someone's already on it" -- it can't tell them
 * WHAT happened, so the second caller (a page's own mount check racing this
 * sweep, or vice versa) used to get a bare `false` indistinguishable from
 * "nothing to do here" and would fall through to showing a stale Resume
 * dialog while the first caller's write was still in flight. Awaiting the
 * SAME promise instead means every caller for a given session id sees the
 * one true outcome, whichever caller actually did the work.
 *
 * Log first, status second, exactly as before: a session stuck in_progress is
 * recoverable by hand; a session marked completed with no log is silent data
 * loss and looks identical to a workout that never happened.
 */
const inFlight = new Map();

export async function autoFinishStaleSession(session, timezone) {
  if (!session?.id) return false;
  if (inFlight.has(session.id)) return inFlight.get(session.id);

  const promise = (async () => {
    // The sweep reads raw rows straight off the wire -- never through
    // checkForActiveSession, so never through preferDraft. A session the
    // server shows as empty can still hold completed sets in this device's
    // local draft (a save that never landed -- dead wifi at the gym is the
    // whole reason the draft mirror exists). Merge before classifying, or an
    // offline set gets read as "no work done" and the session -- and the only
    // surviving copy of those sets -- gets cancelled out from under him.
    const merged = preferDraft(session);

    if (!sessionHasLoggedSets(merged)) {
      const { error } = await supabase
        .from("workout_sessions")
        .update({ status: "cancelled" })
        // Only flip a row that's still in_progress. Without this guard a
        // late-arriving classification (e.g. a concurrent caller already
        // logged it) could stomp 'completed' back to 'cancelled'.
        .eq("id", session.id)
        .eq("status", "in_progress");
      if (error) {
        console.error("Auto-finish could not close an empty stale session:", error);
        return false;
      }
      clearDraft(session.id);
      return "cancelled";
    }

    const payload = buildWorkoutLogFromSession(merged, timezone);

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
      .eq("id", session.id)
      .eq("status", "in_progress");
    if (error) {
      console.error("Auto-finish wrote the log but could not close the session:", error);
      return false;
    }
    clearDraft(session.id);
    return "logged";
  })();

  inFlight.set(session.id, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(session.id);
  }
}

/**
 * Read a session's current status straight from the DB. Callers that showed
 * UI (the Resume dialog) based on a session snapshot taken some time ago
 * cannot trust that snapshot across an await -- the global sweep, or this
 * same session open in a second tab, can have closed the row in the
 * meantime. Returns null on a read error or a missing row (fail open: let
 * the caller's own guarded UPDATE be the real safety net).
 */
export async function getSessionStatus(sessionId) {
  if (!sessionId) return null;
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("status")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) {
    console.error("Error reading session status:", error);
    return null;
  }
  return data?.status ?? null;
}
