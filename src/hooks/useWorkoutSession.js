import { useRef } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";

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
    const { error } = await supabase
      .from("workout_sessions")
      .update({ status: "completed" })
      .eq("id", id);
    if (error) console.error("Error completing workout session:", error);
  };

  /**
   * Mark a specific session as completed by ID without touching sessionIdRef.
   * Used to auto-finish stale sessions found on mount.
   */
  const autoFinishSession = async (sessionId) => {
    const { error } = await supabase
      .from("workout_sessions")
      .update({ status: "completed" })
      .eq("id", sessionId);
    if (error) console.error("Error auto-finishing workout session:", error);
  };

  /**
   * Mark the session as cancelled and clear the ref.
   */
  const cancelSession = async () => {
    const id = sessionIdRef.current;
    if (!id) return;
    sessionIdRef.current = null;
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
