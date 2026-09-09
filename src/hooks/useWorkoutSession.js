import { useRef } from "react";
import { db, supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { setWorkoutActive } from "@/lib/workoutSessionFlag";
import {
  buildWorkoutLogFromSession,
  sessionHasLoggedSets,
  logMatchesSession,
} from "@/lib/buildWorkoutLogFromSession";

/**
 * Manages a workout_sessions row in Supabase so in-progress workouts
 * survive app closes, reloads, and device switches.
 *
 * sessionIdRef holds the current session ID (null when no active session).
 * All write operations are fire-and-forget — they don't block the UI.
 */
export function useWorkoutSession() {
  const { user } = useAuth();
  const sessionIdRef = useRef(null);

  /**
   * Check for an existing in_progress session for this workout.
   * Pass workoutId for regular workouts, programWorkoutId for program mode,
   * or neither for quick workouts.
   */
  /**
   * Is there ANY in-progress session for this user, on any workout?
   *
   * Deliberately unscoped. The workout-scoped `checkForActiveSession` below must
   * never be the thing that decides the cross-cutting "workout active" flag: if
   * he is mid-program-workout and opens Quick Workout, the scoped query matches
   * nothing, and clearing the flag off that result releases a pending
   * service-worker reload straight into a live session.
   */
  const hasAnyActiveSession = async () => {
    if (!user) return false;
    const { data, error } = await supabase
      .from("workout_sessions")
      .select("id")
      .eq("created_by", user.id)
      .eq("status", "in_progress")
      .limit(1);
    // Fail closed: on a network error assume a workout IS live rather than
    // risk clearing the flag and reloading on top of him.
    if (error) return true;
    return (data || []).length > 0;
  };

  const checkForActiveSession = async ({ workoutId, programWorkoutId } = {}) => {
    if (!user) return null;

    let query = supabase
      .from("workout_sessions")
      .select("*")
      .eq("created_by", user.id)
      .eq("status", "in_progress");

    if (programWorkoutId) {
      query = query.eq("program_workout_id", programWorkoutId);
    } else if (workoutId) {
      query = query.eq("workout_id", workoutId);
    } else {
      // Quick workout: no workout_id or program_workout_id
      query = query.is("workout_id", null).is("program_workout_id", null);
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error checking for active workout session:", error);
      return null;
    }
    // No session for THIS workout. That alone says nothing about whether a
    // workout is live — he may be mid-session on a different one. Only clear the
    // stale-flag leftover (crash/force-quit that never hit
    // completeSession/cancelSession) once an unscoped check confirms there is no
    // in-progress session anywhere.
    if (!data) {
      const anyLive = await hasAnyActiveSession();
      if (!anyLive) setWorkoutActive(false);
    }
    return data || null;
  };

  /**
   * Create a new in_progress session and store its ID.
   */
  const createSession = async ({ workoutId, programWorkoutId, enrollmentId, exercises, startTime }) => {
    if (!user) return null;

    const { data, error } = await supabase
      .from("workout_sessions")
      .insert({
        created_by: user.id,
        workout_id: workoutId || null,
        program_workout_id: programWorkoutId || null,
        enrollment_id: enrollmentId || null,
        exercises,
        status: "in_progress",
        start_time: new Date(startTime).toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating workout session:", error);
      return null;
    }

    sessionIdRef.current = data.id;
    setWorkoutActive(true);
    return data;
  };

  /**
   * Save current exercise progress to the active session.
   * Fire-and-forget — does not block the UI.
   */
  const saveProgress = (exercises, notes) => {
    const id = sessionIdRef.current;
    if (!id) return;
    supabase
      .from("workout_sessions")
      .update({ exercises, notes: notes || null })
      .eq("id", id)
      .then(({ error }) => {
        if (error) console.error("Error saving workout session progress:", error);
      });
  };

  /**
   * Mark the session as completed and clear the ref.
   */
  const completeSession = async () => {
    const id = sessionIdRef.current;
    if (!id) return;
    sessionIdRef.current = null;
    setWorkoutActive(false);
    const { error } = await supabase
      .from("workout_sessions")
      .update({ status: "completed" })
      .eq("id", id);
    if (error) console.error("Error completing workout session:", error);
  };

  /**
   * Finish a stale session found on mount, and write its workout_log.
   *
   * Both halves, in this order. The 8h auto-finish this replaces flipped
   * `status` and stopped, so the sets were still in the session row but no
   * workout_log existed and every downstream learner — MRV, volume budget,
   * exercise values — saw a week where that workout never happened. Three
   * sessions from August are sitting in exactly that state.
   *
   * So: log first, status second, and if the log write fails we leave the
   * session in_progress and return false. A session stuck in_progress is
   * recoverable by hand; a session marked completed with no log is silent
   * data loss, and looks identical to a workout he never did.
   *
   * Returns true only if the log landed.
   */
  const autoFinishSession = async (session, timezone) => {
    if (!session?.id) return false;
    if (!sessionHasLoggedSets(session)) return false;

    const payload = buildWorkoutLogFromSession(session, timezone);

    // If the previous attempt wrote the log and then failed to close the row,
    // this mount must not write it again. There is already one duplicated
    // (created_by, log_date) pair in the live data from 2026-06-22 and it is a
    // standing smoke failure; do not manufacture more.
    //
    // But the date is only the shortlist, never the verdict. He trains twice in
    // a day often enough, and skipping the second log while still closing its
    // session would destroy those sets exactly the way the old 8h auto-finish
    // did. Only a log whose completed work matches this session's counts as
    // already-written.
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
      // The log exists, so nothing is lost; the row just stays in_progress and
      // the next mount retries. Guard against a second log on that retry.
      console.error("Auto-finish wrote the log but could not close the session:", error);
      return false;
    }
    return true;
  };

  /**
   * Mark the session as cancelled and clear the ref.
   */
  const cancelSession = async () => {
    const id = sessionIdRef.current;
    if (!id) return;
    sessionIdRef.current = null;
    setWorkoutActive(false);
    const { error } = await supabase
      .from("workout_sessions")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) console.error("Error cancelling workout session:", error);
  };

  /**
   * Restore a previously found session (set its ID so saves go to the right row).
   */
  const restoreSession = (sessionId) => {
    sessionIdRef.current = sessionId;
    setWorkoutActive(true);
  };

  return {
    sessionIdRef,
    checkForActiveSession,
    createSession,
    saveProgress,
    completeSession,
    autoFinishSession,
    cancelSession,
    restoreSession,
  };
}
