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
} from "lucide-react";
import { format, addDays, addWeeks, subWeeks } from "date-fns";
import { getTodayString, getWeekStart, getWeekEnd } from "@/utils/dateUtils";
import { toast } from "sonner";
import { calculateVolume } from "@/utils/exerciseStats";
import { calculateTrainingCapacity } from "@/utils/recoveryUtils";
import TrainingLoadTab from "@/components/dashboard/TrainingLoadTab";
import MorningCheckin from "@/components/dashboard/MorningCheckin";
import ReadinessRing from "@/components/dashboard/ReadinessRing";
import DailyBriefCard from "@/components/dashboard/DailyBriefCard";
import TodayActions from "@/components/dashboard/TodayActions";
import QuickCapture from "@/components/QuickCapture";


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
        .from('cardio_sessions')
        .select('distance_meters, moving_time_seconds, calories')
        .eq('created_by', user.id)
        .gte('start_date', weekStart + 'T00:00:00')
        .lte('start_date', weekEnd + 'T23:59:59');
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!profile?.strava_access_token,
  });
  const weeklyCardioMiles = weeklyCardio.reduce((s, c) => s + (c.distance_meters || 0) / 1609.34, 0);
  const weeklyCardioMinutes = Math.round(weeklyCardio.reduce((s, c) => s + (c.moving_time_seconds || 0) / 60, 0));
  const weeklyCardioCalories = Math.round(weeklyCardio.reduce((s, c) => s + (c.calories || 0), 0));

  const { data: allCardioSessions = [] } = useQuery({
    queryKey: ['allCardioSessions', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cardio_sessions')
        .select('start_date, moving_time_seconds, average_heartrate')
        .eq('created_by', user.id)
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!profile?.strava_access_token,
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
          type: "strength",
          duration_minutes: parseInt(daySchedule.duration) || 45,
          exercises: daySchedule.exercises.map((ex) => ({
            name: ex.name, sets: ex.sets || 3, reps: ex.reps || "10",
            rest_seconds: ex.rest || 60, notes: "", pattern: ex.pattern || "",
          })),
          equipment_needed: [], is_custom: true, target_goals: [], created_by: user.id,
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

  const isCompleted = todayProgramWorkout?.completed || todayWorkout?.completed;
  const workoutTitle = todayProgramWorkout?.title || todayWorkoutDetails?.title;
  const workoutDuration = todayWorkoutDetails?.duration_minutes;
  const exerciseCount = todayExercises.length || todayWorkoutDetails?.exercises?.length || 0;

  if (!user) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="px-3 py-4 md:px-6 md:py-8 bg-[#121212] min-h-screen relative">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-[22px] font-bold text-white leading-tight">OptiGainsOS</h1>
            <p className="text-[13px] text-[#a0a0a0] mt-0.5">Training status as of today</p>
          </div>
        </div>

        {/* First-workout welcome banner — shown until user logs a workout or dismisses */}
        {welcomeBannerVisible && !logsLoading && !logsError && workoutLogs.length === 0 && (
          <div className="mb-6 flex items-center justify-between gap-4 rounded-xl bg-brand/[5%] border border-brand/[15%] px-5 py-4">
            <div>
              <p className="font-semibold text-white">Ready to log your first workout?</p>
              <p className="text-sm text-[#a0a0a0] mt-0.5">Head to the Schedule to pick a workout and get started.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link to="/schedule">
                <Button variant="volt" size="sm">Go to Schedule</Button>
              </Link>
              <button
                onClick={() => { localStorage.setItem('optigains_welcome_dismissed', '1'); setWelcomeBannerVisible(false); }}
                className="text-[#555555] hover:text-[#a0a0a0] text-lg leading-none px-1 transition-colors"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* ── Morning Check-in & Readiness ── */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="md:col-span-3">
            <MorningCheckin
              today={today}
              existingCheckin={todayCheckIn}
            />
          </div>
          <div className="md:col-span-1">
            <ReadinessRing
              recoveryMetrics={recoveryMetrics}
              todayCheckin={todayCheckIn}
            />
          </div>
        </div>

        {/* ── Today's Capacity Recommendation ── */}
        {capacity && (
          <div className="mb-6 p-4 rounded-xl bg-brand/[8%] border border-brand/20 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-full bg-brand/20">
                <Zap className="w-5 h-5 text-brand" />
              </div>
              <div>
                <p className="text-[10px] text-brand font-bold uppercase tracking-widest">Recovery Status</p>
                <h2 className="text-lg font-bold text-white leading-tight">
                  {workoutTitle ? (
                    <>
                      {capacity.minutes >= (workoutDuration || capacity.minutes)
                        ? <>Run <span className="text-brand">{workoutTitle}</span> as written</>
                        : <>Shorten <span className="text-brand">{workoutTitle}</span> to <span className="text-brand">{capacity.minutes} min</span></>
                      }
                    </>
                  ) : (
                    <>Cap today at <span className="text-brand">{capacity.minutes} min</span></>
                  )}
                </h2>
                {capacity.rationale !== "Full capacity recommended" && (
                  <p className="text-xs text-[#a0a0a0] mt-0.5">{capacity.rationale}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {[
                { label: "HRV", value: capacity.hvr_factor != null ? (capacity.hvr_factor >= 1 ? "↑ Good" : "↓ Low") : null, ok: capacity.hvr_factor >= 1 },
                { label: "Load", value: capacity.load_factor != null ? (capacity.load_factor >= 1 ? "↑ Fresh" : "↓ Fatigued") : null, ok: capacity.load_factor >= 1 },
                { label: "Feel", value: todayCheckIn ? `${todayCheckIn.energy}/10` : null, ok: (todayCheckIn?.energy || 5) >= 6 },
              ].filter(s => s.value).map(s => (
                <div key={s.label} className="text-center">
                  <p className="text-[10px] text-[#555555] uppercase tracking-widest">{s.label}</p>
                  <p className={`text-xs font-bold ${s.ok ? "text-brand" : "text-yellow-400"}`}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── AI Daily Brief ── */}
        <DailyBriefCard today={today} />

        {/* ── Today's Actions ── */}
        <TodayActions today={today} briefActions={todayBrief?.brief_json?.today_actions} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* ── Today's Workout Card ── */}
          <div
            className="rounded-xl bg-[#1a1a1a] text-white overflow-hidden relative border-l-4 border-brand"
            data-tutorial="start-workout-btn"
          >
            <div className="px-5 pt-4 pb-1">
              <div className="flex items-center gap-2 mb-3">
                <Dumbbell className="w-4 h-4" />
                <span className="text-sm font-semibold text-white/90">Today's Workout</span>
              </div>

              {workoutTitle ? (
                <>
                  {todayProgramWorkout && (
                    <Badge className="bg-[#1a1a1a]/20 text-white border-none text-xs mb-1.5">
                      {todayProgramWorkout.programName}
                    </Badge>
                  )}
                  <h3 className="text-lg font-bold text-white mb-1 leading-snug">{workoutTitle}</h3>
                  <div className="flex items-center gap-3 text-xs text-white/75 mb-2">
                    {workoutDuration && (
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{workoutDuration} min</span>
                    )}
                    {todayProgramWorkout && (
                      <span>Cycle {todayProgramWorkout.cycle}, Day {todayProgramWorkout.dayIndex}</span>
                    )}
                    <span className="flex items-center gap-1"><Target className="w-3 h-3" />{exerciseCount} exercises</span>
                  </div>

                  {isCompleted ? (
                    <div className="flex gap-2 mt-1">
                      {todayWorkoutLink && (
                        <Link to={todayWorkoutLink} className="flex-1">
                          <Button variant="ghost" size="sm" className="w-full text-sm bg-[#1a1a1a]/20 text-white hover:bg-[#1a1a1a]/30">
                            <Circle className="w-3.5 h-3.5 mr-1 fill-green-400 text-green-400" />Completed — View
                          </Button>
                        </Link>
                      )}
                    </div>
                  ) : (
                    <div className="flex gap-2 mt-1">
                      {todayWorkoutLink && (
                        <Link to={todayWorkoutLink} className="flex-1">
                          <Button variant="volt" size="sm" className="w-full" data-tutorial="start-workout-btn">
                            Start Workout <ArrowRight className="w-3.5 h-3.5 ml-1" />
                          </Button>
                        </Link>
                      )}
                      {todayExercises.length > 0 && (
                        <Button variant="ghost" size="sm" className="bg-[#1a1a1a]/20 text-white hover:bg-[#1a1a1a]/30 text-xs px-3" onClick={() => setShowTodayExercises((v) => !v)}>
                          {showTodayExercises ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          <span className="ml-1">More</span>
                        </Button>
                      )}
                    </div>
                  )}
                </>
              ) : activeEnrollment ? (
                <div className="text-center py-3">
                  <Dumbbell className="w-7 h-7 mx-auto mb-1.5 opacity-50" />
                  <p className="text-sm text-white/80 mb-0.5">Rest day</p>
                  <p className="text-xs text-white/60">
                    Next: {activeEnrollment.program?.name} — Cycle {activeEnrollment.current_cycle || 1}, Day {activeEnrollment.current_day_index || 1}
                  </p>
                </div>
              ) : (
                <div className="text-center py-3">
                  <Calendar className="w-7 h-7 mx-auto mb-1.5 text-white/60" />
                  <p className="text-sm text-white/90 mb-2">No workout scheduled</p>
                  <Link to="/schedule">
                    <Button variant="primary">
                      Schedule a Workout
                    </Button>
                  </Link>
                </div>
              )}
            </div>

            {/* Expandable exercise list */}
            {showTodayExercises && todayExercises.length > 0 && (
              <div className="mt-2 border-t border-white/20 px-5 py-3">
                <p className="text-xs font-semibold text-white/70 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <ListChecks className="w-3 h-3" /> Exercises
                </p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {todayExercises.map((ex, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-[#1a1a1a]/10 rounded-lg px-3 py-1.5">
                      <span className="font-medium text-white truncate mr-2">{ex.name}</span>
                      <span className="text-white/60 shrink-0">
                        {ex.sets}×{ex.reps}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pb-4" />
          </div>

          {/* ── This Week + Muscles Trained ── */}
          <Card className="md:col-span-2 flex flex-col">
            <CardHeader className="pb-0 pt-4 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                  <Brain className="w-4 h-4 text-brand" />
                  This Week
                </CardTitle>
                <div className="flex rounded-full overflow-hidden border border-[#333] text-[10px] font-bold uppercase tracking-wider">
                  <button
                    onClick={() => setMuscleView("anterior")}
                    className={`px-3 py-1 transition-colors ${muscleView === "anterior" ? "bg-brand text-black" : "bg-[#222] text-[#a0a0a0]"}`}
                  >Front</button>
                  <button
                    onClick={() => setMuscleView("posterior")}
                    className={`px-3 py-1 transition-colors ${muscleView === "posterior" ? "bg-brand text-black" : "bg-[#222] text-[#a0a0a0]"}`}
                  >Back</button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-3 pb-4 flex flex-col sm:flex-row gap-4 flex-1 min-h-0 px-5">
              <div className="flex-1 space-y-3 min-w-0">
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-[#a0a0a0]">Workouts</span>
                      <span className="font-semibold text-white">{weeklyCompleted}/{weeklyGoal}</span>
                    </div>
                    <div className="h-1 bg-[#333] rounded-full overflow-hidden">
                      <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${Math.min(100, (weeklyCompleted / weeklyGoal) * 100)}%` }} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-[#2a2a2a]">
                    <span className="text-[#a0a0a0]">Body Weight</span>
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-white">{currentBodyWeight || "—"}{currentBodyWeight ? ` ${weightUnit}` : ""}</span>
                      {bodyWeightChange !== undefined && bodyWeightChange !== null && bodyWeightChange !== 0 && (
                        <span className={`text-[10px] ${bodyWeightChange > 0 ? "text-[#fbbf24]" : "text-[#4ade80]"}`}>
                          {bodyWeightChange > 0 ? "+" : ""}{bodyWeightChange.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Cardio this week */}
                  {profile?.strava_access_token && weeklyCardio.length > 0 && (
                    <div className="pt-1 border-t border-[#2a2a2a]">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-[#a0a0a0] flex items-center gap-1.5">
                          <Activity className="w-3 h-3" />
                          Cardio
                        </span>
                        <span className="font-semibold text-white">{weeklyCardio.length} sessions</span>
                      </div>
                    </div>
                  )}
                </div>

              <div className="sm:w-[120px] shrink-0 flex flex-col items-center border-l border-[#2a2a2a] pl-4">
                {weeklyBodyData.length > 0 ? (
                  <MuscleHeatMap data={weeklyBodyData} view={muscleView} className="flex-1" />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <Dumbbell className="w-6 h-6 text-[#333] mb-1" />
                    <p className="text-[10px] text-[#555555]">No data</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Nutrition & Capture ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Nutrition */}
          <Card className="border border-[#2a2a2a]">
            <CardHeader className="pb-2 pt-4 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                  <Apple className="w-4 h-4 text-[#4ade80]" />
                  Nutrition
                </CardTitle>
                {tdeeResult?.tdee && (
                  <div className="flex flex-col items-end gap-0.5">
                    <div className="flex items-center gap-1 text-[11px]">
                      <Flame className="w-3 h-3 text-brand" />
                      <span className="text-[#555555]">TDEE:</span>
                      <span className="font-semibold text-[#a0a0a0]">{tdeeResult.tdee.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="py-3 px-5">
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Cal", value: todayMacros.calories, goal: profile?.daily_calorie_goal || 0, stroke: "var(--color-brand)" },
                  { label: "Pro", value: todayMacros.protein, goal: profile?.daily_protein_goal || 0, stroke: "#60a5fa" },
                  { label: "Carb", value: todayMacros.carbs, goal: profile?.daily_carbs_goal || 0, stroke: "#fbbf24" },
                  { label: "Fat", value: todayMacros.fats, goal: profile?.daily_fats_goal || 0, stroke: "#f87171" },
                ].map(({ label, value, goal, stroke }) => {
                  const safeValue = value ?? 0;
                  const safeGoal = goal ?? 0;
                  const pct = safeGoal > 0 ? Math.min(1, safeValue / safeGoal) : 0;
                  const r = 24; const circ = 2 * Math.PI * r; const offset = circ * (1 - pct);
                  return (
                    <div key={label} className="flex flex-col items-center">
                      <div className="relative w-12 h-12">
                        <svg viewBox="0 0 60 60" className="w-full h-full -rotate-90">
                          <circle cx="30" cy="30" r={r} fill="none" stroke="#2a2a2a" strokeWidth="4" />
                          <circle cx="30" cy="30" r={r} fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} className="transition-all duration-700" />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-[10px] font-bold text-white">{Math.round(safeValue)}</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-medium text-[#555555] mt-1">{label}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Quick Capture */}
          <section>
            <QuickCapture domain="general" placeholder="Stream a note to Second Brain..." />
          </section>
        </div>

        {/* ── Training Load Chart ── */}
        <Card className="bg-[#1a1a1a] border-[#2a2a2a] mb-6">
          <CardHeader className="pb-0 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-brand" />
              Training Load
            </CardTitle>
          </CardHeader>
          <div className="p-5">
            <TrainingLoadTab
              cardioSessions={allCardioSessions}
              workoutLogs={workoutLogs}
              profile={profile}
              hasStrava={!!profile?.strava_access_token}
            />
          </div>
        </Card>

        {/* Stat strip + quick weight log */}
        <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-[#1a1a1a] rounded-xl border border-[#2a2a2a]">
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4 w-full">
            {[
              { label: "Workouts", value: totalWorkoutsCount, unit: "" },
              { label: "Volume", value: totalVolume > 0 ? `${(totalVolume / 1000).toFixed(1)}k` : "—", unit: "lbs" },
              { label: "Avg Duration", value: avgDuration || "—", unit: "min" },
              { label: "Weight", value: currentBodyWeight || "—", unit: weightUnit },
            ].map(({ label, value, unit }) => (
              <div key={label}>
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#555555] mb-0.5">{label}</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold text-white tabular-nums">{value}</span>
                  <span className="text-[10px] text-[#a0a0a0]">{unit}</span>
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={handleAddBodyWeight} className="flex gap-2 w-full sm:w-auto">
            <Input type="number" step="0.1" value={newBodyWeight} onChange={(e) => setNewBodyWeight(e.target.value)} placeholder={`Weight`} className="h-9 text-sm w-full sm:w-24" required />
            <Button type="submit" variant="volt" size="sm" className="h-9 px-4 shrink-0" disabled={addBodyWeightMutation.isPending}>
              <Scale className="w-4 h-4 mr-2" /> Log
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
