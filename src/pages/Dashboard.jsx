import { useEffect, useState } from "react";
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
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { queryKeys, invalidateBodyWeight, invalidateSchedule, invalidateWorkouts, invalidatePrograms } from "@/lib/queryKeys";
import { useProfile, useAllFoodEntries } from "@/hooks/useUserQueries";
import { useDietPhase } from "@/hooks/useDietPhase";
import { useEnrollments, useProgram } from "@/hooks/useProgramQueries";
import { useTutorial } from "@/hooks/useTutorial";
import { getTodayProgramWorkout, getProgramSchedule } from "@/utils/programSchedule";
import { generatePersonalizedWorkout } from "@/ml/mlRecommender";
import { computeWeekNumber } from "@/ml/workoutModel";
import { getRecoveryHeatmapData } from "@/utils/muscleVolumeUtils";
import MuscleHeatMap from "@/components/MuscleHeatMap";
import {
  Dumbbell,
  Calendar,
  Calendar as CalendarIcon,
  TrendingUp,
  Target,
  Circle,
  Clock,
  ArrowRight,
  Apple,
  Scale,
  X,
  Flame,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Undo2,
  Redo2,
  BookOpen,
  BarChart3,
  Brain,
  ChevronDown,
  ChevronUp,
  Zap,
  ListChecks,
  Eye,
  MoreVertical,
  Activity,
  CheckCircle2,
  Trophy,
} from "lucide-react";
import { format, addDays, isSameDay, isBefore, addWeeks, subWeeks } from "date-fns";
import { getTodayString, getWeekStart, getWeekEnd } from "@/utils/dateUtils";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/ui/UserAvatar";
import WorkoutApprovalModal from "@/components/workouts/WorkoutApprovalModal";
import { useBodyWeightEntries } from "@/hooks/useUserQueries";
import { invalidateWorkoutLogs } from "@/lib/queryKeys";
import { getUniqueExercises, getExerciseHistory, calculateVolume, getAllPersonalRecords } from "@/utils/exerciseStats";
import ExerciseProgressChart from "@/components/progress/ExerciseProgressChart";
import WeightProgressChart from "@/components/progress/WeightProgressChart";
import NutritionCoach from "@/components/nutrition/NutritionCoach";
import TrainingLoadTab from "@/components/dashboard/TrainingLoadTab";
import { parseISO } from "date-fns";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import MedicalDisclaimer from "@/components/MedicalDisclaimer";


export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultAnalyticsTab = searchParams.get("tab") || "history";
  const [activeAnalyticsTab, setActiveAnalyticsTab] = useState(defaultAnalyticsTab);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { activePhase } = useDietPhase();
  const { startTutorial, nextStep, isActive: tutorialActive, currentStepData, setTutorialWorkouts } = useTutorial();

  // Progress state
  const [selectedExercise, setSelectedExercise] = useState("");
  const [expandedLogs, setExpandedLogs] = useState(new Set());
  const [exerciseFilter, setExerciseFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [newBodyWeight, setNewBodyWeight] = useState("");
  const [bodyWeightDate, setBodyWeightDate] = useState(() => getTodayString(null));
  const [bodyWeightNotes, setBodyWeightNotes] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [welcomeBannerVisible, setWelcomeBannerVisible] = useState(
    () => !localStorage.getItem('sisyphus_welcome_dismissed')
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

  const { data: hasProfile, isLoading: checkingProfile } = useQuery({
    queryKey: queryKeys.hasProfile(user?.id),
    queryFn: async () => {
      const profiles = await db.entities.UserProfile.filter({ created_by: user.id });
      return profiles.length > 0;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!checkingProfile && user && hasProfile === false) {
      navigate("/onboarding");
    }
  }, [user, hasProfile, navigate, checkingProfile]);

  const { profile } = useProfile();
  const today = getTodayString(profile?.timezone);

  // Daily check-in state
  const [checkInSleep, setCheckInSleep] = useState(3);
  const [checkInSoreness, setCheckInSoreness] = useState(3);
  const [checkInStress, setCheckInStress] = useState(3);

  const { data: todayCheckIn } = useQuery({
    queryKey: ["dailyReadiness", today, user?.id],
    queryFn: async () => {
      const rows = await db.entities.DailyReadiness.filter({ created_by: user.id, checkin_date: today });
      return rows[0] || null;
    },
    enabled: !!user,
  });

  const checkInMutation = useMutation({
    mutationFn: async () => {
      if (todayCheckIn) {
        return db.entities.DailyReadiness.update(todayCheckIn.id, {
          sleep_score: checkInSleep, soreness_score: checkInSoreness, stress_score: checkInStress,
        });
      }
      return db.entities.DailyReadiness.create({
        created_by: user.id, checkin_date: today,
        sleep_score: checkInSleep, soreness_score: checkInSoreness, stress_score: checkInStress,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dailyReadiness", today, user?.id] }),
    onError: () => toast.error("Failed to save check-in"),
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

  const { data: weeklyLogs = [] } = useQuery({
    queryKey: queryKeys.weeklyWorkoutLogs(weekStart, user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_logs")
        .select("id")
        .eq("created_by", user.id)
        .gte("log_date", weekStart)
        .lte("log_date", weekEnd);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const weeklyCompleted = weeklyLogs.length;
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
        .select("exercises, log_date, completed_at")
        .eq("created_by", user.id)
        .gte("log_date", weekStart)
        .lte("log_date", weekEnd);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

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
        if (!profile) { toast.error("No workout plan found. Complete onboarding first."); navigate("/workouts"); return; }
        const goalMapping = {
          weight_loss: "Weight Loss", muscle_gain: "Muscle Gain",
          endurance: "Build Endurance", general_fitness: "General Fitness",
          flexibility: "Improve Flexibility",
        };
        const goals = Array.isArray(profile.primary_goal)
          ? profile.primary_goal.map(g => goalMapping[g] || g)
          : goalMapping[profile.primary_goal] || "General Fitness";
        plan = generatePersonalizedWorkout({
          userProfile: {
            goal: goals,
            level: profile.fitness_level || "intermediate",
            equipment: profile.available_equipment || [],
            daysPerWeek: profile.days_per_week || 3,
            duration: profile.workout_duration_preference || "45 min",
          },
          daysPerWeek: profile.days_per_week || 3,
          weekNumber: computeWeekNumber(profile.created_at),
        });
        queryClient.setQueryData(["workoutPlan"], plan);
      }
      if (!plan) { toast.error("No workout plan found. Generate workouts first."); navigate("/workouts"); return; }

      const scheduleSuggestion = plan.week.map((day, index) => ({
        date: format(addDays(currentWeekStart, index), "yyyy-MM-dd"),
        dayName: format(addDays(currentWeekStart, index), "EEEE"),
        focus: day.focus, duration: day.duration,
        exercises: day.exercises, dayIndex: day.dayIndex,
      }));
      setPendingSchedule({ plan, schedule: scheduleSuggestion });
      setShowApprovalModal(true);
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to load workout plan");
    }
  };

  const handleApproveSchedule = async (approvedSchedule) => {
    try {
      if (tutorialActive) {
        setTutorialWorkouts(approvedSchedule);
        toast.success("Weekly schedule created!");
        setShowApprovalModal(false);
        setPendingSchedule(null);
        return;
      }
      for (const daySchedule of approvedSchedule) {
        const workout = await db.entities.Workout.create({
          title: `${daySchedule.focus} - ${daySchedule.dayName}`,
          description: `Generated workout focusing on ${daySchedule.focus.toLowerCase()}`,
          type: "strength", difficulty: "intermediate",
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

  const deleteLogMutation = useMutation({
    mutationFn: async (logId) => { await db.entities.WorkoutLog.delete(logId); },
    onSuccess: () => { invalidateWorkoutLogs(queryClient); toast.success("Workout log deleted"); },
    onError: () => toast.error("Failed to delete workout log"),
  });

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

  const deleteBodyWeightMutation = useMutation({
    mutationFn: async (entryId) => { await db.entities.BodyWeightEntry.delete(entryId); },
    onSuccess: () => { invalidateBodyWeight(queryClient); toast.success("Weight entry deleted"); },
    onError: () => toast.error("Failed to delete weight entry"),
  });

  const weightUnit = profile?.weight_unit || "lbs";
  const uniqueExercises = getUniqueExercises(workoutLogs);
  const exerciseHistory = selectedExercise ? getExerciseHistory(workoutLogs, selectedExercise) : [];
  const allPRs = getAllPersonalRecords(workoutLogs);
  const totalWorkoutsCount = workoutLogs.length;
  const totalVolume = workoutLogs.reduce((sum, log) => sum + calculateVolume(log), 0);
  const avgDuration = workoutLogs.length > 0
    ? Math.round(workoutLogs.reduce((sum, log) => sum + (log.duration_seconds || 0), 0) / workoutLogs.length / 60)
    : 0;
  const sortedWeightEntries = [...weightEntries].sort((a, b) => new Date(b.recorded_date) - new Date(a.recorded_date));
  const currentBodyWeight = sortedWeightEntries[0]?.weight;
  const tdeeResult = getBestTDEE(profile, currentBodyWeight, weightEntries, allFoodEntries || []);
  const startBodyWeight = sortedWeightEntries[sortedWeightEntries.length - 1]?.weight;
  const bodyWeightChange = currentBodyWeight && startBodyWeight ? currentBodyWeight - startBodyWeight : null;
  const enrichedLogs = workoutLogs.map((log) => {
    const workout = workouts.find((w) => w.id === log.workout_id);
    return { ...log, workoutTitle: workout?.title || "Unknown Workout", workoutType: workout?.type || "unknown" };
  });
  const filteredLogs = enrichedLogs.filter((log) => {
    if (typeFilter !== "all" && log.workoutType !== typeFilter) return false;
    if (exerciseFilter && !log.exercises?.some((ex) => ex.name.toLowerCase().includes(exerciseFilter.toLowerCase()))) return false;
    return true;
  });

  useEffect(() => {
    if (!selectedExercise && uniqueExercises.length > 0) setSelectedExercise(uniqueExercises[0]);
  }, [uniqueExercises, selectedExercise]);

  const toggleExpanded = (logId) => {
    setExpandedLogs((prev) => { const s = new Set(prev); s.has(logId) ? s.delete(logId) : s.add(logId); return s; });
  };
  const handleDeleteLog = (logId) => setDeleteTarget({ type: "log", id: logId });
  const handleDeleteBodyWeight = (entryId) => setDeleteTarget({ type: "weight", id: entryId });
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

  if (!user || checkingProfile) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="p-4 md:p-6 bg-[#121212] min-h-screen relative">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-[22px] font-bold text-white leading-tight">Welcome to VEKTOR</h1>
            <p className="text-[13px] text-[#a0a0a0] mt-0.5">Let's crush your fitness goals today</p>
          </div>
        </div>

        {/* First-workout welcome banner — shown until user logs a workout or dismisses */}
        {welcomeBannerVisible && !logsLoading && !logsError && workoutLogs.length === 0 && (
          <div className="mb-6 flex items-center justify-between gap-4 rounded-xl bg-[rgba(204,255,0,0.05)] border border-[rgba(204,255,0,0.15)] px-5 py-4">
            <div>
              <p className="font-semibold text-white">Ready to log your first workout?</p>
              <p className="text-sm text-[#a0a0a0] mt-0.5">Head to the Schedule to pick a workout and get started.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link to="/schedule">
                <Button variant="volt" size="sm">Go to Schedule</Button>
              </Link>
              <button
                onClick={() => { localStorage.setItem('sisyphus_welcome_dismissed', '1'); setWelcomeBannerVisible(false); }}
                className="text-[#555555] hover:text-[#a0a0a0] text-lg leading-none px-1 transition-colors"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8" data-tutorial="dashboard-overview">
          {/* ── Today's Workout Card ── */}
          <div
            className="rounded-xl bg-[#1a1a1a] text-white overflow-hidden relative border-l-4 border-[#ccff00]"
            data-tutorial="start-workout-btn"
          >
            <div className="px-5 pt-4 pb-1">
              <div className="flex items-center gap-2 mb-3">
                <Dumbbell className="w-4 h-4" />
                <span className="text-sm font-semibold text-white/90">Today's Workout</span>
              </div>

              {/* Tutorial demo */}
              {tutorialActive && currentStepData?.id === "start-workout" ? (
                <div className="text-center py-2">
                  <Badge className="bg-[#1a1a1a]/20 text-white border-none text-xs mb-2">Demo Program</Badge>
                  <h3 className="text-lg font-bold text-white mb-1">Upper Body Strength</h3>
                  <div className="flex items-center justify-center gap-3 text-xs text-white/80 mb-3">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />45 min</span>
                    <span className="flex items-center gap-1"><Target className="w-3 h-3" />1 exercise</span>
                  </div>
                  <Link to="/workout-detail?tutorial=demo">
                    <Button variant="ghost" className="bg-[#ccff00] text-black hover:bg-[#ccff00] text-sm font-bold" size="sm" onClick={() => nextStep()} data-tutorial="start-workout-btn">
                      Start Workout <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              ) : workoutTitle ? (
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
                  ) : todayCheckIn ? (
                    /* ── Already checked in: show start button ── */
                    <div className="flex gap-2 mt-1">
                      {todayWorkoutLink && (
                        <Link to={todayWorkoutLink} className="flex-1" onClick={() => tutorialActive && nextStep()}>
                          <Button variant="ghost" size="sm" className="w-full text-sm bg-[#ccff00] text-black hover:bg-[#ccff00] font-bold" data-tutorial="start-workout-btn">
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
                  ) : (
                    /* ── Check-in flow ── */
                    <>
                      <div className="border-t border-white/20 mt-1 mb-3" />
                      <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-2.5">Check In</p>
                      {[
                        { label: "Sleep", value: checkInSleep, set: setCheckInSleep },
                        { label: "Soreness", value: checkInSoreness, set: setCheckInSoreness },
                        { label: "Stress", value: checkInStress, set: setCheckInStress },
                      ].map(({ label, value, set }) => (
                        <div key={label} className="flex items-center justify-between mb-2">
                          <span className="text-xs text-white/70 w-14 shrink-0">{label}</span>
                          <div className="flex gap-1.5">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <button
                                key={n}
                                type="button"
                                onClick={() => set(n)}
                                className={`w-6 h-6 rounded-full text-xs font-bold transition-all ${
                                  value === n
                                    ? "bg-[#ccff00] text-black scale-110"
                                    : value > n
                                    ? "bg-[#1a1a1a]/40 text-white"
                                    : "bg-[#1a1a1a]/15 text-white/50 hover:bg-[#1a1a1a]/25"
                                }`}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center gap-2 mt-3">
                        <Button
                          variant="volt"
                          size="sm"
                          className="flex-1 text-sm font-bold"
                          disabled={checkInMutation.isPending}
                          onClick={() => checkInMutation.mutate()}
                        >
                          {checkInMutation.isPending ? "Saving…" : <>Check In <ArrowRight className="w-3.5 h-3.5 ml-1" /></>}
                        </Button>
                        {todayWorkoutLink && (
                          <Link to={todayWorkoutLink}>
                            <Button variant="ghost" size="sm" className="bg-[#1a1a1a]/15 text-white/70 hover:bg-[#1a1a1a]/25 text-xs px-3">
                              Skip
                            </Button>
                          </Link>
                        )}
                      </div>
                    </>
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
                    <Button variant="primary" size="sm">
                      Schedule a Workout
                    </Button>
                  </Link>
                </div>
              )}
            </div>

            {/* Cardio workouts for today's program day */}
            {todayProgramWorkout?.cardio_sessions?.length > 0 && (
              <div className="mt-2 border-t border-white/20 px-5 py-3">
                <p className="text-xs font-semibold text-white/70 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Activity className="w-3 h-3" /> Cardio
                </p>
                <div className="space-y-1.5">
                  {todayProgramWorkout.cardio_sessions.map((c, i) => {
                    const sessionDone = todayProgramWorkout.completed || todayProgramWorkout.completedSessions?.has(i);
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs bg-[#1a1a1a]/10 rounded-lg px-3 py-1.5">
                        <span className="font-medium text-white flex-1 truncate">{c.title}</span>
                        <span className="text-white/60 shrink-0">{c.duration_minutes} min{c.time_of_day !== "anytime" ? ` · ${c.time_of_day.toUpperCase()}` : ""}</span>
                        {sessionDone ? (
                          <button
                            className="shrink-0 hover:opacity-70 transition-opacity"
                            title="Undo"
                            disabled={unmarkSession.isPending}
                            onClick={() => unmarkSession.mutate({ sessionIndex: i })}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                          </button>
                        ) : !todayProgramWorkout.exercises?.length && (
                          <button
                            className="shrink-0 text-xs font-semibold text-white/80 hover:text-white border border-white/30 hover:border-white/60 rounded px-1.5 py-0.5 transition-colors disabled:opacity-50"
                            disabled={markSessionDone.isPending}
                            onClick={() => markSessionDone.mutate({ sessionIndex: i })}
                          >
                            Done
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {todayProgramWorkout.cardio_sessions.length > 0 && todayExercises.length > 0 && (
                  <p className="text-xs text-amber-300 mt-2 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                    High-load day — lifting + cardio
                  </p>
                )}
              </div>
            )}

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

          {/* ── This Week + Muscles Trained (merged, spans 2 cols) ── */}
          <Card className="md:col-span-2 flex flex-col">
            <CardHeader className="pb-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                  <Brain className="w-4 h-4 text-[#ccff00]" />
                  This Week
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="hidden sm:inline text-xs text-[#a0a0a0] uppercase tracking-wide">Muscles trained</span>
                  <div className="flex rounded-full overflow-hidden border border-[#333] text-xs font-medium">
                    <button
                      onClick={() => setMuscleView("anterior")}
                      className={`px-2.5 py-0.5 transition-colors ${muscleView === "anterior" ? "bg-[#ccff00] text-black font-bold" : "bg-[#222] text-[#a0a0a0] hover:bg-[#2a2a2a]"}`}
                    >Front</button>
                    <button
                      onClick={() => setMuscleView("posterior")}
                      className={`px-2.5 py-0.5 transition-colors ${muscleView === "posterior" ? "bg-[#ccff00] text-black font-bold" : "bg-[#222] text-[#a0a0a0] hover:bg-[#2a2a2a]"}`}
                    >Back</button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-3 pb-4 flex flex-col sm:flex-row gap-4 flex-1 min-h-0">
              {/* Left: stats + AI generator */}
              <div className="flex-1 space-y-3 min-w-0">
                  {/* Workouts this week */}
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-[#a0a0a0]">Workouts</span>
                      <span className="font-semibold text-white">{weeklyCompleted}/{weeklyGoal}</span>
                    </div>
                    <div className="h-1.5 bg-[#333] rounded-full overflow-hidden">
                      <div className="h-full bg-[#ccff00] rounded-full transition-all" style={{ width: `${Math.min(100, (weeklyCompleted / weeklyGoal) * 100)}%` }} />
                    </div>
                  </div>

                  {/* Food logged this week */}
                  {(() => {
                    const daysWithFood = new Set(
                      (allFoodEntries || []).filter((e) => e.date >= weekStart && e.date <= weekEnd).map((e) => e.date)
                    ).size;
                    return (
                      <div>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-[#a0a0a0]">Food Logged</span>
                          <span className="font-semibold text-white">{daysWithFood}/7 days</span>
                        </div>
                        <div className="h-1.5 bg-[#333] rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.min(100, (daysWithFood / 7) * 100)}%` }} />
                        </div>
                      </div>
                    );
                  })()}

                  {activePhase && (
                    <div className="flex items-center justify-between text-sm pt-1 border-t border-[#2a2a2a]">
                      <span className="text-[#a0a0a0]">Diet Phase</span>
                      <Badge className="text-xs capitalize">{activePhase.phase_type?.replace("_", " ") || "Active"}</Badge>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-sm pt-1 border-t border-[#2a2a2a]">
                    <span className="text-[#a0a0a0]">Body Weight</span>
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-white">{currentBodyWeight || "—"}{currentBodyWeight ? ` ${weightUnit}` : ""}</span>
                      {bodyWeightChange !== undefined && bodyWeightChange !== null && bodyWeightChange !== 0 && (
                        <span className={`text-xs ${bodyWeightChange > 0 ? "text-[#fbbf24]" : "text-[#4ade80]"}`}>
                          {bodyWeightChange > 0 ? "+" : ""}{bodyWeightChange.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Cardio this week (only if Strava connected) */}
                  {profile?.strava_access_token && weeklyCardio.length > 0 && (
                    <div className="pt-1 border-t border-[#2a2a2a]">
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <span className="text-[#a0a0a0] flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-orange-500" />
                          Cardio
                        </span>
                        <span className="font-semibold text-white">
                          {weeklyCardio.length} {weeklyCardio.length === 1 ? "session" : "sessions"}
                        </span>
                      </div>
                      <div className="flex gap-3 text-xs text-[#555555]">
                        {weeklyCardioMiles > 0.05 && <span>{weeklyCardioMiles.toFixed(1)} mi</span>}
                        {weeklyCardioMinutes > 0 && <span>{weeklyCardioMinutes >= 60 ? `${Math.floor(weeklyCardioMinutes / 60)}h ${weeklyCardioMinutes % 60}m` : `${weeklyCardioMinutes}m`}</span>}
                        {weeklyCardioCalories > 0 && <span>{weeklyCardioCalories} cal</span>}
                      </div>
                    </div>
                  )}

                  <MedicalDisclaimer />

                  {/* Generate Week */}
                  <div className="pt-2 border-t border-[#2a2a2a]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-[#555555] uppercase tracking-wide">Week Generator</span>
                      <button
                        onClick={() => setShowWorkoutSettings((s) => !s)}
                        className="text-xs text-[#ccff00] hover:text-[#ccff00] font-medium"
                      >
                        {showWorkoutSettings ? "Hide" : "Options"}
                      </button>
                    </div>

                    {showWorkoutSettings && (
                      <div className="mb-3 p-3 bg-[#222] rounded-xl space-y-3 text-sm">
                        <div>
                          <span className="text-[#a0a0a0] block mb-1.5">
                            Exercises per day: <strong>{workoutSettings.exercisesPerDay ?? "Auto"}</strong>
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              onClick={() => setWorkoutSettings((s) => ({ ...s, exercisesPerDay: null }))}
                              className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-all ${workoutSettings.exercisesPerDay === null ? "border-[#ccff00] bg-[#ccff00]/10 text-[#ccff00]" : "border-[#2a2a2a] text-[#a0a0a0] hover:border-[#ccff00]/40"}`}
                            >Auto</button>
                            {[3, 4, 5, 6, 7].map((n) => (
                              <button
                                key={n}
                                onClick={() => setWorkoutSettings((s) => ({ ...s, exercisesPerDay: n }))}
                                className={`w-8 h-7 rounded-lg border text-xs font-medium transition-all ${workoutSettings.exercisesPerDay === n ? "border-[#ccff00] bg-[#ccff00]/10 text-[#ccff00]" : "border-[#2a2a2a] text-[#a0a0a0] hover:border-[#ccff00]/40"}`}
                              >{n}</button>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[#a0a0a0]">Cardio finisher</span>
                          <button
                            onClick={() => setWorkoutSettings((s) => ({ ...s, includeCardio: !s.includeCardio }))}
                            className={`w-9 h-5 rounded-full relative transition-colors ${workoutSettings.includeCardio ? "bg-[#ccff00]" : "bg-[#444]"}`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-[#1a1a1a] rounded-full shadow transition-transform ${workoutSettings.includeCardio ? "translate-x-4" : "translate-x-0"}`} />
                          </button>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[#a0a0a0]">Skip deload weeks</span>
                          <button
                            onClick={() => setWorkoutSettings((s) => ({ ...s, skipDeload: !s.skipDeload }))}
                            className={`w-9 h-5 rounded-full relative transition-colors ${workoutSettings.skipDeload ? "bg-[#ccff00]" : "bg-[#444]"}`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-[#1a1a1a] rounded-full shadow transition-transform ${workoutSettings.skipDeload ? "translate-x-4" : "translate-x-0"}`} />
                          </button>
                        </div>
                      </div>
                    )}

                    <Button
                      variant="dark"
                      onClick={() => {
                        handleGenerateAndSchedule();
                        if (tutorialActive && currentStepData?.id === "generate-week") nextStep();
                      }}
                      className="w-full h-9"
                      data-tutorial="generate-week-btn"
                    >
                      <Zap className="w-3.5 h-3.5 mr-1.5" />Generate My Week
                    </Button>
                  </div>
                </div>

              {/* Right: muscle heatmap — fills remaining height */}
              <div className="hidden sm:block w-px bg-[#333] shrink-0" />
              <div className="sm:w-[150px] shrink-0 flex flex-col items-center">
                {weeklyBodyData.length > 0 ? (
                  <MuscleHeatMap data={weeklyBodyData} view={muscleView} className="flex-1" />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <Dumbbell className="w-8 h-8 text-white  mb-2" />
                    <p className="text-xs text-[#a0a0a0]">Log workouts to see<br />which muscles you've hit</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Nutrition */}
        <Card className="border border-[#2a2a2a] mb-8" data-tutorial="nutrition-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                <Apple className="w-4 h-4 text-[#4ade80]" />
                Today's Nutrition
              </CardTitle>
              {tdeeResult?.tdee && (
                <div className="flex items-center gap-1.5 text-xs">
                  <Flame className="w-3 h-3 text-orange-400" />
                  <span className="text-[#555555]">
                    Est. TDEE:
                  </span>
                  <span className="font-semibold text-[#a0a0a0]">
                    {tdeeResult.tdee.toLocaleString()} cal
                  </span>
                  {tdeeResult.method === "adaptive" && (
                    <span className="text-xs text-[#4ade80] font-medium">observed</span>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="py-3">
            <div className="grid grid-cols-4 gap-2 md:gap-4">
              {[
                { label: "Calories", value: todayMacros.calories, goal: profile?.daily_calorie_goal || 0, unit: "", stroke: "#ccff00" },
                { label: "Protein", value: todayMacros.protein, goal: profile?.daily_protein_goal || 0, unit: "g", stroke: "#60a5fa" },
                { label: "Carbs", value: todayMacros.carbs, goal: profile?.daily_carbs_goal || 0, unit: "g", stroke: "#fbbf24" },
                { label: "Fats", value: todayMacros.fats, goal: profile?.daily_fats_goal || 0, unit: "g", stroke: "#f87171" },
              ].map(({ label, value, goal, unit, stroke }) => {
                const safeValue = value ?? 0;
                const safeGoal = goal ?? 0;
                const pct = safeGoal > 0 ? Math.min(1, safeValue / safeGoal) : 0;
                const r = 32;
                const circ = 2 * Math.PI * r;
                const offset = circ * (1 - pct);
                return (
                  <div key={label} className="flex flex-col items-center">
                    <div className="relative w-[76px] h-[76px] md:w-[88px] md:h-[88px]">
                      <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                        <circle cx="40" cy="40" r={r} fill="none" stroke="#2a2a2a" strokeWidth="6" />
                        <circle cx="40" cy="40" r={r} fill="none" stroke={stroke} strokeWidth="6" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} className="transition-all duration-700 ease-out" />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-sm md:text-base font-bold text-white leading-none">{Math.round(safeValue * 10) / 10}</span>
                        <span className="text-xs text-[#555555] leading-none mt-0.5">/ {safeGoal}{unit}</span>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-[#555555] mt-1.5">{label}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {showApprovalModal && pendingSchedule && (
          <WorkoutApprovalModal
            schedule={pendingSchedule.schedule}
            todayCheckIn={todayCheckIn}
            lastWeekVolume={
              weeklyLogsWithExercises.length > 0
                ? weeklyLogsWithExercises.reduce((sum, log) => sum + (log.exercises?.length || 0), 0)
                : null
            }
            onApprove={(schedule) => {
              handleApproveSchedule(schedule);
              if (tutorialActive && currentStepData?.id === "approve-schedule") nextStep();
            }}
            onCancel={() => { setShowApprovalModal(false); setPendingSchedule(null); }}
          />
        )}

        {/* Progress & Analytics */}
        <div className="mt-8">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[#ccff00]" />
              Progress & Analytics
            </h2>
            <p className="text-[#555555] text-sm mt-1">Track your strength, workouts, and body weight</p>
          </div>

          <Tabs defaultValue={defaultAnalyticsTab === 'training-load' && !profile?.strava_access_token ? 'history' : defaultAnalyticsTab} className="w-full" onValueChange={setActiveAnalyticsTab}>
            <TabsList className={`grid w-full mb-6 mt-4 ${profile?.strava_access_token ? 'grid-cols-4' : 'grid-cols-3'}`}>
              <TabsTrigger value="history"><Dumbbell className="w-4 h-4 mr-1.5 hidden sm:block" />History</TabsTrigger>
              <TabsTrigger value="bodyweight"><Scale className="w-4 h-4 mr-1.5 hidden sm:block" />Weight</TabsTrigger>
              {profile?.strava_access_token && (
                <TabsTrigger value="training-load"><Activity className="w-4 h-4 mr-1.5 hidden sm:block" />Training</TabsTrigger>
              )}
              <TabsTrigger value="coach"><Brain className="w-4 h-4 mr-1.5 hidden sm:block" />Nutrition</TabsTrigger>
            </TabsList>

            <TabsContent value="history">
              <div className="grid grid-cols-3 gap-3 mb-6">
                {[
                  { icon: Calendar, label: "Total Workouts", value: totalWorkoutsCount, unit: "" },
                  { icon: Dumbbell, label: "Total Volume", value: totalVolume > 0 ? `${(totalVolume / 1000).toFixed(1)}k` : "0", unit: totalVolume > 0 ? weightUnit : "" },
                  { icon: TrendingUp, label: "Avg Duration", value: avgDuration, unit: "min" },
                ].map(({ icon: Icon, label, value, unit }) => (
                  <Card key={label} className="">
                    <CardContent className="py-2 text-center">
                      <div className="flex items-center justify-center gap-1 text-xs text-[#555555] mb-0.5 mt-2"><Icon className="w-3 h-3" />{label}</div>
                      <div className="text-xl font-bold text-white">{value}<span className="text-xs text-[#a0a0a0] ml-1">{unit}</span></div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                <Card className="">
                  <CardHeader className="pb-2">
                    <div className="flex flex-col gap-2">
                      <CardTitle className="text-base">Exercise Progress</CardTitle>
                      <Select value={selectedExercise} onValueChange={setSelectedExercise}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select an exercise" /></SelectTrigger>
                        <SelectContent>{uniqueExercises.map((ex) => <SelectItem key={ex} value={ex}>{ex}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {selectedExercise && activeAnalyticsTab === "history"
                      ? <ExerciseProgressChart data={exerciseHistory} exerciseName={selectedExercise} weightUnit={weightUnit} className="h-64" />
                      : (
                        <div className="h-64 flex flex-col items-center justify-center gap-3 text-center px-4">
                          {uniqueExercises.length === 0 ? (
                            <>
                              <BarChart3 className="w-10 h-10 text-[#a0a0a0]" />
                              <div>
                                <p className="text-sm font-semibold text-[#a0a0a0]">No workout logs yet</p>
                                <p className="text-xs text-[#a0a0a0] mt-1">Complete workouts to track exercise progress over time</p>
                              </div>
                            </>
                          ) : (
                            <>
                              <TrendingUp className="w-10 h-10 text-[#a0a0a0]" />
                              <p className="text-sm text-[#555555]">Select an exercise above to see your progress chart</p>
                            </>
                          )}
                        </div>
                      )
                    }
                  </CardContent>
                </Card>
                <Card className="">
                  <CardHeader className="pb-2"><CardTitle className="text-base">Personal Records</CardTitle></CardHeader>
                  <CardContent>
                    {Object.keys(allPRs).length === 0
                      ? (
                        <div className="text-center py-8">
                          <Trophy className="w-10 h-10 text-[#a0a0a0] mx-auto mb-2" />
                          <p className="text-sm font-semibold text-[#a0a0a0]">No personal records yet</p>
                          <p className="text-xs text-[#a0a0a0] mt-1">Log sets with weight to track your PRs</p>
                        </div>
                      )
                      : <div className="max-h-80 overflow-y-auto"><table className="w-full">
                          <thead><tr className="border-b border-[#2a2a2a]">
                            <th className="text-left py-2 px-3 font-semibold text-[#555555] text-xs uppercase tracking-wider">Exercise</th>
                            <th className="text-left py-2 px-3 font-semibold text-[#555555] text-xs uppercase tracking-wider">Weight</th>
                            <th className="text-left py-2 px-3 font-semibold text-[#555555] text-xs uppercase tracking-wider">Reps</th>
                            <th className="text-left py-2 px-3 font-semibold text-[#555555] text-xs uppercase tracking-wider">Date</th>
                          </tr></thead>
                          <tbody>
                            {Object.entries(allPRs).sort((a, b) => b[1].weight - a[1].weight).map(([exercise, pr]) => (
                              <tr key={exercise} className="border-b border-[#2a2a2a] hover:bg-[#1a1a1a] hover:bg-[#242424] transition-colors">
                                <td className="py-2 px-3 font-medium text-sm">{exercise}</td>
                                <td className="py-2 px-3"><span className="font-semibold text-[#ccff00] text-sm">{pr.weight} {weightUnit}</span></td>
                                <td className="py-2 px-3 text-sm">{pr.reps}</td>
                                <td className="py-2 px-3 text-[#a0a0a0] text-sm">{new Date(pr.date).toLocaleDateString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table></div>
                    }
                  </CardContent>
                </Card>
              </div>

              <WorkoutLogsSection
                exerciseFilter={exerciseFilter} setExerciseFilter={setExerciseFilter}
                typeFilter={typeFilter} setTypeFilter={setTypeFilter}
                filteredLogs={filteredLogs} workoutLogs={workoutLogs}
                expandedLogs={expandedLogs} toggleExpanded={toggleExpanded}
                handleDeleteLog={handleDeleteLog} weightUnit={weightUnit}
              />
            </TabsContent>

            <TabsContent value="bodyweight">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                <Card className="">
                  <CardHeader className="pb-2"><CardTitle className="text-base">Log Your Weight</CardTitle></CardHeader>
                  <CardContent>
                    <form onSubmit={handleAddBodyWeight} className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm font-medium text-[#a0a0a0] mb-1 block">Weight ({weightUnit}) *</label>
                          <Input type="number" step="0.1" value={newBodyWeight} onChange={(e) => setNewBodyWeight(e.target.value)} placeholder={`e.g., ${weightUnit === "lbs" ? "150" : "68"}`} required />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-[#a0a0a0] mb-1 block">Date *</label>
                          <Input type="date" value={bodyWeightDate} onChange={(e) => setBodyWeightDate(e.target.value)} required />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-[#a0a0a0] mb-1 block">Notes (optional)</label>
                        <Input value={bodyWeightNotes} onChange={(e) => setBodyWeightNotes(e.target.value)} placeholder="e.g., Morning weigh-in..." />
                      </div>
                      <Button type="submit" variant="primary" className="w-full font-bold" disabled={addBodyWeightMutation.isPending}>
                        <Scale className="w-4 h-4 mr-2" />Log Weight
                      </Button>
                    </form>
                  </CardContent>
                </Card>
                <Card className="">
                  <CardHeader className="pb-2"><CardTitle className="text-base">Quick Stats</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: "Starting", value: startBodyWeight ? `${startBodyWeight} ${weightUnit}` : "—" },
                        { label: "Current", value: currentBodyWeight ? `${currentBodyWeight} ${weightUnit}` : "—" },
                        { label: "Trend", value: sortedWeightEntries.length > 1 ? `${(sortedWeightEntries.reduce((s, e) => s + e.weight, 0) / sortedWeightEntries.length).toFixed(1)} ${weightUnit}` : "—" },
                        { label: "Change", value: bodyWeightChange !== null ? `${bodyWeightChange > 0 ? "+" : ""}${bodyWeightChange.toFixed(1)} ${weightUnit}` : "—", color: bodyWeightChange > 0 ? "text-[#fbbf24]" : bodyWeightChange < 0 ? "text-[#4ade80]" : "" },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="bg-[#202020] rounded-xl p-3">
                          <div className="text-xs text-[#555555] mb-0.5">{label}</div>
                          <div className={`text-lg font-bold ${color || "text-white"}`}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {weightEntries.length > 0 && activeAnalyticsTab === "bodyweight" && (
                <Card className="mb-6">
                  <CardHeader className="pb-2"><CardTitle className="text-base">Weight Progress</CardTitle></CardHeader>
                  <CardContent><WeightProgressChart data={weightEntries} weightUnit={weightUnit} className="h-64" /></CardContent>
                </Card>
              )}

              {weightEntries.length === 0
                ? <Card className="border border-[#2a2a2a]  text-center py-12 bg-[#1a1a1a] "><CardContent>
                    <Scale className="w-16 h-16 text-[#a0a0a0] mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">No weight entries yet</h3>
                    <p className="text-[#a0a0a0]">Start logging your weight to track your progress</p>
                  </CardContent></Card>
                : <WeightHistorySection weightEntries={weightEntries} weightUnit={weightUnit} handleDeleteBodyWeight={handleDeleteBodyWeight} />
              }
            </TabsContent>

          {profile?.strava_access_token && (
            <TabsContent value="training-load">
              <TrainingLoadTab
                cardioSessions={allCardioSessions}
                workoutLogs={workoutLogs}
                profile={profile}
                hasStrava={true}
              />
            </TabsContent>
          )}

          <TabsContent value="coach">
              <NutritionCoach />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={deleteTarget?.type === "log" ? "Delete Workout Log?" : "Delete Weight Entry?"}
        description={deleteTarget?.type === "log" ? "This will permanently delete this workout log." : "This will permanently delete this weight entry."}
        confirmText="Delete" cancelText="Cancel" variant="danger"
        onConfirm={() => {
          if (deleteTarget.type === "log") deleteLogMutation.mutate(deleteTarget.id);
          else deleteBodyWeightMutation.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
        loading={deleteLogMutation.isPending || deleteBodyWeightMutation.isPending}
      />
    </div>
  );
}

function WorkoutLogsSection({ exerciseFilter, setExerciseFilter, typeFilter, setTypeFilter, filteredLogs, workoutLogs, expandedLogs, toggleExpanded, handleDeleteLog, weightUnit }) {
  const [logsOpen, setLogsOpen] = useState(false);
  return (
    <Card className="mb-6">
      <CardHeader className="cursor-pointer py-3" onClick={() => setLogsOpen(!logsOpen)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="w-4 h-4" />Workout Logs
            <Badge variant="secondary" className="text-xs ml-1">{workoutLogs.length}</Badge>
          </CardTitle>
          {logsOpen ? <ChevronUp className="w-5 h-5 text-[#a0a0a0]" /> : <ChevronDown className="w-5 h-5 text-[#a0a0a0]" />}
        </div>
      </CardHeader>
      {logsOpen && (
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-sm font-medium text-[#a0a0a0] mb-1 block">Search Exercise</label>
              <Input placeholder="e.g., Bench Press" value={exerciseFilter} onChange={(e) => setExerciseFilter(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-[#a0a0a0] mb-1 block">Workout Type</label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="strength">Strength</SelectItem>
                  <SelectItem value="cardio">Cardio</SelectItem>
                  <SelectItem value="hiit">HIIT</SelectItem>
                  <SelectItem value="yoga">Yoga</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {filteredLogs.length === 0 ? (
            <div className="text-center py-8">
              <Dumbbell className="w-10 h-10 text-[#a0a0a0] mx-auto mb-2" />
              <p className="text-sm font-semibold text-[#a0a0a0]">
                {workoutLogs.length === 0 ? "No workout history yet" : "No matching workouts"}
              </p>
              <p className="text-xs text-[#a0a0a0] mt-1">
                {workoutLogs.length === 0 ? "Complete a workout to see your logs here" : "Try adjusting your filters"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredLogs.map((log) => {
                const isExpanded = expandedLogs.has(log.id);
                const vol = calculateVolume(log);
                const durMin = log.duration_seconds ? Math.round(log.duration_seconds / 60) : null;
                return (
                  <div key={log.id} className="border border-[#2a2a2a]  rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-[#1a1a1a] hover:bg-[#242424] transition-colors" onClick={() => toggleExpanded(log.id)}>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate text-white">{log.workoutTitle}</div>
                        <div className="flex flex-wrap gap-3 text-xs text-[#555555] mt-0.5">
                          <span>{format(parseISO(log.log_date), "MMM d, yyyy")}</span>
                          {durMin && <span>{durMin} min</span>}
                          <span>{log.exercises?.length || 0} exercises</span>
                          {vol > 0 && <span className="text-[#ccff00] font-medium">{(vol / 1000).toFixed(1)}k {weightUnit}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-[#f87171]" onClick={(e) => { e.stopPropagation(); handleDeleteLog(log.id); }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-[#a0a0a0]" /> : <ChevronDown className="w-4 h-4 text-[#a0a0a0]" />}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-[#2a2a2a]  p-3 space-y-3">
                        {log.exercises?.map((exercise, idx) => (
                          <div key={idx} className="bg-[#202020] rounded-xl p-3">
                            <h4 className="font-semibold text-sm mb-2 text-white">{exercise.name}</h4>
                            <table className="w-full text-xs">
                              <thead><tr className="border-b border-[#2a2a2a]">
                                <th className="text-center py-1 px-2 text-[#a0a0a0]">Set</th>
                                <th className="text-center py-1 px-2 text-[#a0a0a0]">Weight</th>
                                <th className="text-center py-1 px-2 text-[#a0a0a0]">Reps</th>
                                <th className="text-center py-1 px-2 text-[#a0a0a0]">Vol</th>
                                <th className="text-center py-1 px-2 text-[#a0a0a0]">RIR</th>
                              </tr></thead>
                              <tbody>
                                {exercise.sets?.map((set, si) => (
                                  <tr key={si} className="border-b border-[#2a2a2a]">
                                    <td className="py-1 px-2 text-center text-[#a0a0a0]">{set.set_number}</td>
                                    <td className="py-1 px-2 text-center text-[#a0a0a0]">{set.weight} {weightUnit}</td>
                                    <td className="py-1 px-2 text-center text-[#a0a0a0]">{set.reps}</td>
                                    <td className="py-1 px-2 text-center text-[#ccff00]">{set.weight * set.reps}</td>
                                    <td className="py-1 px-2 text-center text-[#555555]">{(set.rir ?? set.rpe) ?? "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ))}
                        {log.notes && <div className="bg-[rgba(204,255,0,0.05)] border border-[rgba(204,255,0,0.15)] rounded-xl p-3 text-sm text-[#a0a0a0]">{log.notes}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function WeightHistorySection({ weightEntries, weightUnit, handleDeleteBodyWeight }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  return (
    <Card className="">
      <CardHeader className="cursor-pointer py-3" onClick={() => setHistoryOpen(!historyOpen)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Scale className="w-4 h-4" />Weight History
            <Badge variant="secondary" className="text-xs ml-1">{weightEntries.length}</Badge>
          </CardTitle>
          {historyOpen ? <ChevronUp className="w-5 h-5 text-[#a0a0a0]" /> : <ChevronDown className="w-5 h-5 text-[#a0a0a0]" />}
        </div>
      </CardHeader>
      {historyOpen && (
        <CardContent className="pt-0">
          <div className="space-y-2">
            {weightEntries.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between p-3 bg-[#202020] rounded-xl hover:bg-[#202020]  transition-colors">
                <div className="flex items-center gap-3">
                  <div className="text-lg font-bold text-white">{entry.weight} {weightUnit}</div>
                  <div className="text-sm text-[#a0a0a0]">{format(parseISO(entry.recorded_date), "MMM d, yyyy")}</div>
                </div>
                <div className="flex items-center gap-2">
                  {entry.notes && <p className="text-xs text-[#555555] italic hidden sm:block">{entry.notes}</p>}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteBodyWeight(entry.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-[#f87171]" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
