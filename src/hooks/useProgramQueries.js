import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db, supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys, invalidatePrograms } from "@/lib/queryKeys";
import { updateProgressionState } from "@/utils/programProgression";

// ── Queries ──────────────────────────────────────────────

export function useMyPrograms() {
  const { user } = useAuth();

  const { data: programs = [], isLoading, error } = useQuery({
    queryKey: queryKeys.programs(user?.id),
    queryFn: () => db.entities.Program.filter({ created_by: user.id }),
    enabled: !!user,
  });

  return { programs, isLoading, error };
}

export function useProgram(id) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.program(id),
    queryFn: async () => {
      const program = await db.entities.Program.get(id);
      const workouts = await db.entities.ProgramWorkout.filter({ program_id: id });

      // v2: sort by day_index; v1: sort by week_number then day_number
      const isV2 = program.schema_version === 2;
      const sorted = workouts.sort((a, b) => {
        if (isV2) return (a.day_index || 0) - (b.day_index || 0);
        if (a.week_number !== b.week_number) return a.week_number - b.week_number;
        return a.day_number - b.day_number;
      });

      return { ...program, workouts: sorted };
    },
    enabled: !!id,
  });

  return { program: data, isLoading, error };
}

export function useEnrollments() {
  const { user } = useAuth();

  const { data: enrollments = [], isLoading, error } = useQuery({
    queryKey: queryKeys.enrollments(user?.id),
    queryFn: async () => {
      const enrollments = await db.entities.ProgramEnrollment.filter({ created_by: user.id });
      const programIds = [...new Set(enrollments.map(e => e.program_id))];
      if (programIds.length === 0) return [];

      const { data: programs } = await supabase
        .from('programs')
        .select('id, title, description, focus, duration_weeks, days_per_week, schema_version, num_cycles, tags')
        .in('id', programIds);

      const { data: allProgramWorkouts } = await supabase
        .from('program_workouts')
        .select('*')
        .in('program_id', programIds);

      const programMap = {};
      (programs || []).forEach(p => { programMap[p.id] = p; });

      const workoutsMap = {};
      (allProgramWorkouts || []).forEach(w => {
        if (!workoutsMap[w.program_id]) workoutsMap[w.program_id] = [];
        workoutsMap[w.program_id].push(w);
      });

      return enrollments.map(e => ({
        ...e,
        program: programMap[e.program_id]
          ? { ...programMap[e.program_id], workouts: workoutsMap[e.program_id] || [] }
          : null,
      }));
    },
    enabled: !!user,
  });

  return { enrollments, isLoading, error };
}

export function useEnrollment(programId) {
  const { user } = useAuth();

  const { data: enrollment, isLoading, error } = useQuery({
    queryKey: queryKeys.enrollment(user?.id, programId),
    queryFn: async () => {
      const results = await db.entities.ProgramEnrollment.filter({
        created_by: user.id,
        program_id: programId,
      });
      return results.find(r => r.status === 'active')
        || results.find(r => r.status === 'paused')
        || results.find(r => r.status === 'completed')
        || null;
    },
    enabled: !!user && !!programId,
  });

  return { enrollment, isLoading, error };
}

// ── Mutations ────────────────────────────────────────────

export function useCreateProgram() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ program, workouts }) => {
      const created = await db.entities.Program.create({
        ...program,
        created_by: user.id,
      });

      for (const workout of workouts) {
        await db.entities.ProgramWorkout.create({
          ...workout,
          program_id: created.id,
        });
      }

      return created;
    },
    onSuccess: () => {
      invalidatePrograms(queryClient);
    },
  });
}

export function useUpdateProgram() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates, workouts }) => {
      const updated = await db.entities.Program.update(id, updates);

      if (workouts) {
        const existing = await db.entities.ProgramWorkout.filter({ program_id: id });
        for (const w of existing) {
          await db.entities.ProgramWorkout.delete(w.id);
        }
        for (const workout of workouts) {
          await db.entities.ProgramWorkout.create({
            ...workout,
            program_id: id,
          });
        }
      }

      return updated;
    },
    onSuccess: () => {
      invalidatePrograms(queryClient);
    },
  });
}

export function useDeleteProgram() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => db.entities.Program.delete(id),
    onSuccess: () => {
      invalidatePrograms(queryClient);
    },
  });
}

export function useEnrollInProgram() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ programId, startingWeights = {}, startDate }) => {
      const progressionState = {};
      for (const [exerciseName, weight] of Object.entries(startingWeights)) {
        if (weight > 0) {
          progressionState[exerciseName] = {
            working_weight: weight,
            last_session_rpe_avg: null,
            last_session_date: null,
            sessions_at_current_weight: 0,
            ready_to_progress: false,
            first_programmed_at: new Date().toISOString().split('T')[0],
          };
        }
      }

      // Find the first workout day with exercises (skip rest days)
      const allWorkouts = await db.entities.ProgramWorkout.filter({ program_id: programId });
      const workoutsWithExercises = allWorkouts.filter(w => {
        const hasExercises = Array.isArray(w.exercises) && w.exercises.length > 0;
        return hasExercises;
      });

      const firstWorkout = workoutsWithExercises.sort((a, b) => (a.day_index || 0) - (b.day_index || 0))[0];
      const startDayIndex = firstWorkout?.day_index || 1;

      const enrollmentData = {
        progression_state: progressionState,
        status: 'active',
        current_cycle: 1,
        current_day_index: startDayIndex,
        start_date: startDate || new Date().toISOString().split('T')[0],
        current_week: 1,
        current_day: startDayIndex,
        completed_workouts: [],
      };

      // Re-use the existing row if the user previously cancelled (unique constraint on user+program)
      const existing = await db.entities.ProgramEnrollment.filter({ created_by: user.id, program_id: programId });
      if (existing.length > 0) {
        return db.entities.ProgramEnrollment.update(existing[0].id, enrollmentData);
      }

      return db.entities.ProgramEnrollment.create({
        created_by: user.id,
        program_id: programId,
        ...enrollmentData,
      });
    },
    onSuccess: (data, variables) => {
      invalidatePrograms(queryClient);
    },
  });
}

export function useLogProgramWorkout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ enrollmentId, programWorkoutId, exerciseLogs, enrollment, workoutCycle }) => {
      let newState = { ...enrollment.progression_state };

      const programWorkout = await db.entities.ProgramWorkout.get(programWorkoutId);
      const currentCycle = workoutCycle || enrollment.current_cycle || 1;

      for (const log of exerciseLogs) {
        const exerciseConfig = (programWorkout.exercises || []).find(
          (e) => e.name === log.name
        );
        if (exerciseConfig) {
          newState = updateProgressionState(newState, exerciseConfig, log.sets || []);
        }
      }

      const actualCycle = currentCycle;
      const actualDayIndex = programWorkout.day_index;

      // Store completion with the ACTUAL cycle and day_index from the calendar schedule
      const completedWorkouts = [
        ...(enrollment.completed_workouts || []),
        {
          program_workout_id: programWorkoutId,
          cycle: actualCycle,
          day_index: actualDayIndex,
          completed_at: new Date().toISOString(),
        },
      ];

      const program = await db.entities.Program.get(enrollment.program_id);
      const isV2 = program.schema_version === 2;

      let updateFields;

      if (isV2) {
        // v2: Simplified progression - just advance to next workout in sequence
        // No calendar-based skipping - user completes workouts in order

        const allProgramWorkouts = await db.entities.ProgramWorkout.filter({ program_id: enrollment.program_id });
        const sortedWorkouts = allProgramWorkouts.sort((a, b) => (a.day_index || 0) - (b.day_index || 0));

        // Advance to next workout
        let new_day_index = actualDayIndex + 1;
        let new_cycle = actualCycle;
        let status = 'active';

        // If we've completed all workouts in this cycle, move to next cycle
        if (new_day_index > sortedWorkouts.length) {
          new_day_index = 1;
          new_cycle += 1;
        }

        // Check if program is complete
        if (new_cycle > (program.num_cycles || 1)) {
          new_cycle = program.num_cycles || 1;
          new_day_index = sortedWorkouts.length;
          status = 'completed';
        }

        updateFields = {
          completed_workouts: completedWorkouts,
          progression_state: newState,
          current_day_index: new_day_index,
          current_cycle: new_cycle,
          // Keep v1 fields in sync
          current_day: new_day_index,
          current_week: new_cycle,
          status,
          updated_at: new Date().toISOString(),
        };
      } else {
        // v1: week/day advancement
        let { current_day, current_week } = enrollment;
        current_day += 1;

        if (current_day > program.days_per_week) {
          current_day = 1;
          current_week += 1;
        }

        const status = current_week > program.duration_weeks ? 'completed' : 'active';

        updateFields = {
          completed_workouts: completedWorkouts,
          progression_state: newState,
          current_day,
          current_week,
          status,
          updated_at: new Date().toISOString(),
        };
      }

      await db.entities.ProgramEnrollment.update(enrollmentId, updateFields);

      // Immediately invalidate all relevant queries to ensure UI updates
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['enrollments'] }),
        queryClient.invalidateQueries({ queryKey: ['enrollment'] }),
        queryClient.invalidateQueries({ queryKey: ['programs'] }),
        queryClient.invalidateQueries({ queryKey: ['schedule'] }),
      ]);

      return {
        status: updateFields.status,
        current_week: updateFields.current_week || updateFields.current_cycle,
        current_day: updateFields.current_day || updateFields.current_day_index,
      };
    },
    onSuccess: () => {
      invalidatePrograms(queryClient);
    },
  });
}

export function useUpdateEnrollmentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }) =>
      db.entities.ProgramEnrollment.update(id, {
        status,
        updated_at: new Date().toISOString(),
      }),
    onSuccess: () => {
      invalidatePrograms(queryClient);
    },
  });
}

export function useDeleteEnrollment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => db.entities.ProgramEnrollment.update(id, { status: "cancelled" }),
    onSuccess: () => {
      invalidatePrograms(queryClient);
    },
  });
}
