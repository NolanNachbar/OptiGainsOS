import { useEffect, useState, useMemo } from "react";
import { db, supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { calculateMacros } from "@/utils/nutritionUtils";
import { getBestTDEE } from "@/utils/coachingUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { queryKeys, invalidateBodyWeight, invalidateSchedule, invalidateWorkouts, invalidatePrograms } from "@/lib/queryKeys";
import { useProfile, useAllFoodEntries, useBodyWeightEntries, useRecoveryMetrics } from "@/hooks/useUserQueries";
import { useDietPhase } from "@/hooks/useDietPhase";
import { useEnrollments, useProgram } from "@/hooks/useProgramQueries";
import { getTodayProgramWorkout, getProgramSchedule } from "@/utils/programSchedule";
import { getRecoveryHeatmapData } from "@/utils/muscleVolumeUtils";
import MuscleHeatMap from "@/components/MuscleHeatMap";
import { UserAvatar } from "@/components/ui/UserAvatar";
import {
  Dumbbell,
  Calendar,
  Target,
  Circle,
  Clock,
  ArrowRight,
  Apple,
  Scale,
  Flame,
  Brain,
  ChevronDown,
  ChevronUp,
  Zap,
  ListChecks,
  Activity,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { format, addDays, addWeeks, subWeeks } from "date-fns";
import { getTodayString, getWeekStart, getWeekEnd } from "@/utils/dateUtils";
import { toast } from "sonner";
import { calculateVolume } from "@/utils/exerciseStats";
import { calculateTrainingCapacity, calculateReadinessScore, getReadinessCategory } from "@/utils/recoveryUtils";
import { useTodayPrescription } from "@/hooks/useEngineQueries";
import TrainingLoadTab from "@/components/dashboard/TrainingLoadTab";
import MorningCheckin from "@/components/dashboard/MorningCheckin";
import ReadinessRing from "@/components/dashboard/ReadinessRing";
import DailyBriefCard from "@/components/dashboard/DailyBriefCard";
import TodayActions from "@/components/dashboard/TodayActions";
import NextWorkoutCard from "@/components/dashboard/NextWorkoutCard";
import EngineStatusCard from "@/components/dashboard/EngineStatusCard";
import SorenessCheckin from "@/components/dashboard/SorenessCheckin";


function getWorkoutSplitTitle(exercises) {
  if (!exercises?.length) return null;
  const names = exercises.map(e => (e.name || '').toLowerCase()).join(' ');
  const hasSquat = names.includes('squat') || names.includes('deadlift') || names.includes('leg press') || names.includes('hip thrust');
  const hasPush  = names.includes('bench') || names.includes('overhead press') || names.includes('push-up');
  const hasPull  = names.includes('row') || names.includes('pull-up') || names.includes('pulldown');
  if (hasSquat && !hasPush && !hasPull) return 'Legs Session';
  if (hasPush && !hasPull && !hasSquat) return 'Push Session';
  if (hasPull && !hasPush && !hasSquat) return 'Pull Session';
  if ((hasPush || hasPull) && hasSquat) return 'Full Body';
  return null;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { activePhase } = useDietPhase();

  const [newBodyWeight, setNewBodyWeight] = useState("");
  const [bodyWeightDate, setBodyWeightDate] = useState(() => getTodayString(null));
  const [bodyWeightNotes, setBodyWeightNotes] = useState("");
  const [welcomeBannerVisible, setWelcomeBannerVisible] = useState(
    () => !localStorage.getItem('optigains_welcome_dismissed')
  );

  // Today's workout expand state
  const [showTodayExercises, setShowTodayExercises] = useState(false);

  const cardioKey = (name) => `cardio_done_${user?.id}_${today}_${name}`;
  const [cardioChecked, setCardioChecked] = useState(() => {
    const stored = {};
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith(`cardio_done_${user?.id}_${today}_`))
        .forEach(k => { stored[k.split('_').slice(4).join('_')] = true; });
    } catch {}
    return stored;
  });
  const toggleCardio = (name) => {
    const key = cardioKey(name);
    const next = !cardioChecked[name];
    setCardioChecked(prev => ({ ...prev, [name]: next }));
    if (next) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  };
  const [muscleView, setMuscleView] = useState("anterior");

  // Schedule state
  const [currentWeekStart, setCurrentWeekStart] = useState(
    getWeekStart(null, 1)
  );
  const [draggedWorkout, setDraggedWorkout] = useState(null);
  const [selectedWorkout, setSelectedWorkout] = useState("");
  const [timeOfDay, setTimeOfDay] = useState("anytime");
  const [dayDetailDate, setDayDetailDate] = useState(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [pendingSchedule, setPendingSchedule] = useState(null);
  const [showWorkoutSettings, setShowWorkoutSettings] = useState(false);
  const [workoutSettings, setWorkoutSettings] = useState({
    exercisesPerDay: null,
    includeCardio: false,
    skipDeload: false,
  });



  const { profile } = useProfile();
  const today = getTodayString(profile?.timezone);

  const { data: todayCheckIn } = useQuery({
    queryKey: ["dailyReadiness", today, user?.id],
    queryFn: async () => {
      const rows = await db.entities.DailyReadiness.filter({ created_by: user.id, checkin_date: today });
      return rows[0] || null;
    },
    enabled: !!user,
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: todaySchedule } = useQuery({
    queryKey: queryKeys.todaySchedule(today, user?.id),
    queryFn: () => db.entities.WorkoutSchedule.filter({
      scheduled_date: today,
      created_by: user.id,
    }),
    enabled: !!user,
    initialData: [],
  });

  const { data: todayFood } = useQuery({
    queryKey: queryKeys.todayFood(today, user?.id),
    queryFn: () => db.entities.FoodEntry.filter({ date: today, created_by: user.id }),
    enabled: !!user,
    initialData: [],
  });

  const { data: workouts } = useQuery({
    queryKey: queryKeys.workouts(user?.id),
    queryFn: () => db.entities.Workout.filter({ created_by: user.id }),
    enabled: !!user,
    initialData: [],
  });

  const weekStart = format(getWeekStart(profile?.timezone, 0), "yyyy-MM-dd");
  const weekEnd = format(getWeekEnd(profile?.timezone, 0), "yyyy-MM-dd");

  const weeklyGoal = profile?.days_per_week || 3;

  const { data: weeklyCardio = [] } = useQuery({
    queryKey: ['weeklyCardio', weekStart, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('garmin_activities')
        .select('distance_meters, moving_time_seconds:duration_seconds, calories')
        .eq('created_by', user.id)
        .gte('activity_date', weekStart)
        .lte('activity_date', weekEnd);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });
  const weeklyCardioMiles = weeklyCardio.reduce((s, c) => s + (c.distance_meters || 0) / 1609.34, 0);
  const weeklyCardioMinutes = Math.round(weeklyCardio.reduce((s, c) => s + (c.moving_time_seconds || 0) / 60, 0));
  const weeklyCardioCalories = Math.round(weeklyCardio.reduce((s, c) => s + (c.calories || 0), 0));

  const { data: allCardioSessions = [] } = useQuery({
    queryKey: ['allCardioSessions', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('garmin_activities')
        .select('start_date:activity_date, moving_time_seconds:duration_seconds, average_heartrate:avg_hr')
        .eq('created_by', user.id)
        .order('activity_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: weeklyLogsWithExercises = [] } = useQuery({
    queryKey: ["weeklyLogsExercises", weekStart, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_logs")
        .select("exercises, log_date, created_at")
        .eq("created_by", user.id)
        .gte("log_date", weekStart)
        .lte("log_date", weekEnd);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const weeklyCompleted = weeklyLogsWithExercises.length;
  const weeklyBodyData = getRecoveryHeatmapData(weeklyLogsWithExercises);

  const { enrollments } = useEnrollments();
  const activeEnrollment = enrollments.find((e) => e.status === "active");
  const { program: activeProgram } = useProgram(activeEnrollment?.program_id);
  const todayProgramWorkout = activeEnrollment && activeProgram
    ? getTodayProgramWorkout(activeEnrollment, activeProgram.workouts || [])
    : null;

  const markSessionDone = useMutation({
    mutationFn: async ({ sessionIndex }) => {
      if (!activeEnrollment || !todayProgramWorkout) return;
      const item = todayProgramWorkout;
      const existing = activeEnrollment.completed_workouts || [];
      const alreadyDone = existing.some(
        (cw) => cw && cw.cycle === item.cycle && cw.day_index === item.dayIndex && cw.session_index === sessionIndex
      );
      if (alreadyDone) return;

      const newEntry = {
        program_workout_id: item.programWorkoutId,
        cycle: item.cycle,
        day_index: item.dayIndex,
        session_index: sessionIndex,
        completed_at: new Date().toISOString(),
      };
      const updated = [...existing, newEntry];

      const completedCount = updated.filter(
        (cw) => cw && cw.cycle === item.cycle && cw.day_index === item.dayIndex && cw.session_index != null
      ).length;
      const allDone = completedCount >= item.cardio_sessions.length;

      if (allDone) {
        const wholeEntry = {
          program_workout_id: item.programWorkoutId,
          cycle: item.cycle,
          day_index: item.dayIndex,
          completed_at: new Date().toISOString(),
        };
        const final = [...updated, wholeEntry];
        const program = await db.entities.Program.get(activeEnrollment.program_id);
        const isV2 = program.schema_version === 2;
        let updateFields = { completed_workouts: final, updated_at: new Date().toISOString() };

        if (isV2) {
          const allWorkouts = await db.entities.ProgramWorkout.filter({ program_id: activeEnrollment.program_id });
          const sorted = allWorkouts.sort((a, b) => (a.day_index || 0) - (b.day_index || 0));
          let new_day = item.dayIndex + 1;
          let new_cycle = item.cycle;
          let status = 'active';
          if (new_day > sorted.length) { new_day = 1; new_cycle += 1; }
          if (new_cycle > (program.num_cycles || 1)) { new_cycle = program.num_cycles || 1; new_day = sorted.length; status = 'completed'; }
          updateFields = { ...updateFields, current_day_index: new_day, current_cycle: new_cycle, current_day: new_day, current_week: new_cycle, status };
        } else {
          let { current_day, current_week } = activeEnrollment;
          current_day = (current_day || 1) + 1;
          if (current_day > (program.days_per_week || 1)) { current_day = 1; current_week = (current_week || 1) + 1; }
          const status = current_week > (program.duration_weeks || 1) ? 'completed' : 'active';
          updateFields = { ...updateFields, current_day, current_week, status };
        }

        await db.entities.ProgramEnrollment.update(item.enrollmentId, updateFields);
      } else {
        await db.entities.ProgramEnrollment.update(item.enrollmentId, {
          completed_workouts: updated,
          updated_at: new Date().toISOString(),
        });
      }
    },
    onSuccess: () => {
      invalidatePrograms(queryClient);
      invalidateSchedule(queryClient);
      toast.success("Session marked complete!");
    },
    onError: () => toast.error("Failed to mark complete"),
  });

  const unmarkSession = useMutation({
    mutationFn: async ({ sessionIndex }) => {
      if (!activeEnrollment || !todayProgramWorkout) return;
      const item = todayProgramWorkout;
      const existing = activeEnrollment.completed_workouts || [];
      const wasFullyComplete = existing.some(
        (cw) => cw && typeof cw !== 'string' && cw.cycle === item.cycle && cw.day_index === item.dayIndex && cw.session_index == null && !cw.skipped
      );
      const updated = existing.filter((cw) => {
        if (typeof cw === 'string') return true;
        if (!cw || cw.cycle !== item.cycle || cw.day_index !== item.dayIndex) return true;
        if (cw.session_index === sessionIndex) return false;
        if (wasFullyComplete && cw.session_index == null) return false;
        return true;
      });
      const updateFields = { completed_workouts: updated, updated_at: new Date().toISOString() };
      if (wasFullyComplete) {
        Object.assign(updateFields, {
          current_day_index: item.dayIndex,
          current_cycle: item.cycle,
          current_day: item.dayIndex,
          current_week: item.cycle,
          status: 'active',
        });
      }
      await db.entities.ProgramEnrollment.update(item.enrollmentId, updateFields);
    },
    onSuccess: () => {
      invalidatePrograms(queryClient);
      invalidateSchedule(queryClient);
      toast.success("Session unmarked");
    },
    onError: () => toast.error("Failed to unmark"),
  });

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  const weekDates = weekDays.map((day) => format(day, "yyyy-MM-dd"));

  const { data: weekSchedule = [] } = useQuery({
    queryKey: [...queryKeys.schedule(user?.id), currentWeekStart.toISOString()],
    queryFn: async () => {
      const allSchedule = await db.entities.WorkoutSchedule.filter({ created_by: user.id });
      return allSchedule.filter((s) => weekDates.includes(s.scheduled_date));
    },
    enabled: !!user,
  });

  const programScheduleEntries = activeEnrollment && activeProgram
    ? getProgramSchedule(activeEnrollment, activeProgram.workouts || [])
    : [];

  const getProgramForDate = (date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return programScheduleEntries.filter((e) => e.date === dateStr);
  };

  const { allFoodEntries } = useAllFoodEntries();

  const getFoodForDate = (date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return allFoodEntries.filter((entry) => entry.date === dateStr);
  };

  const getMacrosForDate = (date) => calculateMacros(getFoodForDate(date));

  const getScheduleForDate = (date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return weekSchedule.filter((s) => s.scheduled_date === dateStr);
  };

  const scheduleWorkoutMutation = useMutation({
    mutationFn: async ({ workoutId, date, time }) => {
      return await db.entities.WorkoutSchedule.create({
        workout_id: workoutId,
        scheduled_date: date,
        time_of_day: time || "anytime",
        completed: false,
        created_by: user.id,
      });
    },
    onSuccess: () => {
      invalidateSchedule(queryClient);
      toast.success("Workout scheduled!");
      setDayDetailDate(null);
      setSelectedWorkout("");
      setTimeOfDay("anytime");
    },
  });

  const moveWorkoutMutation = useMutation({
    mutationFn: async ({ scheduleId, newDate }) => {
      return await db.entities.WorkoutSchedule.update(scheduleId, { scheduled_date: newDate });
    },
    onSuccess: () => { invalidateSchedule(queryClient); toast.success("Workout moved!"); },
  });

  const toggleCompleteMutation = useMutation({
    mutationFn: async ({ scheduleId, completed }) => {
      await db.entities.WorkoutSchedule.update(scheduleId, {
        completed,
        completed_at: completed ? new Date().toISOString() : null,
      });
    },
    onSuccess: () => invalidateSchedule(queryClient),
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: async (scheduleId) => await db.entities.WorkoutSchedule.delete(scheduleId),
    onSuccess: () => { invalidateSchedule(queryClient); toast.success("Workout removed"); },
  });

  const handleDragStart = (e, workout) => { setDraggedWorkout(workout); e.dataTransfer.effectAllowed = "move"; };
  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const handleDrop = (e, date) => {
    e.preventDefault();
    if (!draggedWorkout) return;
    const dateStr = format(date, "yyyy-MM-dd");
    if (draggedWorkout.isLibrary) {
      scheduleWorkoutMutation.mutate({ workoutId: draggedWorkout.id, date: dateStr });
    } else {
      moveWorkoutMutation.mutate({ scheduleId: draggedWorkout.scheduleId, newDate: dateStr });
    }
    setDraggedWorkout(null);
  };

  const handleGenerateAndSchedule = () => {
    try {
      let plan = queryClient.getQueryData(["workoutPlan"]);
      const settingsChanged =
        workoutSettings.exercisesPerDay !== (plan?.exercisesPerDay ?? null) ||
        workoutSettings.includeCardio !== (plan?.includeCardio ?? false) ||
        workoutSettings.skipDeload !== (plan?.skipDeload ?? false);

      if (!plan || settingsChanged) {
        if (!profile) { navigate("/workouts"); return; }
        const goalMapping = {
          weight_loss: "Weight Loss", muscle_gain: "Muscle Gain",
          endurance: "Build Endurance", general_fitness: "General Fitness",
          flexibility: "Improve Flexibility",
        };
        const goals = Array.isArray(profile.primary_goal)
          ? profile.primary_goal.map(g => goalMapping[g] || g)
          : goalMapping[profile.primary_goal] || "General Fitness";
      }
      navigate("/schedule");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to load workout plan");
    }
  };

  const handleApproveSchedule = async (approvedSchedule) => {
    try {
      if (false) {
        // tutorial path removed
        return;
      }
      for (const daySchedule of approvedSchedule) {
        const workout = await db.entities.Workout.create({
          title: `${daySchedule.focus} - ${daySchedule.dayName}`,
          description: `Generated workout focusing on ${daySchedule.focus.toLowerCase()}`,
          focus: "strength",
          duration_minutes: parseInt(daySchedule.duration) || 45,
          exercises: daySchedule.exercises.map((ex) => ({
            name: ex.name, sets: ex.sets || 3, reps: ex.reps || "10",
            rest_seconds: ex.rest || 60, notes: "", pattern: ex.pattern || "",
          })),
          created_by: user.id,
        });
        await db.entities.WorkoutSchedule.create({
          workout_id: workout.id, scheduled_date: daySchedule.date,
          time_of_day: "anytime", completed: false, created_by: user.id,
        });
      }
      invalidateSchedule(queryClient);
      invalidateWorkouts(queryClient);
      toast.success("Weekly schedule created!");
      setShowApprovalModal(false);
      setPendingSchedule(null);
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to create schedule");
    }
  };

  const navigateWeek = (direction) => {
    setCurrentWeekStart(direction === "next" ? addWeeks(currentWeekStart, 1) : subWeeks(currentWeekStart, 1));
  };

  const todayMacros = calculateMacros(todayFood);
  const todayWorkout = todaySchedule[0];
  const todayWorkoutDetails = todayWorkout && workouts.find((w) => w.id === todayWorkout.workout_id);

  // Exercises for today's workout (program or regular)
  const todayExercises = todayProgramWorkout?.exercises || todayWorkoutDetails?.exercises || [];

  const { data: todayBrief } = useQuery({
    queryKey: ["daily-brief", today, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_briefs")
        .select("brief_json")
        .eq("created_by", user.id)
        .eq("date", today)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
  });

  const { recoveryMetrics } = useRecoveryMetrics(30);

  const capacity = useMemo(() =>
    calculateTrainingCapacity(recoveryMetrics, profile, todayCheckIn),
    [recoveryMetrics, profile, todayCheckIn]
  );

  // Real readiness (replaces the previously hardcoded "88"). recoveryMetrics is
  // sorted descending by date, so [0] is the most recent row.
  const readinessScore = useMemo(
    () => calculateReadinessScore(recoveryMetrics?.[0], todayCheckIn),
    [recoveryMetrics, todayCheckIn]
  );
  const readinessCat = getReadinessCategory(readinessScore);

  // Engine's daily prescription — surfaces the MPC's own readiness/overreach
  // guardrail when the recovery pipeline has run.
  const { prescription } = useTodayPrescription(today);

  // Staleness signal — flags when wearable recovery data has stopped flowing
  // (the engine's recovery/overreach models go blind without it).
  const recoveryStaleDays = useMemo(() => {
    const latest = recoveryMetrics?.[0]?.date;
    if (!latest) return null;
    return Math.floor((new Date(today) - new Date(latest)) / 86400000);
  }, [recoveryMetrics, today]);

  // Days remaining to the goal event (BUD/S). Drives the countdown in the header.
  const daysToRace = useMemo(() => {
    const target = profile?.race_date || "2026-08-31";
    const d = Math.ceil((new Date(target) - new Date(today)) / 86400000);
    return d > 0 ? d : null;
  }, [profile, today]);

  const { data: workoutLogs = [], isLoading: logsLoading, isError: logsError } = useQuery({
    queryKey: queryKeys.workoutLogs(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('created_by', user.id)
        .order('log_date', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
  const { weightEntries } = useBodyWeightEntries();

  const addBodyWeightMutation = useMutation({
    mutationFn: async () => {
      if (!newBodyWeight || !bodyWeightDate) throw new Error("Weight and date are required");
      return await db.entities.BodyWeightEntry.create({
        weight: parseFloat(newBodyWeight), recorded_date: bodyWeightDate,
        notes: bodyWeightNotes, created_by: user.id,
      });
    },
    onSuccess: () => {
      invalidateBodyWeight(queryClient);
      toast.success("Weight entry added");
      setNewBodyWeight(""); setBodyWeightNotes("");
      setBodyWeightDate(format(new Date(), "yyyy-MM-dd"));
    },
    onError: () => toast.error("Failed to add weight entry"),
  });

  const weightUnit = profile?.weight_unit || "lbs";
  const totalWorkoutsCount = workoutLogs.length;
  const totalVolume = workoutLogs.reduce((sum, log) => sum + calculateVolume(log), 0);
  const avgDuration = workoutLogs.length > 0
    ? Math.round(workoutLogs.reduce((sum, log) => sum + (log.duration_seconds || 0), 0) / workoutLogs.length / 60)
    : 0;
  const sortedWeightEntries = [...weightEntries].sort((a, b) => new Date(b.recorded_date) - new Date(a.recorded_date));
  const currentBodyWeight = sortedWeightEntries[0]?.weight;
  const tdeeResult = getBestTDEE(profile, currentBodyWeight, weightEntries, allFoodEntries || [], recoveryMetrics);
  const startBodyWeight = sortedWeightEntries[sortedWeightEntries.length - 1]?.weight;
  const bodyWeightChange = currentBodyWeight && startBodyWeight ? currentBodyWeight - startBodyWeight : null;

  const handleAddBodyWeight = (e) => { e.preventDefault(); addBodyWeightMutation.mutate(); };

  // Derive the link URL for today's workout
  const todayWorkoutLink = todayProgramWorkout
    ? `/workout-detail?source=program&enrollmentId=${todayProgramWorkout.enrollmentId}&programWorkoutId=${todayProgramWorkout.programWorkoutId}`
    : todayWorkoutDetails
    ? `/workout-detail?id=${todayWorkoutDetails.id}`
    : null;

  const RUN_KEYWORDS = ["zone 2 run", "zone2 run", "400m sprint", "sprint", "run", "cardio"];
  const isRunEx = (ex) => RUN_KEYWORDS.some(k => ex.name?.toLowerCase().includes(k));

  // Best log for today = longest duration
  const todayLog = workoutLogs
    .filter(l => l.log_date === today)
    .sort((a, b) => (b.duration_seconds || 0) - (a.duration_seconds || 0))[0] || null;

  const isCompleted = todayProgramWorkout?.completed || todayWorkout?.completed;
  const workoutTitle = todayProgramWorkout?.title || todayWorkoutDetails?.title;
  const displayWorkoutTitle = (todayLog ? getWorkoutSplitTitle(todayLog.exercises) : null) || workoutTitle;
  const workoutDuration = todayWorkoutDetails?.duration_minutes;
  const todayProgramLifts = todayExercises.filter(ex => !isRunEx(ex));
  const todayProgramRuns = [
    ...(todayProgramWorkout?.exercises || []).filter(isRunEx),
    ...(todayProgramWorkout?.cardio_sessions || []),
  ];
  const exerciseCount = todayProgramLifts.length || todayWorkoutDetails?.exercises?.length || 0;

  const todayLogLifts = (todayLog?.exercises || []).filter(ex => !isRunEx(ex));

  if (!user) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="px-3 py-3 md:px-6 md:py-4 bg-[#09090e] min-h-screen relative">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserAvatar url={profile?.avatar_url} username={profile?.username} size="sm" className="border border-charcoal-border" />
            <div>
              <h1 className="text-lg font-bold text-white leading-none">Dashboard</h1>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-1">
                OptiGains Engine
                {daysToRace != null && (
                  <span className="text-brand ml-2">· {daysToRace}d to BUD/S</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
             <Link to="/weekly-schedule">
              <Button variant="ghost" size="sm" className="text-slate-400 text-xs gap-1.5 hover:text-brand h-8 border-charcoal-border">
                <Calendar className="w-3.5 h-3.5" /> Schedule
              </Button>
            </Link>
             <Link to="/athlete-state">
              <Button variant="ghost" size="sm" className="text-slate-400 text-xs gap-1.5 hover:text-brand h-8 border-charcoal-border">
                <Activity className="w-3.5 h-3.5" /> State
              </Button>
            </Link>
          </div>
        </div>

        {/* Recovery-data staleness banner */}
        {recoveryStaleDays != null && recoveryStaleDays >= 2 && (
          <div className="mb-4 flex items-center gap-2 rounded-xl glass px-4 py-2.5 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-slate-300">
              Recovery data is {recoveryStaleDays} days stale — your wearable sync may need attention.
            </span>
            <Link to="/profile" className="ml-auto text-brand font-semibold whitespace-nowrap">
              Check
            </Link>
          </div>
        )}

        {/* ── METABOLIC GRID (The Engine Room) ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-charcoal-border rounded-xl overflow-hidden border border-charcoal-border shadow-dark-card mb-4">
          
          {/* Expenditure Tile */}
          <div className="bg-charcoal-surface px-4 py-3 flex flex-col justify-between h-[90px]">
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-orange-400" /> Expenditure
              </p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-technical text-white leading-none">{tdeeResult?.tdee?.toLocaleString() || "—"}</span>
                <span className="text-[9px] text-brand font-medium uppercase">kcal/day</span>
              </div>
            </div>
            {tdeeResult?.method === 'adaptive' ? (
              <span className="text-[8px] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20 w-fit leading-none font-bold uppercase tracking-wider">Adaptive</span>
            ) : (
              <span className="text-[8px] text-slate-500 leading-none uppercase tracking-wider font-semibold">Estimated</span>
            )}
          </div>

          {/* Trend Weight Tile */}
          <div className="bg-charcoal-surface px-4 py-3 flex flex-col justify-between h-[90px]">
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-sky-400" /> Trend Weight
              </p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-technical text-white leading-none">{currentBodyWeight || "—"}</span>
                <span className="text-[9px] text-slate-400 font-medium uppercase">{weightUnit}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[9px] text-slate-500 leading-none">
              <span className={`font-technical font-bold ${bodyWeightChange > 0 ? "text-amber-500" : "text-emerald-400"}`}>
                {bodyWeightChange > 0 ? "+" : ""}{bodyWeightChange?.toFixed(1) || "0.0"}
              </span>
              <span className="uppercase tracking-wider font-semibold">this wk</span>
            </div>
          </div>

          {/* Readiness Tile */}
          <div className="bg-charcoal-surface px-4 py-3 flex flex-col justify-between h-[90px]">
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-brand" /> Readiness
              </p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-technical text-white leading-none">{readinessScore ?? "—"}</span>
                <span className={`text-[9px] font-medium uppercase ${readinessCat.color}`}>
                  {readinessScore == null ? "No data" : readinessCat.label}
                </span>
              </div>
            </div>
            <div className="flex gap-1 items-center h-2">
              {[0, 1, 2, 3].map((i) => {
                const filled = readinessScore != null && i < Math.round(readinessScore / 25);
                return (
                  <div
                    key={i}
                    className={`w-4 h-[3px] rounded-sm ${
                      filled
                        ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]"
                        : "bg-slate-800"
                    }`}
                  />
                );
              })}
            </div>
          </div>

          {/* Nutrition Snapshot */}
          <div className="bg-charcoal-surface px-4 py-3 flex flex-col justify-between h-[90px]">
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest flex items-center gap-1.5">
                <Apple className="w-3.5 h-3.5 text-emerald-400" /> Intake
              </p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-technical text-white leading-none">{Math.round(todayMacros.calories)}</span>
                <span className="text-[9px] text-slate-500 leading-none">/ {profile?.daily_calorie_goal} kcal</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="h-1 bg-slate-900 rounded-full overflow-hidden w-full">
                <div className="h-full bg-brand" style={{ width: `${Math.min(100, (todayMacros.calories / (profile?.daily_calorie_goal || 1)) * 100)}%` }} />
              </div>
              <div className="flex justify-between text-[9px] text-slate-400 font-technical leading-none">
                <span>P:<span className="text-sky-400">{Math.round(todayMacros.protein)}g</span></span>
                <span>C:<span className="text-amber-500">{Math.round(todayMacros.carbs)}g</span></span>
                <span>F:<span className="text-emerald-500">{Math.round(todayMacros.fats)}g</span></span>
              </div>
            </div>
          </div>
        </div>

        {/* Morning Check-in (if not done) */}
        {!todayCheckIn && (
          <div className="mb-4">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-brand" /> Daily Readiness Check-in
            </h2>
            <MorningCheckin today={today} existingCheckin={todayCheckIn} />
          </div>
        )}

        {/* ── MAIN WORKOUT CARD ── */}
        <div className="mb-4">
          {todayLog ? (
            <div className="rounded-2xl bg-charcoal-surface border border-emerald-500/20 overflow-hidden shadow-dark-card">
              <div className="p-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{displayWorkoutTitle || "Session Complete"}</h3>
                    <p className="text-xs text-emerald-400/70 font-bold uppercase tracking-widest">Training Done</p>
                  </div>
                </div>
                <Link to={todayWorkoutLink || "#"}>
                  <Button variant="ghost" size="sm" className="text-xs text-slate-400 border-charcoal-border hover:text-white">View Log</Button>
                </Link>
              </div>
            </div>
          ) : workoutTitle ? (
            <div className="rounded-2xl bg-gradient-to-br from-orange-500/10 to-pink-500/10 border border-orange-500/20 shadow-energy overflow-hidden backdrop-blur-sm relative group hover:border-orange-500/30 transition-all duration-300">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-orange-500 to-pink-500 rounded-full blur-3xl opacity-10 group-hover:opacity-20 transition-opacity duration-300 pointer-events-none" />
              <div className="p-5 relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-[10px] text-orange-400 font-bold uppercase tracking-widest mb-1">Today's Mission</p>
                    <h3 className="text-xl font-bold text-white leading-tight">{workoutTitle}</h3>
                    <p className="text-xs text-[#a0a0a0] mt-1">
                      {exerciseCount} lift{exerciseCount !== 1 ? "s" : ""}
                      {todayProgramRuns.length > 0 && ` · ${todayProgramRuns.length} conditioning`}
                      {workoutDuration ? ` · ~${workoutDuration} min` : ""}
                    </p>
                  </div>
                   <Dumbbell className="w-8 h-8 text-orange-500/30 group-hover:text-orange-500/50 transition-colors" />
                </div>
                <Link to={todayWorkoutLink}>
                  <Button variant="energy" className="w-full h-12 text-md font-bold rounded-xl shadow-lg">
                    Start Workout <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <Card className="p-6 text-center border-dashed border-charcoal-border">
              <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Rest Day</p>
              <p className="text-sm text-slate-400 mt-1">Focus on recovery and mobility</p>
            </Card>
          )}
        </div>

        {/* ── SECONDARY CONTENT (Tabs/Lists) ── */}
        <div className="space-y-4">
          {/* AI Insights */}
          <DailyBriefCard today={today} hideWhenEmpty={true} />

          {/* Adaptive engine guardrails (ACWR / interference / overreach) */}
          <EngineStatusCard today={today} />

          {/* Actions & Soreness */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TodayActions today={today} briefActions={todayBrief?.brief_json?.today_actions} />
            <SorenessCheckin today={today} />
          </div>

          {/* Heatmap & Training Load */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="md:col-span-2 shadow-dark-card border-charcoal-border">
              <CardHeader className="pb-0 pt-4 px-5">
                <CardTitle className="text-[11px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5" /> Training Load
                </CardTitle>
              </CardHeader>
              <div className="p-5">
                <TrainingLoadTab
                  cardioSessions={allCardioSessions}
                  workoutLogs={workoutLogs}
                  profile={profile}
                  banister={prescription?.banister_state}
                />
              </div>
            </Card>

            <Card className="shadow-dark-card border-charcoal-border overflow-hidden">
               <CardHeader className="pb-0 pt-4 px-5">
                <CardTitle className="text-[11px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                  <Target className="w-3.5 h-3.5" /> Muscle Fatigue
                </CardTitle>
              </CardHeader>
              <div className="p-4 flex justify-center">
                 <MuscleHeatMap data={weeklyBodyData} view="anterior" className="h-[200px]" />
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
