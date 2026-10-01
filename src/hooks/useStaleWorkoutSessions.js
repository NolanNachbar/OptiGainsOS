import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { isActivelyLoggingSession } from "@/lib/activeLoggingSessions";
import { AUTO_FINISH_MAX_AGE_MS } from "@/lib/workoutSessionFlag";

/**
 * In-progress sessions past AUTO_FINISH_MAX_AGE_MS (48h), the one bucket
 * neither auto-finish sweep (useGlobalAutoFinish) nor the page-level mount
 * check (WorkoutDetail/QuickWorkout) closes on its own. Anything younger and
 * quiet for 3h is logged automatically. Older rows predate the auto-finish
 * and some hold doubtful sets, so they are resolved here by hand (Log or
 * Discard) instead of being back-filled into history, or sitting
 * `in_progress` forever with no UI mentioning them.
 */
export function useStaleWorkoutSessions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["staleWorkoutSessions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_sessions")
        .select("id, created_by, workout_id, program_workout_id, exercises, start_time, created_at, notes")
        .eq("created_by", user.id)
        .eq("status", "in_progress");
      if (error || !data?.length) return [];

      const stale = data.filter((session) => {
        if (isActivelyLoggingSession(session.id)) return false;
        const started = session.start_time || session.created_at;
        const ageMs = started ? Date.now() - new Date(started).getTime() : 0;
        return ageMs >= AUTO_FINISH_MAX_AGE_MS;
      });
      if (!stale.length) return [];

      // Sessions don't carry a denormalized workout name — resolve it from
      // whichever of workouts/program_workouts the session points at.
      const workoutIds = [...new Set(stale.map((s) => s.workout_id).filter(Boolean))];
      const programWorkoutIds = [...new Set(stale.map((s) => s.program_workout_id).filter(Boolean))];

      const [workoutsRes, programWorkoutsRes] = await Promise.all([
        workoutIds.length
          ? supabase.from("workouts").select("id, title").in("id", workoutIds)
          : Promise.resolve({ data: [] }),
        programWorkoutIds.length
          ? supabase.from("program_workouts").select("id, title").in("id", programWorkoutIds)
          : Promise.resolve({ data: [] }),
      ]);
      const titleByWorkoutId = new Map((workoutsRes.data || []).map((w) => [w.id, w.title]));
      const titleByProgramWorkoutId = new Map((programWorkoutsRes.data || []).map((w) => [w.id, w.title]));

      return stale
        .map((session) => ({
          ...session,
          name:
            titleByWorkoutId.get(session.workout_id) ||
            titleByProgramWorkoutId.get(session.program_workout_id) ||
            "Workout",
        }))
        .sort((a, b) => new Date(a.start_time || a.created_at) - new Date(b.start_time || b.created_at));
    },
    enabled: !!user,
    staleTime: 30 * 1000,
  });
}
