import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, startOfWeek, subWeeks, addDays } from 'date-fns';
import { supabase, db } from '@/api/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useUserQueries';
import { getProgramSchedule } from '@/utils/programSchedule';
import {
  getLastWeekStart,
  analyzeWeekCompletion,
  computeAdaptation,
  applyAdaptation,
  persistAdaptation,
} from '@/utils/runningAdaptation';
import { toast } from 'sonner';

const weekKey = () =>
  `training_adaptation_${format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd')}`;

async function fetchAdaptationData(userId) {
  // Active enrollments
  const enrollments = await db.entities.ProgramEnrollment.filter({
    user_id: userId,
    status: 'active',
  });
  if (!enrollments.length) return null;

  for (const enrollment of enrollments) {
    const program = await db.entities.Program.get(enrollment.program_id);
    if (!program) continue;
    if (!Array.isArray(program.tags) || !program.tags.includes('adaptive')) continue;

    const workouts = await db.entities.ProgramWorkout.filter({ program_id: program.id });
    if (!workouts.length) continue;

    const scheduleEntries = getProgramSchedule({ ...enrollment, program }, workouts);

    // Strava activities from the last 2 weeks
    const twoWeeksAgo = format(subWeeks(new Date(), 2), 'yyyy-MM-dd');
    const { data: activities } = await supabase
      .from('cardio_sessions')
      .select('activity_type, start_date, moving_time_seconds')
      .eq('created_by', userId)
      .gte('start_date', twoWeeksAgo)
      .order('start_date', { ascending: false });

    const lastWeekStart = getLastWeekStart();
    const completionRate = analyzeWeekCompletion(scheduleEntries, activities || [], lastWeekStart);

    const totalDays = program.cycle_length || workouts.length * 7;
    const currentDayIndex = enrollment.current_day_index || 1;
    const weeksToRace = Math.ceil((totalDays - currentDayIndex) / 7);
    const adaptation = computeAdaptation(completionRate, weeksToRace);

    if (adaptation.scale === 1.0 || adaptation.affectedWeeks === 0) continue;

    const adaptedWorkouts = applyAdaptation(workouts, currentDayIndex, adaptation.scale, adaptation.affectedWeeks);

    // Build the list of specific session changes to show the user
    const weekStartStr = format(lastWeekStart, 'yyyy-MM-dd');
    const weekEndStr   = format(addDays(lastWeekStart, 7), 'yyyy-MM-dd');
    const plannedCount = scheduleEntries.filter(
      (e) => e.date >= weekStartStr && e.date < weekEndStr && (e.cardio_sessions || []).length > 0
    ).length;

    const changes = [];
    for (let i = 0; i < workouts.length; i++) {
      const orig    = workouts[i];
      const adapted = adaptedWorkouts[i];
      if (!(orig.cardio_sessions || []).length) continue;
      for (let j = 0; j < (orig.cardio_sessions || []).length; j++) {
        const os = orig.cardio_sessions[j];
        const as_ = (adapted.cardio_sessions || [])[j];
        if (!as_ || os.duration_minutes === as_.duration_minutes) continue;
        changes.push({
          title: os.title || `Day ${orig.day_index} session`,
          from: os.duration_minutes,
          to: as_.duration_minutes,
        });
      }
    }

    if (!changes.length) continue;

    return {
      completionRate,
      plannedCount,
      adaptation,
      changes,
      programId: program.id,
      workouts,
      adaptedWorkouts,
      currentDayIndex,
    };
  }

  return null;
}

export function useTrainingAdaptation() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  const [handled, setHandled] = useState(() => !!localStorage.getItem(weekKey()));

  const enabled = !!user && !!profile?.adaptive_training && !handled;

  const { data, isLoading } = useQuery({
    queryKey: ['trainingAdaptation', user?.id],
    queryFn: () => fetchAdaptationData(user.id),
    enabled,
    staleTime: 30 * 60 * 1000, // recompute at most every 30 min
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!data) return;
      await persistAdaptation(db, data.programId, data.workouts, data.adaptedWorkouts);
    },
    onSuccess: () => {
      localStorage.setItem(weekKey(), 'approved');
      setHandled(true);
      queryClient.invalidateQueries({ queryKey: ['programs'] });
      queryClient.invalidateQueries({ queryKey: ['enrollments'] });
      toast.success('Training load adjusted for next week.');
    },
    onError: () => {
      toast.error('Failed to apply changes — try again.');
    },
  });

  const dismiss = () => {
    localStorage.setItem(weekKey(), 'dismissed');
    setHandled(true);
  };

  const hasSuggestion = useMemo(
    () => enabled && !!data && !handled,
    [enabled, data, handled]
  );

  return {
    hasSuggestion,
    isLoading,
    completionRate: data?.completionRate ?? 0,
    plannedCount:   data?.plannedCount   ?? 0,
    adaptation:     data?.adaptation     ?? null,
    changes:        data?.changes        ?? [],
    approve: approveMutation,
    dismiss,
  };
}
