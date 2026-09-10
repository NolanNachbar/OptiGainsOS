/**
 * A synchronous local mirror of the sets logged in the session in progress.
 *
 * saveProgress in useWorkoutSession fires a Supabase update on every set change
 * and swallows the result into console.error. When one of those writes fails —
 * no signal in the gym, a dropped connection, a 500 — nothing retries it, and
 * React Query is not involved so nothing retries it there either.
 *
 * A failure in the MIDDLE of a workout self-heals: the autosave effect is keyed
 * on [exerciseLogs, preWorkoutNotes], so the next set logged re-fires it with a
 * payload that is a superset of the lost one. The TAIL does not heal. Whatever
 * was logged after the last write that landed is gone the moment the tab is
 * closed, because nothing ever fires again.
 *
 * So write it here first, synchronously, before the network is involved.
 * localStorage does not need signal.
 *
 * The restore preference is deliberately conservative. The draft only wins when
 * it belongs to the same session id AND holds at least as many completed sets
 * as the server row. Both conditions carry weight:
 *   - the id check stops a stale draft from a previous workout injecting its
 *     sets into a fresh session, which would be a worse failure than the one
 *     this file exists to fix
 *   - the count check means a draft stranded on this device can never delete
 *     work that another device successfully saved
 * Ties go to the draft: the same number of sets means the same work, possibly
 * with fresher loads, and the draft is the copy that was never in flight.
 */
const KEY = "optigains-workout-draft";

export function completedSetCount(exercises) {
  if (!Array.isArray(exercises)) return 0;
  return exercises.reduce(
    (n, ex) =>
      n + (Array.isArray(ex?.sets) ? ex.sets.filter((s) => s?.completed).length : 0),
    0
  );
}

export function saveDraft(sessionId, exercises, notes) {
  if (!sessionId) return;
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        sessionId,
        exercises,
        notes: notes || null,
        savedAt: Date.now(),
      })
    );
  } catch {
    // Quota exceeded, private mode, storage disabled by policy. The network
    // write is still the primary path, so a missing mirror puts us back where
    // we started rather than somewhere worse. Throwing here would take down
    // the set the athlete just logged, which is the opposite of the point.
  }
}

export function readDraft(sessionId) {
  if (!sessionId) return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft || draft.sessionId !== sessionId) return null;
    if (!Array.isArray(draft.exercises)) return null;
    return draft;
  } catch {
    return null;
  }
}

/**
 * Drop the mirror. Pass the session id that is ending: a draft belonging to a
 * DIFFERENT session is left alone, so closing one workout can never discard the
 * unsaved tail of another (the auto-finisher runs against rows the athlete is
 * not currently looking at).
 */
export function clearDraft(sessionId) {
  try {
    if (sessionId) {
      const draft = readDraft(sessionId);
      if (!draft) return;
    }
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do, and nothing depends on it having worked.
  }
}

/**
 * The session to restore: the same row, with the draft's exercises swapped in
 * when the draft is at least as complete. Returns the row untouched otherwise,
 * so every caller can wrap its session in this unconditionally.
 */
export function preferDraft(session) {
  if (!session?.id) return session;
  const draft = readDraft(session.id);
  if (!draft) return session;
  if (completedSetCount(draft.exercises) < completedSetCount(session.exercises)) {
    return session;
  }
  // restoredFromDraft means "the mirror holds something the server does not",
  // not merely "a mirror existed". The restore path uses it to decide whether
  // to push the recovered sets straight back up, and on the common case where
  // the two already agree, pushing would reset the silence clock on every app
  // open and put the 3h auto-finish permanently out of reach.
  const differs =
    JSON.stringify(draft.exercises) !== JSON.stringify(session.exercises) ||
    (draft.notes ?? null) !== (session.notes ?? null);
  return {
    ...session,
    exercises: draft.exercises,
    notes: draft.notes ?? session.notes,
    restoredFromDraft: differs,
  };
}
