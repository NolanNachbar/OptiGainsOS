// useOverrideProgramWorkout — replace a programmed day with a workout he picked.
//
// Two writes, in this order, and the order matters:
//   1. PATCH the program_workouts row with the replacement, and set locked.
//   2. Fire regenerate-week.
//
// locked is what makes the override stick. generate_weekly_program.py skips
// dates it considers touched — a started session, a logged workout — and an
// override happens before either exists, so without the lock the regeneration
// this very hook triggers would write the engine's plan straight back over the
// swap. Setting it first also closes the race against a cron run landing
// mid-override.
//
// The rest of the week still reflows: only the overridden date is skipped, so
// the engine re-plans the days around it knowing what he's now doing on it.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { db, supabase } from "@/api/supabaseClient";

export function useOverrideProgramWorkout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ programWorkout, replacement, source }) => {
      if (!programWorkout?.id || !replacement) return null;

      const exercises = Array.isArray(replacement.exercises) ? replacement.exercises : [];
      await db.entities.ProgramWorkout.update(programWorkout.id, {
        title: replacement.title || programWorkout.title,
        focus: replacement.focus || "strength",
        exercises,
        // The engine's cardio for that day belonged to the session it planned;
        // the replacement carries its own conditioning as exercise rows (see
        // engine/library_capture.py), so leaving the old runs attached would
        // staple a prescription he didn't choose onto one he did.
        cardio_sessions: [],
        duration_minutes: replacement.duration_minutes ?? null,
        locked: true,
        override_source: source || "custom",
      });

      // Best-effort, same as the equipment toggle: the override is already saved,
      // and a failed dispatch only means the week reflows on the next cron.
      try {
        const { error } = await supabase.functions.invoke("replan-day", {
          body: {
            event_type: "regenerate-week",
            reason: `override ${programWorkout.scheduled_date} → ${replacement.title}`,
          },
        });
        if (error) throw error;
      } catch (e) {
        console.error("week regeneration dispatch failed; the override is saved", e);
      }
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programWorkout"] });
      queryClient.invalidateQueries({ queryKey: ["programWorkouts"] });
      queryClient.invalidateQueries({ queryKey: ["todayPrescription"] });
    },
  });
}
