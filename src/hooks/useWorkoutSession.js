import { useRef, useState, useEffect } from "react";
import { db, supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { setWorkoutActive } from "@/lib/workoutSessionFlag";
import { saveDraft, clearDraft, preferDraft } from "@/lib/workoutDraft";
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
  // What the session row already holds, so a restore's echo is not mistaken for
  // training activity. See saveProgress.
  const lastSavedRef = useRef({ exercises: null, notes: undefined });

  // A save that did not land, and the payload that would land it. saveFailed
  // drives the marker in the logging header: a drop the athlete can see while
  // he is still standing at the rack is a drop he can do something about, and
  // until now the only trace was a console.error nobody reads on a phone.
  const [saveFailed, setSaveFailed] = useState(false);
  const pendingRef = useRef(null);

  // Set when checkForActiveSession handed back a session whose local mirror
  // held sets the server row did not. restoreSession reads it to decide
  // whether the first auto-save after the restore is a genuine write (push the
  // recovered tail up) or the usual echo to be skipped.
  const draftAheadRef = useRef(false);

  /**
   * Re-send the last write that failed. Nothing else retries: React Query is
   * not in this path, and its mutations default to zero retries anyway.
   */
  const flushPending = () => {
    const pending = pendingRef.current;
    if (!pending) {
      setSaveFailed(false);
      return;
    }
    supabase
      .from("workout_sessions")
      .update({ exercises: pending.exercises, notes: pending.notes })
      .eq("id", pending.id)
      .then(({ error }) => {
        if (error) {
          console.error("Retrying a failed workout session save did not work:", error);
          return;
        }
        if (pendingRef.current === pending) pendingRef.current = null;
        lastSavedRef.current = {
          exercises: JSON.stringify(pending.exercises),
          notes: pending.notes,
        };
        setSaveFailed(false);
      });
  };

  // Retry the moment the connection returns, which in a basement gym is usually
  // the moment he walks toward the door. Without this the only thing that
  // re-fires a save is logging another set, and the sets at the END of a
  // workout are exactly the ones with nothing after them.
  useEffect(() => {
    window.addEventListener("online", flushPending);
    return () => window.removeEventListener("online", flushPending);
  }, []);

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
    // Every consumer of a session row goes through here — auto-restore,
    // Resume, and the stale auto-finisher all call this one function — so
    // this is the single place the local mirror has to be preferred for all
    // three to stop losing the tail of a workout. preferDraft returns the row
    // untouched unless a draft for THIS session id holds at least as many
    // completed sets.
    if (!data) return null;
    const merged = preferDraft(data);
    draftAheadRef.current = !!merged.restoredFromDraft;
    return merged;
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
    lastSavedRef.current = { exercises: JSON.stringify(exercises), notes: undefined };
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

    // Skip writes that change nothing. Restoring a session re-populates React
    // state, which re-fires both pages' auto-save effects with exactly the data
    // just read. That is not training activity, but the updated_at trigger
    // cannot tell the difference — it would reset the silence clock on every
    // app open, and the 3h auto-finish threshold would be unreachable for
    // anyone who opens the app more than once in three hours.
    //
    // exercises and notes are compared separately because the two pages call
    // this differently: QuickWorkout always passes null notes, WorkoutDetail
    // passes the live pre-workout field. A seeded `notes: undefined` means
    // "unknown, do not let it force a write"; the first skipped call learns the
    // real value so a later notes-only edit still saves.
    const exercisesFp = JSON.stringify(exercises);
    const nextNotes = notes || null;
    const prev = lastSavedRef.current;

    // Mirror locally before anything touches the network, and on every call
    // including the skipped ones. This write cannot fail for a lack of signal,
    // which makes it the only copy of these sets that survives a dead
    // connection. See src/lib/workoutDraft.js.
    saveDraft(id, exercises, nextNotes);

    if (exercisesFp === prev.exercises && (prev.notes === undefined || nextNotes === prev.notes)) {
      lastSavedRef.current = { exercises: exercisesFp, notes: nextNotes };
      return;
    }
    // Advanced before the write is issued, on purpose: it doubles as the
    // in-flight guard that stops a double render from firing the same update
    // twice. The failure branch below puts it back.
    lastSavedRef.current = { exercises: exercisesFp, notes: nextNotes };

    supabase
      .from("workout_sessions")
      .update({ exercises, notes: nextNotes })
      .eq("id", id)
      .then(({ error }) => {
        if (error) {
          console.error("Error saving workout session progress:", error);
          // Roll the fingerprint back to what was actually last saved. Leaving
          // it advanced marks a payload as written that never was, so the next
          // identical call is skipped as redundant and one dropped request
          // becomes a permanent hole. Guarded so a newer successful write that
          // already moved it is not clobbered.
          if (lastSavedRef.current.exercises === exercisesFp) lastSavedRef.current = prev;
          pendingRef.current = { id, exercises, notes: nextNotes };
          setSaveFailed(true);
          return;
        }
        if (pendingRef.current?.id === id) pendingRef.current = null;
        setSaveFailed(false);
      });
  };

  /**
   * Mark the session as completed and clear the ref.
   */
  const completeSession = async () => {
    const id = sessionIdRef.current;
    if (!id) return;
    sessionIdRef.current = null;
    lastSavedRef.current = { exercises: null, notes: undefined };
    pendingRef.current = null;
    setSaveFailed(false);
    // The log has been written from live React state by this point, so the
    // mirror has no one left to protect.
    clearDraft(id);
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
    // Only here. On either failure path above, the mirror is still the newest
    // copy of those sets and the next mount needs it.
    clearDraft(session.id);
    return true;
  };

  /**
   * Mark the session as cancelled and clear the ref.
   */
  const cancelSession = async () => {
    const id = sessionIdRef.current;
    if (!id) return;
    sessionIdRef.current = null;
    lastSavedRef.current = { exercises: null, notes: undefined };
    pendingRef.current = null;
    setSaveFailed(false);
    clearDraft(id);
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
  const restoreSession = (sessionId, exercises) => {
    sessionIdRef.current = sessionId;
    // Seed with what the row already holds so the auto-save effect's first fire
    // after the restore is recognised as an echo and skipped.
    //
    // Unless the sets being restored came from the local mirror and the server
    // has never seen them. Then the echo is the whole point: leave the
    // fingerprint empty so that first fire writes for real and the tail that
    // was stranded on this device lands in the row.
    const recovered = draftAheadRef.current;
    draftAheadRef.current = false;
    lastSavedRef.current = exercises === undefined || recovered
      ? { exercises: null, notes: undefined }
      : { exercises: JSON.stringify(exercises), notes: undefined };
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
    saveFailed,
    retrySave: flushPending,
  };
}
