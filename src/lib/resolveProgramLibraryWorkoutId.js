import { db } from "@/api/supabaseClient";

/**
 * The `workouts` row id a program-day log should reference as workout_id.
 * Program days live in program_workouts, which workout_logs.workout_id can't
 * point at. Prefer source_workout_id (a library workout dragged into the
 * program), else reuse a workout with the same title, else create one.
 *
 * Shared by the Finish button (WorkoutDetail) and the stale-session
 * auto-finisher so both write the same linkage.
 */
export async function resolveProgramLibraryWorkoutId(programWorkout, userId) {
  if (programWorkout?.source_workout_id) return programWorkout.source_workout_id;

  const allUserWorkouts = await db.entities.Workout.filter({ created_by: userId });
  const existing = allUserWorkouts.find((w) => w.title === programWorkout.title);
  if (existing) return existing.id;

  const created = await db.entities.Workout.create({
    title: programWorkout.title,
    description: programWorkout.description || "",
    focus: programWorkout.focus || "strength",
    duration_minutes: programWorkout.duration_minutes || 45,
    exercises: programWorkout.exercises || [],
    created_by: userId,
  });
  return created.id;
}
