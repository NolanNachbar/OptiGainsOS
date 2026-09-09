import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";

// A session older than this stops being "the workout you are in the middle of"
// and goes back to being a banner. Without the bound, one forgotten in_progress
// row hijacks every single app launch from then on, and the only way out is to
// open the workout you did not want and end it.
export const ACTIVE_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** Where an in-progress session lives, so the banner and the launch redirect
 *  can never drift to different URLs for the same session. */
export function activeSessionPath(session) {
  if (!session) return null;
  if (session.program_workout_id) {
    const enrollment = session.enrollment_id ? `&enrollmentId=${session.enrollment_id}` : "";
    return `/workout-detail?source=program&programWorkoutId=${session.program_workout_id}${enrollment}`;
  }
  if (session.workout_id) return `/workout-detail?id=${session.workout_id}`;
  return null;
}

/** The single in-progress workout session, or null. */
export function useActiveWorkoutSession() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["activeWorkoutSession", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("workout_sessions")
        .select("id, workout_id, program_workout_id, enrollment_id, start_time, created_at")
        .eq("created_by", user.id)
        .eq("status", "in_progress")
        // Skip orphan sessions with no navigable target, else the banner dead-ends.
        .or("workout_id.not.is.null,program_workout_id.not.is.null")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return null;
      // Freshness is stamped at fetch time, not read time: Date.now() during
      // render is impure and re-runs unpredictably. staleTime is 30s and the
      // window is 12h, so the drift is irrelevant.
      const started = data.start_time || data.created_at;
      const age = started ? Date.now() - new Date(started).getTime() : Infinity;
      return { ...data, isFresh: age < ACTIVE_SESSION_MAX_AGE_MS };
    },
    enabled: !!user,
    staleTime: 30 * 1000,
  });

  return {
    activeSession: data || null,
    isLoading,
    isFresh: !!data?.isFresh,
    path: activeSessionPath(data),
  };
}
