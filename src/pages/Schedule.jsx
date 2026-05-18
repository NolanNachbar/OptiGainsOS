import { useState } from "react";
import { db, supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useTutorial } from "@/hooks/useTutorial";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { calculateMacros } from "@/utils/nutritionUtils";
import { useProfile, useAllFoodEntries } from "@/hooks/useUserQueries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingScreen } from "@/components/ui/loading-spinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { queryKeys, invalidateSchedule, invalidateWorkouts, invalidateWorkoutLogs, invalidatePrograms } from "@/lib/queryKeys";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  Plus,
  X,
  Clock,
  Dumbbell,
  Apple,
  Flame,
  Trash2,
  Undo2,
  Redo2,
} from "lucide-react";
import { format, addDays, isSameDay, isBefore, addWeeks, subWeeks, startOfWeek } from "date-fns";
import { getTodayString, getWeekStart } from "@/utils/dateUtils";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import WorkoutApprovalModal from "@/components/workouts/WorkoutApprovalModal";
import CustomSplitSelector from "@/components/workouts/CustomSplitSelector";
import ProgramDurationModal from "@/components/workouts/ProgramDurationModal";
import { useEnrollments, useProgram } from "@/hooks/useProgramQueries";
import { getProgramSchedule } from "@/utils/programSchedule";
import { generateWorkoutPlan } from "@/ml/workoutModel";
import { useExerciseReactions } from "@/hooks/useExerciseReactions";
import { BookOpen, Activity } from "lucide-react";
import { ACTIVITY_TYPE_LABELS, ACTIVITY_TYPE_COLORS } from "@/lib/strava";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const SegmentedCircularProgress = ({
  calories,
  protein,
  carbs,
  fats,
  size = 80,
  strokeWidth = 6,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const quarterCircumference = circumference / 4;

  const segments = [
    { percentage: calories, color: "#ccff00", bgColor: "#2a2a2a", rotation: 0 },
    { percentage: protein, color: "#a0e040", bgColor: "#2a2a2a", rotation: 90 },
    { percentage: carbs, color: "#7bbd00", bgColor: "#2a2a2a", rotation: 180 },
    { percentage: fats, color: "#ccff00", bgColor: "#2a2a2a", rotation: 270 },
  ];

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          {segments.map((segment, index) => {
            const clampedPercentage = Math.min(100, segment.percentage);
            const progressLength = (clampedPercentage / 100) * quarterCircumference;
            const gapLength = circumference - quarterCircumference;

            return (
              <g key={index}>
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={segment.bgColor}
                  strokeWidth={strokeWidth}
                  fill="none"
                  strokeDasharray={`${quarterCircumference} ${gapLength}`}
                  strokeLinecap="butt"
                  style={{
                    transform: `rotate(${segment.rotation - 90}deg)`,
                    transformOrigin: "center",
                  }}
                />
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={segment.color}
                  strokeWidth={strokeWidth}
                  fill="none"
                  strokeDasharray={`${progressLength} ${circumference - progressLength}`}
                  strokeLinecap="butt"
                  style={{
                    transform: `rotate(${segment.rotation - 90}deg)`,
                    transformOrigin: "center",
                    transition: "stroke-dasharray 0.3s ease-in-out",
                  }}
                />
              </g>
            );
          })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <Apple className="w-5 h-5 text-[#a0a0a0]" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 mt-2 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-[rgba(245,158,11,0.1)]"></div>
          <span className="text-[#a0a0a0]">{Math.round(calories)}%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-[rgba(204,255,0,0.08)]0"></div>
          <span className="text-[#a0a0a0]">{Math.round(protein)}%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-[rgba(34,197,94,0.1)]"></div>
          <span className="text-[#a0a0a0]">{Math.round(carbs)}%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-[rgba(204,255,0,0.08)]0"></div>
          <span className="text-[#a0a0a0]">{Math.round(fats)}%</span>
        </div>
      </div>
    </div>
  );
};

export default function Schedule() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tutorialWorkouts } = useTutorial();
  const [currentWeekStart, setCurrentWeekStart] = useState(
    getWeekStart(null, 1)
  );
  const [draggedWorkout, setDraggedWorkout] = useState(null);
  const [dragOverDate, setDragOverDate] = useState(null);
  const [selectedWorkout, setSelectedWorkout] = useState("");
  const [timeOfDay, setTimeOfDay] = useState("anytime");
  const [dayDetailDate, setDayDetailDate] = useState(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [pendingSchedule, setPendingSchedule] = useState(null);
  const [showSplitSelector, setShowSplitSelector] = useState(false);
  const [showDurationModal, setShowDurationModal] = useState(false);
  const [selectedSplit, setSelectedSplit] = useState(null);
  const [libraryFilter, setLibraryFilter] = useState("all");
  const [scheduleMode, setScheduleMode] = useState(null); // null | "program" | "week"
  const [pendingExercisesPerDay, setPendingExercisesPerDay] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // { type: 'program'|'workout', id, name }
  const [showScheduleChoiceModal, setShowScheduleChoiceModal] = useState(false);
  const [showProgramStartModal, setShowProgramStartModal] = useState(false);
  const [selectedProgramStartDate, setSelectedProgramStartDate] = useState("");
  const [sessionChecks, setSessionChecks] = useState(new Set()); // local per-session check state
  const [selectedDay, setSelectedDay] = useState(new Date());

  const { profile } = useProfile();
  const { getLikedExercises, getDislikedExercises } = useExerciseReactions();
  // Pre-compute at render time so event handlers always have a defined value
  const likedExercises = getLikedExercises();
  const dislikedExercises = getDislikedExercises();

  const { data: allWorkouts = [] } = useQuery({
    queryKey: queryKeys.workouts(user?.id),
    queryFn: () => db.entities.Workout.filter({ created_by: user.id }),
    enabled: !!user,
  });
  // Exclude old PROGRAM_ID-tagged duplicates from schedule dots and library
  const workouts = allWorkouts.filter(w => !w.description?.includes("PROGRAM_ID:"));

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  const weekDates = weekDays.map((day) => format(day, "yyyy-MM-dd"));

  const { data: dbSchedule = [] } = useQuery({
    queryKey: [...queryKeys.schedule(user?.id), currentWeekStart.toISOString()],
    queryFn: async () => {
      const allSchedule = await db.entities.WorkoutSchedule.filter({ created_by: user.id });
      return allSchedule.filter((s) => weekDates.includes(s.scheduled_date));
    },
    enabled: !!user,
  });

  // Workout logs for the visible week — used to show completed program lifts
  // even when the enrollment no longer exists (workout_schedule_id is null for program workouts)
  const { data: weeklyWorkoutLogs = [] } = useQuery({
    queryKey: [...queryKeys.workoutLogs(user?.id), format(currentWeekStart, 'yyyy-MM-dd')],
    queryFn: async () => {
      const weekEnd = format(addDays(currentWeekStart, 6), "yyyy-MM-dd");
      const weekStart = format(currentWeekStart, "yyyy-MM-dd");
      const { data, error } = await supabase
        .from('workout_logs')
        .select('id, created_by, workout_id, workout_schedule_id, log_date, exercises, duration_seconds, notes')
        .eq('created_by', user.id)
        .gte('log_date', weekStart)
        .lte('log_date', weekEnd);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Logs without a schedule entry = program workouts logged without a WorkoutSchedule row
  // Exclude logs already represented by a program schedule entry (matched by title),
  // and deduplicate multiple logs for the same workout on the same day.
  const getOrphanLogsForDate = (date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const programTitles = new Set(getProgramForDate(date).map((e) => e.title));
    const seenWorkoutIds = new Set();
    return weeklyWorkoutLogs.filter((log) => {
      if (log.log_date !== dateStr || log.workout_schedule_id) return false;
      if (seenWorkoutIds.has(log.workout_id)) return false;
      seenWorkoutIds.add(log.workout_id);
      const logWorkout = workouts.find((w) => w.id === log.workout_id);
      if (logWorkout && programTitles.has(logWorkout.title)) return false;
      return true;
    });
  };

  const { data: weeklyCardio = [] } = useQuery({
    queryKey: ['cardioSessions', user?.id, format(currentWeekStart, 'yyyy-MM-dd')],
    queryFn: async () => {
      const weekEnd = addDays(currentWeekStart, 7);
      const { data, error } = await supabase
        .from('cardio_sessions')
        .select('*')
        .eq('created_by', user.id)
        .gte('start_date', currentWeekStart.toISOString())
        .lt('start_date', weekEnd.toISOString());
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!profile?.strava_access_token,
  });

  const getCardioForDate = (day) =>
    weeklyCardio.filter(s => isSameDay(new Date(s.start_date), day));

  // Merge tutorial workouts with real schedule (tutorial workouts appear only during tutorial)
  const schedule = [
    ...dbSchedule,
    ...tutorialWorkouts.filter((tw) => weekDates.includes(tw.date)).map((tw, index) => ({
      id: `tutorial-${index}`,
      workout_id: `tutorial-workout-${index}`,
      scheduled_date: tw.date,
      time_of_day: "anytime",
      completed: false,
      created_by: user?.id,
      _isTutorial: true,
      _tutorialData: tw,
    })),
  ];

  // Program enrollment
  const { enrollments } = useEnrollments();
  const activeEnrollment = enrollments.find((e) => e.status === "active");
  const { program: activeProgram } = useProgram(activeEnrollment?.program_id);
  const today = getTodayString(profile?.timezone);
  const cancelledEnrollments = enrollments.filter((e) => e.status === "cancelled");
  const programScheduleEntries = [
    ...(activeEnrollment && activeProgram
      ? getProgramSchedule(activeEnrollment, activeProgram.workouts || [])
      : []),
    ...cancelledEnrollments.flatMap((e) =>
      e.program
        ? getProgramSchedule(e, e.program.workouts || []).filter(
            (entry) => entry.completed && entry.date <= today
          )
        : []
    ),
  ];

  // All user programs for the My Programs panel
  const { data: allPrograms = [] } = useQuery({
    queryKey: queryKeys.programs(user?.id),
    queryFn: () => db.entities.Program.filter({ created_by: user.id }),
    enabled: !!user,
  });

  const deleteProgramMutation = useMutation({
    mutationFn: async (programId) => {
      // Delete calendar workouts tagged with this program's ID
      const allWorkouts = await db.entities.Workout.filter({ created_by: user.id });
      const tagged = allWorkouts.filter(w => w.description?.includes(`PROGRAM_ID:${programId}`));
      for (const w of tagged) {
        const schedEntries = await db.entities.WorkoutSchedule.filter({ workout_id: w.id });
        for (const s of schedEntries) await db.entities.WorkoutSchedule.delete(s.id);
        await db.entities.Workout.delete(w.id);
      }
      // Delete program workout templates
      const pWorkouts = await db.entities.ProgramWorkout.filter({ program_id: programId });
      for (const w of pWorkouts) await db.entities.ProgramWorkout.delete(w.id);
      // Delete enrollments
      const pEnrollments = await db.entities.ProgramEnrollment.filter({ program_id: programId });
      for (const e of pEnrollments) await db.entities.ProgramEnrollment.delete(e.id);
      // Delete the program itself
      await db.entities.Program.delete(programId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programs'] });
      queryClient.invalidateQueries({ queryKey: ['enrollments'] });
      invalidateSchedule(queryClient);
      invalidateWorkouts(queryClient);
      toast.success("Program deleted");
    },
    onError: (e) => { console.error(e); toast.error("Failed to delete program"); },
  });

  const deleteWorkoutMutation = useMutation({
    mutationFn: async (workoutId) => {
      // Remove any schedule entries first
      const scheduleEntries = await db.entities.WorkoutSchedule.filter({ workout_id: workoutId });
      for (const s of scheduleEntries) await db.entities.WorkoutSchedule.delete(s.id);
      await db.entities.Workout.delete(workoutId);
    },
    onSuccess: () => {
      invalidateSchedule(queryClient);
      invalidateWorkouts(queryClient);
      toast.success("Workout deleted");
    },
    onError: () => toast.error("Failed to delete workout"),
  });

  const getProgramForDate = (date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return programScheduleEntries.filter((e) => e.date === dateStr);
  };

  const markSessionDone = useMutation({
    mutationFn: async ({ item, sessionIndex }) => {
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
        // Add a whole-workout entry and advance the program
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
    onSuccess: (_, { item }) => {
      invalidatePrograms(queryClient);
      invalidateSchedule(queryClient);
      const allDoneNow = (activeEnrollment.completed_workouts || []).filter(
        (cw) => cw && cw.cycle === item.cycle && cw.day_index === item.dayIndex && cw.session_index != null
      ).length + 1 >= item.cardio_sessions.length;
      toast.success(allDoneNow ? "All cardio sessions complete!" : "Session marked complete!");
    },
    onError: () => toast.error("Failed to mark complete"),
  });

  const unmarkCardioDone = useMutation({
    mutationFn: async (item) => {
      const updated = (activeEnrollment.completed_workouts || []).filter((cw) => {
        if (typeof cw === 'string') return cw !== item.programWorkoutId;
        return !(cw.cycle === item.cycle && cw.day_index === item.dayIndex);
      });
      await db.entities.ProgramEnrollment.update(item.enrollmentId, {
        completed_workouts: updated,
        current_day_index: item.dayIndex,
        current_cycle: item.cycle,
        current_day: item.dayIndex,
        current_week: item.cycle,
        status: 'active',
        updated_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      invalidatePrograms(queryClient);
      invalidateSchedule(queryClient);
      toast.success("Marked as incomplete");
    },
    onError: () => toast.error("Failed to unmark"),
  });

  const unmarkSession = useMutation({
    mutationFn: async ({ item, sessionIndex }) => {
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

  const { allFoodEntries } = useAllFoodEntries();

  const getFoodForDate = (date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return allFoodEntries.filter((entry) => entry.date === dateStr);
  };

  const getMacrosForDate = (date) => {
    return calculateMacros(getFoodForDate(date));
  };

  // Mutations
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

  const updateEnrollmentMutation = useMutation({
    mutationFn: async ({ enrollmentId, startDate }) => {
      return await db.entities.ProgramEnrollment.update(enrollmentId, {
        started_at: startDate,
        start_date: startDate,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollments'] });
      invalidateSchedule(queryClient);
      toast.success("Program start date updated! Your schedule has been recalculated.");
      setShowProgramStartModal(false);
    },
    onError: () => toast.error("Failed to update start date"),
  });
  

  const moveWorkoutMutation = useMutation({
    mutationFn: async ({ scheduleId, newDate }) => {
      return await db.entities.WorkoutSchedule.update(scheduleId, {
        scheduled_date: newDate,
      });
    },
    onSuccess: () => {
      invalidateSchedule(queryClient);
      toast.success("Workout moved!");
    },
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
    mutationFn: async (scheduleId) => {
      return await db.entities.WorkoutSchedule.delete(scheduleId);
    },
    onSuccess: () => {
      invalidateSchedule(queryClient);
      toast.success("Workout removed");
    },
  });

  // Drag and drop handlers
  const handleDragStart = (e, workout) => {
    setDraggedWorkout(workout);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    setDraggedWorkout(null);
    setDragOverDate(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDragEnter = (e, dateStr) => {
    e.preventDefault();
    setDragOverDate(dateStr);
  };

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverDate(null);
    }
  };

  const handleDrop = (e, date) => {
    e.preventDefault();
    setDragOverDate(null);
    if (!draggedWorkout) return;
    const dateStr = format(date, "yyyy-MM-dd");
    if (draggedWorkout.isLibrary) {
      scheduleWorkoutMutation.mutate({ workoutId: draggedWorkout.id, date: dateStr });
    } else {
      moveWorkoutMutation.mutate({ scheduleId: draggedWorkout.scheduleId, newDate: dateStr });
    }
    setDraggedWorkout(null);
  };

  // "Build Program" path → split → duration modal → approval → saves Program + Enrollment
  const handleBuildProgram = () => {
    if (!profile) { toast.error("Profile not loaded."); return; }
    setScheduleMode("program");
    setShowSplitSelector(true);
  };

  // "Schedule This Week" path → split → approval → saves plain Workout + WorkoutSchedule
  const handleScheduleWeek = () => {
    if (!profile) { toast.error("Profile not loaded."); return; }
    
    if (activeEnrollment && activeProgram) {
      // Ask the user what they want to do
      setShowScheduleChoiceModal(true);
    } else {
      // No active program — go straight to split selector
      setScheduleMode("week");
      setShowSplitSelector(true);
    }
  };

  // Step 2: User picked a split (+ optional exercisesPerDay for 60+ min users)
  const handleSplitSelected = (split, exercisesPerDay = null) => {
    setShowSplitSelector(false);
    setSelectedSplit(split);
    setPendingExercisesPerDay(exercisesPerDay);

    if (scheduleMode === "week") {
      // Week-only: generate immediately, skip program duration modal
      try {
        // Pass split explicitly so exercises are generated for Push/Pull/Legs etc.
        // NOT re-derived from days_per_week (which would give Upper/Lower for 4-day).
        const plan = generateWorkoutPlan({
          days_per_week: split.length,
          split,                                              // ← user's chosen day types
          fitness_level: profile.fitness_level || "intermediate",
          available_equipment: profile.available_equipment || [],
          workout_duration_preference: profile.workout_duration_preference || "45 min",
          primary_goal: profile.primary_goal || "general_fitness",
          exercises_per_day: exercisesPerDay,
          likedExercises,
          dislikedExercises,
        }, 1);

        const DAY_DISTRIBUTION = {
          1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4],
          5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6],
        };
        const dayOffsets = DAY_DISTRIBUTION[split.length] || split.map((_, i) => i);
        // plan.week already has correct focus from split — no relabeling needed
        const week = plan.week;
        const scheduleSuggestion = week.map((day, index) => ({
          date: format(addDays(currentWeekStart, dayOffsets[index]), "yyyy-MM-dd"),
          dayName: format(addDays(currentWeekStart, dayOffsets[index]), "EEEE"),
          focus: day.focus,
          duration: day.duration,
          exercises: day.exercises,
          dayIndex: day.dayIndex,
          // No programConfig → week-only path in handleApproveSchedule
        }));
        setPendingSchedule({ plan: { ...plan, week }, schedule: scheduleSuggestion });
        setShowApprovalModal(true);
      } catch (err) {
        console.error(err);
        toast.error("Failed to generate workout plan");
      }
    } else {
      // Program mode: needs duration/progression settings
      setShowDurationModal(true);
    }
  };

  // Step 3: User confirmed duration + progression — generate the plan
  const handleDurationConfirmed = (programConfig) => {
    setShowDurationModal(false);
    try {
      const { split, totalWeeks, weeklyIncrement, deloadMode, deloadReduction, weekSchedule } = programConfig;

      // Generate week 1 (intro) workout plan using the chosen split
      // Pass split explicitly so the model generates exercises for Push/Pull/Legs etc,
      // NOT for a re-derived Upper/Lower split based on days_per_week alone.
      const plan = generateWorkoutPlan({
        days_per_week: split.length,
        split,                                              // ← user's chosen day types
        fitness_level: profile.fitness_level || "intermediate",
        available_equipment: profile.available_equipment || [],
        workout_duration_preference: profile.workout_duration_preference || "45 min",
        primary_goal: profile.primary_goal || "general_fitness",
        exercises_per_day: pendingExercisesPerDay,
        likedExercises,
        dislikedExercises,
      }, 1);

      // plan.week already has correct focus labels — no relabeling needed
      const week = plan.week;

      // Spread training days across the week intelligently with rest days
      // e.g. 3-day split → Mon, Wed, Fri; 4-day → Mon, Tue, Thu, Fri; 5-day → Mon-Fri
      const DAY_DISTRIBUTION = {
        1: [0],
        2: [0, 3],
        3: [0, 2, 4],
        4: [0, 1, 3, 4],
        5: [0, 1, 2, 3, 4],
        6: [0, 1, 2, 3, 4, 5],
        7: [0, 1, 2, 3, 4, 5, 6],
      };
      const dayOffsets = DAY_DISTRIBUTION[split.length] || split.map((_, i) => i);

      // Annotate each day with program config for scheduling
      const scheduleSuggestion = week.map((day, index) => ({
        date: format(addDays(currentWeekStart, dayOffsets[index]), "yyyy-MM-dd"),
        dayName: format(addDays(currentWeekStart, dayOffsets[index]), "EEEE"),
        focus: day.focus,
        duration: day.duration,
        exercises: day.exercises,
        dayIndex: day.dayIndex,
        programConfig: {
          totalWeeks,
          weeklyIncrement,
          deloadMode,
          deloadReduction,
          weekSchedule,
          split,
          currentWeek: 1,
          phase: "intro",
        },
      }));

      setPendingSchedule({ plan: { ...plan, week }, schedule: scheduleSuggestion });
      setShowApprovalModal(true);
    } catch (error) {
      console.error("Error generating plan:", error);
      toast.error("Failed to generate workout plan");
    }
  };

  const handleApproveSchedule = async (approvedSchedule) => {
    try {
      // Check if this came from the duration modal (has programConfig)
      const programConfig = approvedSchedule[0]?.programConfig;

      if (programConfig) {
        // Save as a structured multi-week program using ProgramBuilder schema
        const { totalWeeks, weeklyIncrement, deloadMode, deloadReduction, weekSchedule, split } = programConfig;

        // Build the workout template (cycle = 1 week, repeated totalWeeks times)
        const workoutTemplate = approvedSchedule.map((day, idx) => ({
          day_index: idx + 1,
          title: day.focus,
          type: "strength",
          notes: "",
          week_number: 1,
          day_number: idx + 1,
          exercises: day.exercises.map(ex => ({
            name: ex.name,
            sets: ex.sets || 3,
            rep_target: ex.reps || "10",
            rir_target: 2,
            rest_seconds: ex.rest || 60,
            progression: { weight_increment: weeklyIncrement, daily_min_pct: 0.85 },
            pattern: ex.pattern || "",
          })),
        }));

        // Map profile goals to valid program goal constraint values
        const GOAL_MAP = {
          weight_loss: "fat_loss",
          fat_loss: "fat_loss",
          muscle_gain: "muscle_gain",
          endurance: "endurance",
          general_fitness: "general",
          flexibility: "general",
        };
        const validGoal = GOAL_MAP[profile?.primary_goal] || "general";
        const splitArray = Array.isArray(split) ? split : approvedSchedule.map(d => d.focus);

        // Create the program record — only columns that exist in the table
        const program = await db.entities.Program.create({
          name: `${splitArray.join(" / ")} — ${totalWeeks} Week Plan`,
          description: `${totalWeeks}-week auto-generated program: 1 intro week, ${totalWeeks - 2} progression weeks (+${weeklyIncrement} lbs/week), 1 deload week. Deload: ${deloadMode === "match_intro" ? "back to intro weight" : `−${deloadReduction} lbs`}.`,
          cycle_length: splitArray.length,
          num_cycles: totalWeeks,
          duration_weeks: totalWeeks,
          days_per_week: splitArray.length,
          difficulty: profile?.fitness_level || "intermediate",
          goal: validGoal,
          schema_version: 2,
          is_public: false,
          tags: [],
          created_by: user.id,
        });

        // Save workout templates — program_workouts has no created_by column
        for (const w of workoutTemplate) {
          await db.entities.ProgramWorkout.create({
            ...w,
            program_id: program.id,
          });
        }

        // Enroll — getProgramSchedule computes all dates. No duplicate Workout records needed.
        // cycle_length / num_cycles / days_per_week already stored on the Program record.
        await db.entities.ProgramEnrollment.create({
          program_id: program.id,
          user_id: user.id,
          status: "active",
          started_at: format(currentWeekStart, "yyyy-MM-dd"),
          start_date: format(currentWeekStart, "yyyy-MM-dd"),
          current_day: 1,
          current_day_index: 1,
          current_week: 1,
          current_cycle: 1,
          completed_workouts: [],
          progression_state: {},
        });

        invalidateSchedule(queryClient);
        invalidateWorkouts(queryClient);
        toast.success(`${totalWeeks}-week program created and scheduled!`);
      } else {
        // Simple one-week schedule (no program config)
        for (const daySchedule of approvedSchedule) {
          const workout = await db.entities.Workout.create({
            title: `${daySchedule.focus} - ${daySchedule.dayName}`,
            description: `Generated workout focusing on ${daySchedule.focus.toLowerCase()}`,
            type: "strength",
            difficulty: "intermediate",
            duration_minutes: parseInt(daySchedule.duration) || 45,
            exercises: daySchedule.exercises.map((ex) => ({
              name: ex.name,
              sets: ex.sets || 3,
              reps: ex.reps || "10",
              rest_seconds: ex.rest || 60,
              notes: "",
              pattern: ex.pattern || "",
            })),
            equipment_needed: [],
            is_custom: true,
            target_goals: [],
            created_by: user.id,
          });
          await db.entities.WorkoutSchedule.create({
            workout_id: workout.id,
            scheduled_date: daySchedule.date,
            time_of_day: "anytime",
            completed: false,
            created_by: user.id,
          });
        }
        invalidateSchedule(queryClient);
        invalidateWorkouts(queryClient);
        toast.success("Weekly schedule created!");
      }

      setShowApprovalModal(false);
      setPendingSchedule(null);
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to create schedule");
    }
  };

  const getScheduleForDate = (date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return schedule.filter((s) => s.scheduled_date === dateStr);
  };

  const handleScheduleActiveProgram = () => {
    setShowScheduleChoiceModal(false);
    const currentStart = activeEnrollment?.start_date || format(new Date(), "yyyy-MM-dd");
    setSelectedProgramStartDate(currentStart);
    setShowProgramStartModal(true);
  };

  // Weekly progress
  const completedThisWeek = schedule.filter((w) => w.completed).length;
  const totalThisWeek = schedule.length;
  const weeklyProgressPercentage =
    totalThisWeek > 0 ? (completedThisWeek / totalThisWeek) * 100 : 0;

  const navigateWeek = (direction) => {
    setCurrentWeekStart(
      direction === "next"
        ? addWeeks(currentWeekStart, 1)
        : subWeeks(currentWeekStart, 1)
    );
  };

  if (!user) return <LoadingScreen />;

  const enrollmentProgressPct = activeEnrollment && activeProgram
    ? Math.min(100, Math.round(
        ((activeEnrollment.completed_workouts?.length || 0) /
          ((activeProgram.cycle_length || 1) * (activeProgram.num_cycles || activeProgram.duration_weeks || 4))) * 100
      ))
    : 0;

  return (
    <div className="p-4 md:p-6 bg-[#121212] min-h-screen transition-colors duration-300">

      {/* ── MOBILE LAYOUT ── */}
      <div className="xl:hidden">

        {/* Header */}
        <div className="flex items-center justify-end mb-5">
          <button
            onClick={handleBuildProgram}
            className="border border-[#2a2a2a] text-[10px] font-bold uppercase tracking-[0.15em] text-[#a0a0a0] px-3 py-2 rounded-lg hover:border-[rgba(204,255,0,0.4)] hover:text-[#ccff00] transition-colors"
          >
            Build Program
          </button>
        </div>

        {/* Week navigation */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => navigateWeek("prev")} className="p-1 text-[#555555] hover:text-white transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#555555]">
            {format(currentWeekStart, "MMM d")} — {format(addDays(currentWeekStart, 6), "MMM d")}
          </span>
          <button onClick={() => navigateWeek("next")} className="p-1 text-[#555555] hover:text-white transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Day strip */}
        <div className="flex gap-1.5 mb-5">
          {weekDays.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const isToday = isSameDay(day, new Date());
            const isSelected = isSameDay(day, selectedDay);
            const dp = getProgramForDate(day);
            const ds = getScheduleForDate(day);
            const allItems = [...dp, ...ds];
            const hasWorkout = allItems.length > 0;
            const isDone = hasWorkout && allItems.every(item => item.completed);
            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDay(day)}
                className={`flex-1 flex flex-col items-center pt-2 pb-2.5 rounded-xl transition-all ${
                  isSelected
                    ? "bg-[#ccff00]"
                    : isToday
                    ? "bg-[rgba(204,255,0,0.1)] border border-[rgba(204,255,0,0.25)]"
                    : "bg-[#1a1a1a] border border-[#2a2a2a]"
                }`}
              >
                <span className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${isSelected ? "text-[#121212]" : "text-[#555555]"}`}>
                  {format(day, "EEE")}
                </span>
                <span className={`text-base font-black leading-none ${isSelected ? "text-[#121212]" : isToday ? "text-[#ccff00]" : "text-white"}`}>
                  {format(day, "d")}
                </span>
                <div className={`w-1.5 h-1.5 rounded-full mt-2 ${
                  isDone ? "bg-[#4ade80]" :
                  hasWorkout ? (isSelected ? "bg-[#121212]" : "bg-[#ccff00]") :
                  "bg-transparent"
                }`} />
              </button>
            );
          })}
        </div>

        {/* Selected day card */}
        {(() => {
          const dp = getProgramForDate(selectedDay);
          const ds = getScheduleForDate(selectedDay);
          const orphans = getOrphanLogsForDate(selectedDay);
          const isToday = isSameDay(selectedDay, new Date());
          const dateLabel = format(selectedDay, "EEEE, MMMM d").toUpperCase();
          const macros = getMacrosForDate(selectedDay);
          const hasMacros = macros.calories > 0;

          const MacroBlock = () => {
            const rings = [
              { label: "Cal", value: Math.round(macros.calories), goal: profile?.daily_calorie_goal, stroke: "#f97316" },
              { label: "Pro", value: Math.round(macros.protein), unit: "g", goal: profile?.daily_protein_goal, stroke: "#60a5fa" },
              { label: "Carbs", value: Math.round(macros.carbs), unit: "g", goal: profile?.daily_carbs_goal, stroke: "#4ade80" },
              { label: "Fats", value: Math.round(macros.fats), unit: "g", goal: profile?.daily_fats_goal, stroke: "#facc15" },
            ];
            const size = 64, sw = 5, r = (size - sw) / 2, circ = 2 * Math.PI * r;
            return (
              <div className="mt-4 pt-4 border-t border-[#2a2a2a]">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#555555] mb-3">Nutrition</p>
                <div className="grid grid-cols-4 gap-2">
                  {rings.map(({ label, value, unit = "", goal, stroke }) => {
                    const pct = goal ? Math.min(1, value / goal) : 0;
                    const filled = pct * circ;
                    return (
                      <div key={label} className="flex flex-col items-center gap-1">
                        <div className="relative" style={{ width: size, height: size }}>
                          <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
                            <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#2a2a2a" strokeWidth={sw} />
                            {goal && (
                              <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={stroke} strokeWidth={sw}
                                strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round" />
                            )}
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-[11px] font-black tabular-nums text-white leading-none">{value}</span>
                            {unit && <span className="text-[8px] text-[#555555] leading-none">{unit}</span>}
                          </div>
                        </div>
                        <p className="text-[9px] font-bold uppercase tracking-wide text-[#555555]">{label}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          };

          if (dp.length === 0 && ds.length === 0 && orphans.length === 0) {
            return (
              <div className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] p-5 mb-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#555555] mb-2">{dateLabel}</p>
                <p className="text-2xl font-black uppercase tracking-tight text-[#333333] mb-4 text-center">Rest Day</p>
                {isToday && (
                  <button
                    onClick={() => setDayDetailDate(selectedDay)}
                    className="w-full text-xs font-bold uppercase tracking-[0.15em] text-[#555555] hover:text-[#ccff00] transition-colors text-center"
                  >
                    + Add Workout
                  </button>
                )}
                {hasMacros && <MacroBlock />}
              </div>
            );
          }

          return (
            <div className="space-y-3 mb-4">
              {dp.map((item, idx) => (
                <div key={`${item.programWorkoutId}-${item.cycle}`} className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] p-5">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#555555]">{dateLabel}</p>
                    {item.completed && <CheckCircle2 className="w-4 h-4 text-[#4ade80]" />}
                  </div>
                  <h2 className="text-xl font-black uppercase tracking-tight text-white leading-tight mb-3">
                    {item.title}
                  </h2>
                  {item.exercises?.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {item.exercises.slice(0, 5).map((ex, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[#ccff00] text-[11px] font-black tabular-nums w-5 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                            <span className="text-white text-xs font-semibold uppercase tracking-wide">{ex.name}</span>
                          </div>
                          <span className="text-[#555555] text-[11px] font-mono tabular-nums shrink-0 ml-2">
                            {Array.isArray(ex.sets)
                              ? `${ex.sets.length}×${ex.sets[0]?.reps ?? ex.reps ?? "?"}`
                              : `${ex.sets ?? "?"}×${ex.reps ?? "?"}`}
                          </span>
                        </div>
                      ))}
                      {item.exercises.length > 5 && (
                        <p className="text-[#555555] text-[11px] ml-7">+{item.exercises.length - 5} more exercises</p>
                      )}
                    </div>
                  )}
                  {item.completed ? (
                    <div className="flex items-center justify-center gap-1.5 py-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#4ade80]" />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#4ade80]">Completed</span>
                    </div>
                  ) : isToday && item.isCurrent ? (
                    <button
                      onClick={() => navigate(`/workout-detail?source=program&enrollmentId=${item.enrollmentId}&programWorkoutId=${item.programWorkoutId}`)}
                      className="w-full py-3 rounded-xl bg-[#ccff00] text-[#121212] text-[11px] font-black uppercase tracking-[0.2em] hover:bg-[#d4ff33] transition-colors"
                    >
                      Start Session
                    </button>
                  ) : null}
                  {hasMacros && idx === 0 && <MacroBlock />}
                </div>
              ))}

              {ds.map((item, idx) => {
                const workout = workouts.find(w => w.id === item.workout_id);
                if (!workout) return null;
                return (
                  <div key={item.id} className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] p-5">
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#555555] mb-1">{dateLabel}</p>
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-xl font-black uppercase tracking-tight text-white leading-tight">
                        {workout.title}
                      </h2>
                      {item.completed && <CheckCircle2 className="w-4 h-4 text-[#4ade80] shrink-0 ml-2" />}
                    </div>
                    {workout.exercises?.length > 0 && (
                      <div className="space-y-2 mb-4">
                        {workout.exercises.slice(0, 5).map((ex, i) => (
                          <div key={i} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-[#ccff00] text-[11px] font-black tabular-nums w-5 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                              <span className="text-white text-xs font-semibold uppercase tracking-wide">{ex.name}</span>
                            </div>
                            <span className="text-[#555555] text-[11px] font-mono tabular-nums shrink-0 ml-2">
                              {Array.isArray(ex.sets)
                                ? `${ex.sets.length}×${ex.sets[0]?.reps ?? ex.reps ?? "?"}`
                                : `${ex.sets ?? "?"}×${ex.reps ?? "?"}`}
                            </span>
                          </div>
                        ))}
                        {workout.exercises.length > 5 && (
                          <p className="text-[#555555] text-[11px] ml-7">+{workout.exercises.length - 5} more exercises</p>
                        )}
                      </div>
                    )}
                    {item.completed ? (
                      <div className="flex items-center justify-center gap-1.5 py-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#4ade80]" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#4ade80]">Completed</span>
                      </div>
                    ) : isToday ? (
                      <button
                        onClick={() => setDayDetailDate(selectedDay)}
                        className="w-full py-3 rounded-xl bg-[#ccff00] text-[#121212] text-[11px] font-black uppercase tracking-[0.2em] hover:bg-[#d4ff33] transition-colors"
                      >
                        Start Session
                      </button>
                    ) : null}
                    {hasMacros && dp.length === 0 && idx === 0 && <MacroBlock />}
                  </div>
                );
              })}

              {orphans.map((log, idx) => {
                const logWorkout = workouts.find(w => w.id === log.workout_id);
                return (
                  <div key={log.id} className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] p-4">
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#555555] mb-1">{dateLabel}</p>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#4ade80] shrink-0" />
                      <h2 className="text-base font-black uppercase tracking-tight text-[#4ade80]">
                        {logWorkout?.title || "Logged Workout"}
                      </h2>
                    </div>
                    {hasMacros && dp.length === 0 && ds.length === 0 && idx === 0 && <MacroBlock />}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Program progress */}
        {activeEnrollment && activeProgram && (
          <div className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] px-4 py-3 mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#555555]">
                Week {activeEnrollment.current_week || 1}/{activeProgram.num_cycles || activeProgram.duration_weeks || 4} — {activeProgram.name}
              </span>
              <span className="text-[9px] font-black text-[#ccff00] tabular-nums">{enrollmentProgressPct}%</span>
            </div>
            <div className="h-[3px] bg-[#2a2a2a] rounded-full overflow-hidden">
              <div className="h-full bg-[#ccff00] transition-all duration-500" style={{ width: `${enrollmentProgressPct}%` }} />
            </div>
          </div>
        )}

        {/* Workout Library // Backlog */}
        <div className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#2a2a2a] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#ccff00]" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#555555]">
                Workout Library // Backlog
              </span>
            </div>
            <span className="text-[10px] font-bold text-[#555555]">Count: {workouts.length}</span>
          </div>
          <div className="px-4 py-2 flex gap-1.5 border-b border-[#2a2a2a] overflow-x-auto [&::-webkit-scrollbar]:hidden">
            {["all", "strength", "cardio", "hiit"].map((type) => (
              <button
                key={type}
                onClick={() => setLibraryFilter(type)}
                className={`shrink-0 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.1em] transition-colors ${
                  libraryFilter === type
                    ? "bg-[rgba(204,255,0,0.12)] text-[#ccff00]"
                    : "text-[#555555] hover:text-[#a0a0a0]"
                }`}
              >
                {type === "hiit" ? "HIIT" : type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
          <div className="divide-y divide-[#2a2a2a]">
            {workouts.filter(w => libraryFilter === "all" || w.type === libraryFilter).length === 0 ? (
              <p className="text-xs text-[#555555] text-center py-6">No workouts yet.</p>
            ) : (
              workouts.filter(w => libraryFilter === "all" || w.type === libraryFilter).map((workout) => {
                const typeBadge = {
                  strength: "text-[#818cf8]",
                  cardio: "text-orange-400",
                  hiit: "text-[#f87171]",
                  recovery: "text-[#4ade80]",
                }[workout.type] || "text-[#555555]";
                return (
                  <button
                    key={workout.id}
                    onClick={() => setDayDetailDate(selectedDay)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#222222] transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[9px] font-black uppercase tracking-[0.15em] ${typeBadge}`}>
                          {workout.type?.toUpperCase() || "WORKOUT"}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-white truncate uppercase tracking-wide">{workout.title}</p>
                      {workout.exercises?.length > 0 && (
                        <p className="text-[10px] text-[#555555] truncate mt-0.5">
                          {workout.exercises.slice(0, 3).map(e => e.name).join(" · ")}
                          {workout.exercises.length > 3 && ` +${workout.exercises.length - 3}`}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#333333] shrink-0 ml-3" />
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── DESKTOP LAYOUT ── */}
      <div className="max-w-5xl mx-auto hidden xl:block">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
          <div>
            <h1 className="text-[22px] font-bold text-white leading-tight">Schedule</h1>
            <p className="text-[13px] text-[#a0a0a0] mt-0.5 mb-3">
              Drag workouts to schedule, or tap any day to manage
            </p>
            {totalThisWeek > 0 && (
              <div className="w-48">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#a0a0a0]">This week</span>
                  <span className="font-semibold text-[#ccff00]">
                    {completedThisWeek}/{totalThisWeek}
                  </span>
                </div>
                <div className="h-1.5 bg-[#202020] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#ccff00] transition-all duration-500"
                    style={{ width: `${weeklyProgressPercentage}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleScheduleWeek}>
              <CalendarIcon className="w-4 h-4" />
              Schedule This Week
            </Button>
            <Button variant="dark" onClick={handleBuildProgram}>
              <BookOpen className="w-4 h-4" />
              Build Program
            </Button>
          </div>
        </div>

        {/* Week Navigation */}
        {(() => {
          const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
          const isCurrentWeek = isSameDay(currentWeekStart, thisWeekStart);
          const viewingFuture = isBefore(thisWeekStart, currentWeekStart);
          const goToToday = () => setCurrentWeekStart(thisWeekStart);

          const todayButton = !isCurrentWeek && (
            <button
              onClick={goToToday}
              className="flex items-center gap-1 text-xs px-3 py-1 text-[#ccff00] hover:text-[#ccff00] font-semibold transition-colors"
            >
              {viewingFuture ? (
                <>
                  <Undo2 className="w-3.5 h-3.5" />
                  Today
                </>
              ) : (
                <>
                  Today
                  <Redo2 className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          );

          return (
            <div className="flex items-center justify-center gap-6 mb-6">
              <button
                onClick={() => navigateWeek("prev")}
                className="text-[#a0a0a0] hover:text-white transition-colors"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              <div className="flex items-center gap-3">
                {viewingFuture && todayButton}

                <div className="text-sm font-semibold text-white">
                  {format(currentWeekStart, "MMM d")} - {format(addDays(currentWeekStart, 6), "MMM d")}
                </div>

                {!viewingFuture && todayButton}
              </div>

              <button
                onClick={() => navigateWeek("next")}
                className="text-[#a0a0a0] hover:text-white transition-colors"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>
          );
        })()}

        {/* Week View */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 lg:gap-4 mb-8">
          {weekDays.map((day, index) => {
            const daySchedule = getScheduleForDate(day);
            const dayProgramWorkouts = getProgramForDate(day);
            const dayOrphanLogs = getOrphanLogsForDate(day);
            const dayCardio = getCardioForDate(day);
            const dayMacros = getMacrosForDate(day);
            const hasFood = dayMacros.calories > 0;
            const isToday = isSameDay(day, new Date());

            const caloriesPercentage = profile?.daily_calorie_goal
              ? Math.min(100, (dayMacros.calories / profile.daily_calorie_goal) * 100)
              : 0;
            const proteinPercentage = profile?.daily_protein_goal
              ? Math.min(100, (dayMacros.protein / profile.daily_protein_goal) * 100)
              : 0;
            const carbsPercentage = profile?.daily_carbs_goal
              ? Math.min(100, (dayMacros.carbs / profile.daily_carbs_goal) * 100)
              : 0;
            const fatsPercentage = profile?.daily_fats_goal
              ? Math.min(100, (dayMacros.fats / profile.daily_fats_goal) * 100)
              : 0;

            const dayDateStr = format(day, "yyyy-MM-dd");
            const isDragOver = draggedWorkout && dragOverDate === dayDateStr;
            return (
              <Card
                key={index}
                className={`bg-[#1a1a1a] text-white rounded-xl transition-all duration-200 cursor-pointer overflow-hidden min-h-[200px] ${
                  isDragOver
                    ? "border-2 border-[rgba(204,255,0,0.3)] scale-[1.02] bg-[rgba(204,255,0,0.1)]"
                    : isToday
                    ? "border-2 border-[rgba(204,255,0,0.3)]"
                    : "border-0 "
                }`}
                onClick={() => setDayDetailDate(day)}
                onDragOver={handleDragOver}
                onDragEnter={(e) => handleDragEnter(e, dayDateStr)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => {
                  e.stopPropagation();
                  handleDrop(e, day);
                }}
              >
                <CardHeader className="pb-4 pt-6">
                  <div className="text-center">
                    <div
                      className={`text-xs font-semibold uppercase tracking-widest ${
                        isToday ? "text-[#ccff00]" : "text-[#555555]"
                      }`}
                    >
                      {format(day, "EEE")}
                    </div>
                    <div
                      className={`text-4xl font-bold mt-2 ${
                        isToday ? "text-[#ccff00]" : "text-white"
                      }`}
                    >
                      {format(day, "d")}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 pt-0 pb-5 px-4">
                  {daySchedule.length === 0 && dayProgramWorkouts.length === 0 && dayOrphanLogs.length === 0 && dayCardio.length === 0 && !hasFood ? (
                    <div className="text-center py-6 text-xs text-[#a0a0a0]">
                      Tap or drag to add
                    </div>
                  ) : (
                    <>
                      {/* Compact workout dots */}
                      {(dayProgramWorkouts.length > 0 || daySchedule.length > 0 || dayOrphanLogs.length > 0) && (
                        <div className="flex flex-wrap gap-1.5 justify-center py-1">
                          {dayProgramWorkouts.map((item) => {
                            const cardioOnly = !item.exercises?.length && item.cardio_sessions?.length > 0;
                            return (
                              <div
                                key={`prog-${item.programWorkoutId}-${item.cycle}`}
                                title={`${item.title} (${item.programName})`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (item.isCurrent && !cardioOnly) {
                                    navigate(`/workout-detail?source=program&enrollmentId=${item.enrollmentId}&programWorkoutId=${item.programWorkoutId}`);
                                  }
                                }}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                                  item.completed
                                    ? "bg-[rgba(34,197,94,0.1)]/30"
                                    : cardioOnly
                                    ? "bg-[rgba(249,115,22,0.08)]"
                                    : item.isCurrent
                                    ? "bg-[rgba(204,255,0,0.1)] cursor-pointer"
                                    : "bg-[rgba(204,255,0,0.1)]"
                                }`}
                              >
                                {cardioOnly ? (
                                  <Activity className={`w-3.5 h-3.5 ${item.completed ? "text-[#4ade80]" : "text-orange-500"}`} />
                                ) : (
                                  <BookOpen className={`w-3.5 h-3.5 ${item.completed ? "text-[#4ade80]" : "text-[#ccff00]"}`} />
                                )}
                              </div>
                            );
                          })}
                          {dayOrphanLogs.map((log) => {
                            const logWorkout = workouts.find((w) => w.id === log.workout_id);
                            return (
                              <div
                                key={`log-${log.id}`}
                                title={logWorkout?.title || "Logged workout"}
                                className="w-8 h-8 rounded-lg flex items-center justify-center bg-[rgba(34,197,94,0.1)]/30"
                              >
                                <Dumbbell className="w-3.5 h-3.5 text-[#4ade80]" />
                              </div>
                            );
                          })}
                          {daySchedule.map((item) => {
                            const workout = workouts.find((w) => w.id === item.workout_id);
                            if (!workout) return null;
                            return (
                              <div
                                key={item.id}
                                title={workout.title}
                                draggable
                                onDragStart={(e) => {
                                  e.stopPropagation();
                                  handleDragStart(e, {
                                    ...workout,
                                    scheduleId: item.id,
                                    isLibrary: false,
                                  });
                                }}
                                onDragEnd={handleDragEnd}
                                onClick={(e) => e.stopPropagation()}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center cursor-move transition-colors ${
                                  item.completed
                                    ? "bg-[rgba(34,197,94,0.1)]/30"
                                    : "bg-[rgba(204,255,0,0.1)]"
                                }`}
                              >
                                <Dumbbell
                                  className={`w-3.5 h-3.5 ${
                                    item.completed
                                      ? "text-[#4ade80]"
                                      : "text-[#ccff00]"
                                  }`}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {dayCardio.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 justify-center py-1">
                          {dayCardio.map((session) => (
                            <div
                              key={session.id}
                              title={session.name}
                              className="w-8 h-8 rounded-lg flex items-center justify-center bg-orange-100"
                            >
                              <Activity className="w-3.5 h-3.5 text-orange-500" />
                            </div>
                          ))}
                        </div>
                      )}

                      {hasFood && (
                        <div className="mt-3 pt-3 border-t border-[#2a2a2a]">
                          <div className="flex justify-center">
                            <SegmentedCircularProgress
                              calories={caloriesPercentage}
                              protein={proteinPercentage}
                              carbs={carbsPercentage}
                              fats={fatsPercentage}
                              size={55}
                              strokeWidth={4}
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Workout Library & Programs */}
        <Card className="">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between mb-3">
              <CardTitle className="text-xl flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#ccff00]" />
                Library
              </CardTitle>
              <Tabs value={libraryFilter === "programs" ? "programs" : "workouts"} onValueChange={(v) => setLibraryFilter(v === "programs" ? "programs" : "all")}>
                <TabsList>
                  <TabsTrigger value="workouts" className="flex items-center gap-1.5">
                    <Dumbbell className="w-3.5 h-3.5" />
                    Workouts
                  </TabsTrigger>
                  <TabsTrigger value="programs" className="flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" />
                    Programs
                    {allPrograms.length > 0 && (
                      <Badge className="bg-[rgba(204,255,0,0.12)] text-[#ccff00] text-xs px-1.5 py-0 ml-0.5">{allPrograms.length}</Badge>
                    )}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            {libraryFilter !== "programs" && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-[#555555]">Drag workouts to schedule them</p>
                <div className="flex gap-1">
                  {["all", "strength", "cardio", "hiit"].map((type) => (
                    <button
                      key={type}
                      onClick={() => setLibraryFilter(type)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium dark:transition-colors ${
                        libraryFilter === type
                          ? "bg-[rgba(204,255,0,0.12)] text-[#ccff00]0 text-[#ccff00]"
                          : "text-[#555555] hover:bg-[#202020] text-[#a0a0a0] hover:bg-[#242424]"
                      }`}
                    >
                      {type === "hiit" ? "HIIT" : type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {libraryFilter === "programs" ? (
              /* Programs tab content */
              allPrograms.length === 0 ? (
                <div className="text-center py-8">
                  <BookOpen className="w-10 h-10 text-[#a0a0a0] mx-auto mb-3" />
                  <p className="text-sm text-[#555555]">
                    No programs yet. Use Auto-Schedule Week or the Program Builder (on the Workouts page) to create one.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {allPrograms.map((prog) => {
                    const progEnrollments = enrollments.filter(e => e.program_id === prog.id);
                    const enrollment = progEnrollments.find(e => e.status === 'active')
                      || progEnrollments.find(e => e.status === 'paused')
                      || progEnrollments[0];
                    const isActive = enrollment?.status === "active";
                    const totalWorkouts = (prog.cycle_length || 1) * (prog.num_cycles || 1);
                    const progressPct = enrollment
                      ? Math.min(100, Math.round(((enrollment.completed_workouts?.length || 0) / totalWorkouts) * 100))
                      : 0;
                    return (
                      <div key={prog.id} className="flex items-center justify-between p-4 rounded-lg border border-[#2a2a2a] hover:border-[rgba(204,255,0,0.3)] bg-[#202020] transition-all group">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-white truncate">{prog.name}</p>
                            {isActive && <Badge className="bg-[rgba(34,197,94,0.1)] text-[#4ade80] text-xs flex-shrink-0">Active</Badge>}
                            {enrollment?.status === "paused" && <Badge variant="outline" className="text-xs flex-shrink-0">Paused</Badge>}
                            {enrollment?.status === "cancelled" && <Badge variant="outline" className="text-xs flex-shrink-0 text-[#a0a0a0]">Cancelled</Badge>}
                            {!enrollment && <Badge variant="outline" className="text-xs flex-shrink-0 text-[#a0a0a0]">Not enrolled</Badge>}
                          </div>
                          <p className="text-xs text-[#555555] mb-2">
                            {prog.cycle_length}-day split · {prog.num_cycles} weeks
                            {enrollment && ` · Week ${enrollment.current_week || 1}, Day ${enrollment.current_day || 1}`}
                          </p>
                          {enrollment && (
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 bg-[#202020] rounded-full overflow-hidden w-32">
                                <div className="h-full bg-[rgba(204,255,0,0.08)]0 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                              </div>
                              <span className="text-xs text-[#a0a0a0]">{progressPct}%</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                          <Button variant="outline" size="sm" onClick={() => navigate(`/program/${prog.id}`)}>
                            View
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-[#f87171] hover:bg-[rgba(239,68,68,0.08)] hover:text-[#f87171] opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setDeleteTarget({ type: 'program', id: prog.id, name: prog.name })}
                            disabled={deleteProgramMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              /* Workout library content */
              workouts.length === 0 ? (
                <p className="text-sm text-[#555555] text-center py-8">
                  No workouts yet. Create some in the Workouts page.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {workouts.filter(w => libraryFilter === "all" || w.type === libraryFilter).map((workout) => (
                    <div
                      key={workout.id}
                      draggable
                      onDragStart={(e) =>
                        handleDragStart(e, { ...workout, isLibrary: true })
                      }
                      onDragEnd={handleDragEnd}
                      className="bg-[#202020] p-3 rounded-lg border border-[#2a2a2a] border-l-4 cursor-move hover:border-[rgba(204,255,0,0.3)] transition-all group relative"
                      style={{ borderLeftColor: { strength: '#4f46e5', cardio: '#f97316', hiit: '#ef4444', mixed: '#06b6d4' }[workout.type] || '#555555' }}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget({ type: 'workout', id: workout.id, name: workout.title });
                        }}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-[#a0a0a0] hover:text-[#f87171] p-1 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <h4 className="font-semibold text-sm mb-1.5 pr-6 text-white leading-snug">{workout.title}</h4>
                      {workout.exercises?.length > 0 && (
                        <p className="text-xs text-[#555555] mb-1.5 leading-snug">
                          {workout.exercises.slice(0, 3).map(e => e.name).join(' · ')}
                          {workout.exercises.length > 3 && <span className="text-[#444]"> +{workout.exercises.length - 3}</span>}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-[#555555]">
                        <Clock className="w-3 h-3" />
                        <span>{workout.duration_minutes} min</span>
                        {workout.exercises?.length > 0 && <span className="text-[#444]">·</span>}
                        {workout.exercises?.length > 0 && <span>{workout.exercises.length} exercises</span>}
                        <Badge className="ml-auto text-xs capitalize">{workout.type || 'general'}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </CardContent>
        </Card>

        {/* Day Detail Modal */}
        {dayDetailDate && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[10000] p-4"
            onClick={() => {
              setDayDetailDate(null);
              setSelectedWorkout("");
              setTimeOfDay("anytime");
            }}
          >
            <Card
              className="w-full max-w-2xl border-none max-h-[85vh] overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <CardHeader className="pb-4 border-b border-[#2a2a2a]">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <CalendarIcon className="w-5 h-5 text-[#ccff00]" />
                    {format(dayDetailDate, "EEEE, MMMM d")}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDayDetailDate(null);
                      setSelectedWorkout("");
                      setTimeOfDay("anytime");
                    }}
                    className="hover:bg-[#202020]"
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 py-6">
                {/* Workouts section */}
                <div>
                  <h3 className="font-semibold text-white flex items-center gap-2 mb-3">
                    <Dumbbell className="w-4 h-4 text-[#ccff00]" />
                    Workouts
                  </h3>
                  {/* Program workouts for this day */}
                  {getProgramForDate(dayDetailDate).length > 0 && (
                    <div className="space-y-2 mb-3">
                      {getProgramForDate(dayDetailDate).map((item) => (
                        <div
                          key={`prog-${item.programWorkoutId}-${item.cycle}`}
                          className={`rounded-xl border-2 transition-all ${
                            item.completed
                              ? "bg-green-50 border-green-300"
                              : item.isCurrent
                              ? "bg-[rgba(204,255,0,0.08)] border-[rgba(204,255,0,0.3)]"
                              : "bg-[#1a1a1a] border-[#2a2a2a]"
                          }`}
                        >
                          <div className="p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className={`p-2 rounded-lg flex-shrink-0 ${
                                  item.completed ? "bg-green-100" : "bg-[rgba(204,255,0,0.12)]"
                                }`}>
                                  <BookOpen className={`w-5 h-5 ${
                                    item.completed ? "text-green-600" : "text-[#ccff00]"
                                  }`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className={`font-bold text-base ${
                                    item.completed ? "line-through text-green-700" : "text-white"
                                  }`}>
                                    {item.title}
                                  </div>
                                  <div className="text-sm text-[#a0a0a0] flex items-center gap-2 mt-1 flex-wrap">
                                    <Badge variant="outline" className="text-xs bg-[rgba(204,255,0,0.1)] text-[#ccff00] border-[rgba(204,255,0,0.3)]">
                                      {item.programName}
                                    </Badge>
                                    <span className="text-xs">Cycle {item.cycle}, Day {item.dayIndex}</span>
                                    {item.exercises.length > 0 && <span className="text-xs">{item.exercises.length} exercises</span>}
                                  </div>
                                </div>
                              </div>
                              {item.isCurrent && !item.completed && item.exercises?.length > 0 && (
                                <Button
                                  size="sm"
                                  className="bg-[rgba(204,255,0,0.08)]0 flex-shrink-0"
                                  onClick={() =>
                                    navigate(`/workout-detail?source=program&enrollmentId=${item.enrollmentId}&programWorkoutId=${item.programWorkoutId}`)
                                  }
                                >
                                  Start
                                </Button>
                              )}
                              {item.completed && (
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                                  {!item.exercises?.length && item.cardio_sessions?.length > 0 && (
                                    <button
                                      className="text-xs text-[#a0a0a0] hover:text-[#f87171] transition-colors"
                                      disabled={unmarkCardioDone.isPending}
                                      onClick={() => unmarkCardioDone.mutate(item)}
                                    >
                                      Undo
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Orphan logs — program workouts logged after enrollment was cancelled */}
                  {getOrphanLogsForDate(dayDetailDate).length > 0 && (
                    <div className="space-y-2 mb-3">
                      {getOrphanLogsForDate(dayDetailDate).map((log) => {
                        const logWorkout = workouts.find((w) => w.id === log.workout_id);
                        const exerciseCount = Array.isArray(log.exercises) ? log.exercises.length : 0;
                        const durationMin = log.duration_seconds ? Math.round(log.duration_seconds / 60) : null;
                        return (
                          <div key={`log-${log.id}`} className="rounded-xl border-2 bg-green-50 border-green-300">
                            <div className="p-4">
                              <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-green-100">
                                  <Dumbbell className="w-5 h-5 text-green-600" />
                                </div>
                                <div className="flex-1">
                                  <div className="font-bold text-base line-through text-green-700">
                                    {logWorkout?.title || "Workout"}
                                  </div>
                                  <div className="text-sm text-[#a0a0a0] flex items-center gap-2 mt-1">
                                    {exerciseCount > 0 && <span className="text-xs">{exerciseCount} exercises</span>}
                                    {durationMin && <span className="text-xs">{durationMin} min</span>}
                                  </div>
                                </div>
                                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {getScheduleForDate(dayDetailDate).length === 0 && getProgramForDate(dayDetailDate).length === 0 && getOrphanLogsForDate(dayDetailDate).length === 0 ? (
                    <p className="text-sm text-[#555555] italic">
                      No workouts scheduled
                    </p>
                  ) : getScheduleForDate(dayDetailDate).length === 0 ? null : (
                    <div className="space-y-2">
                      {getScheduleForDate(dayDetailDate).map((item) => {
                        const workout = workouts.find((w) => w.id === item.workout_id);
                        if (!workout) return null;
                        return (
                          <div
                            key={item.id}
                            className={`rounded-xl border-2 transition-all ${
                              item.completed
                                ? "bg-green-50 border-green-300"
                                : "bg-[#1a1a1a] border-[#2a2a2a] hover:border-[rgba(204,255,0,0.3)]"
                            }`}
                          >
                            <div className="p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 flex-1">
                                  <div
                                    className={`p-2 rounded-lg ${
                                      item.completed
                                        ? "bg-green-100"
                                        : "bg-[rgba(204,255,0,0.12)]"
                                    }`}
                                  >
                                    <Dumbbell
                                      className={`w-5 h-5 ${
                                        item.completed
                                          ? "text-green-600"
                                          : "text-[#ccff00]"
                                      }`}
                                    />
                                  </div>
                                  <div className="flex-1">
                                    <div
                                      className={`font-bold text-base ${
                                        item.completed
                                          ? "line-through text-green-700"
                                          : "text-white"
                                      }`}
                                    >
                                      {workout.title}
                                    </div>
                                    <div className="text-sm text-[#a0a0a0] flex items-center gap-2 mt-1">
                                      {item.time_of_day && item.time_of_day !== "anytime" && (
                                        <span className="text-xs font-bold uppercase px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                                          {item.time_of_day}
                                        </span>
                                      )}
                                      {workout.duration_minutes && <><span className="font-medium">{workout.duration_minutes} min</span><span>-</span></>}
                                      <span className="capitalize font-medium">
                                        {workout.difficulty}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      toggleCompleteMutation.mutate({
                                        scheduleId: item.id,
                                        completed: !item.completed,
                                      })
                                    }
                                    className={`h-9 px-3 ${
                                      item.completed
                                        ? "text-green-600 hover:bg-green-100"
                                        : "text-[#a0a0a0] hover:bg-[#202020]"
                                    }`}
                                  >
                                    {item.completed ? (
                                      <CheckCircle2 className="w-5 h-5" />
                                    ) : (
                                      <Circle className="w-5 h-5" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      deleteScheduleMutation.mutate(item.id)
                                    }
                                    className="h-9 px-3 text-[#f87171] hover:bg-red-50"
                                  >
                                    <Trash2 className="w-5 h-5" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Quick add workout in day detail */}
                  <div className="mt-4 space-y-2">
                    {/* AM / PM / Anytime toggle */}
                    <div className="flex gap-1.5">
                      {["AM", "PM", "Anytime"].map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setTimeOfDay(opt.toLowerCase())}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                            timeOfDay === opt.toLowerCase()
                              ? "border-[rgba(204,255,0,0.3)] bg-[rgba(204,255,0,0.1)] text-[#ccff00] bg-[rgba(204,255,0,0.1)] text-[#ccff00]"
                              : "border-[#2a2a2a] text-[#555555] hover:border-[rgba(204,255,0,0.3)]"
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  <div className="flex gap-2">
                    <Select value={selectedWorkout} onValueChange={setSelectedWorkout}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Add a workout..." />
                      </SelectTrigger>
                      <SelectContent position="popper" className="max-h-[300px] z-[100]">
                        {workouts.map((workout) => (
                          <SelectItem key={workout.id} value={workout.id}>
                            {workout.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      disabled={!selectedWorkout}
                      onClick={() =>
                        scheduleWorkoutMutation.mutate({
                          workoutId: selectedWorkout,
                          date: format(dayDetailDate, "yyyy-MM-dd"),
                          time: timeOfDay,
                        })
                      }
                      className="bg-[rgba(204,255,0,0.08)]0"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  </div>
                </div>

                {/* Cardio section */}
                {(getCardioForDate(dayDetailDate).length > 0 || getProgramForDate(dayDetailDate).some(item => item.cardio_sessions?.length > 0)) && (
                  <div>
                    <h3 className="font-semibold text-white flex items-center gap-2 mb-3">
                      <Activity className="w-4 h-4 text-orange-500" />
                      Cardio
                    </h3>
                    <div className="space-y-2">
                      {/* Show logged Strava sessions if any exist, otherwise show planned program sessions */}
                      {getCardioForDate(dayDetailDate).length > 0
                        ? getCardioForDate(dayDetailDate).map((session) => {
                            const secs = session.moving_time_seconds;
                            const dur = secs ? (secs >= 3600 ? `${Math.floor(secs/3600)}h ${Math.floor((secs%3600)/60)}m` : `${Math.floor(secs/60)}m`) : null;
                            const miles = session.distance_meters > 0 ? (session.distance_meters / 1609.34).toFixed(2) : null;
                            return (
                              <div key={session.id} className="flex items-center gap-2 text-sm bg-[rgba(249,115,22,0.08)] border border-[rgba(249,115,22,0.2)] rounded-xl px-3 py-2.5 min-w-0 overflow-hidden">
                                <Activity className="w-4 h-4 text-orange-500 shrink-0" />
                                <span className="font-medium text-orange-700 truncate flex-1">{session.name}</span>
                                {miles && <span className="text-[#555555] shrink-0 text-xs">{miles} mi</span>}
                                {dur && <span className="text-[#555555] shrink-0 text-xs">{dur}</span>}
                                {session.average_heartrate && <span className="text-[#555555] shrink-0 text-xs">{Math.round(session.average_heartrate)} bpm</span>}
                              </div>
                            );
                          })
                        : getProgramForDate(dayDetailDate).flatMap(item =>
                            (item.cardio_sessions || []).map((c, i) => (
                              <div key={`prog-cardio-${item.programWorkoutId}-${i}`} className="flex items-center gap-2 text-sm bg-[rgba(249,115,22,0.08)] border border-[rgba(249,115,22,0.2)] rounded-xl px-3 py-2.5 min-w-0 overflow-hidden">
                                <Activity className="w-4 h-4 text-orange-500 shrink-0" />
                                <span className="font-medium text-orange-700 truncate flex-1">{c.title}</span>
                                <span className="text-[#555555] shrink-0 text-xs">{c.duration_minutes} min</span>
                                {c.time_of_day && c.time_of_day !== "anytime" && (
                                  <span className="uppercase text-[#a0a0a0] font-semibold shrink-0 text-xs">{c.time_of_day}</span>
                                )}
                                {item.isCurrent && !item.completed && !item.completedSessions?.has(i) && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="ml-auto flex-shrink-0 h-6 px-2 text-xs border-orange-300 text-orange-700 hover:bg-[rgba(249,115,22,0.08)]"
                                    disabled={markSessionDone.isPending}
                                    onClick={() => markSessionDone.mutate({ item, sessionIndex: i })}
                                  >
                                    Done
                                  </Button>
                                )}
                                {(item.completed || item.completedSessions?.has(i)) && (
                                  <button
                                    className="ml-auto shrink-0 hover:opacity-70 transition-opacity"
                                    title="Undo"
                                    disabled={unmarkSession.isPending}
                                    onClick={() => unmarkSession.mutate({ item, sessionIndex: i })}
                                  >
                                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                                  </button>
                                )}
                              </div>
                            ))
                          )
                      }
                    </div>
                  </div>
                )}

                {/* Nutrition section */}
                <div>
                  <h3 className="font-semibold text-white flex items-center gap-2 mb-3">
                    <Apple className="w-4 h-4 text-[#4ade80]" />
                    Nutrition
                  </h3>
                  {(() => {
                    const macros = getMacrosForDate(dayDetailDate);
                    if (macros.calories === 0) {
                      return (
                        <p className="text-sm text-[#555555] italic">
                          No food logged
                        </p>
                      );
                    }
                    return (
                      <div className="grid grid-cols-4 gap-4">
                        <div className="text-center p-4 bg-[rgba(249,115,22,0.08)] rounded-xl border border-[rgba(249,115,22,0.2)]">
                          <div className="flex items-center justify-center mb-2">
                            <Flame className="w-5 h-5 text-orange-600" />
                          </div>
                          <div className="text-2xl font-bold text-orange-700">
                            {Math.round(macros.calories)}
                          </div>
                          <div className="text-xs font-semibold text-orange-600 uppercase tracking-wide mt-1">
                            Calories
                          </div>
                          {profile?.daily_calorie_goal && (
                            <div className="text-xs text-orange-500 mt-1">
                              of {profile.daily_calorie_goal}
                            </div>
                          )}
                        </div>
                        <div className="text-center p-4 bg-[rgba(59,130,246,0.08)] rounded-xl border border-blue-200">
                          <div className="text-2xl font-bold text-[#60a5fa]">
                            {Math.round(macros.protein)}g
                          </div>
                          <div className="text-xs font-semibold text-[#60a5fa] uppercase tracking-wide mt-1">
                            Protein
                          </div>
                          {profile?.daily_protein_goal && (
                            <div className="text-xs text-[#60a5fa] mt-1">
                              of {profile.daily_protein_goal}g
                            </div>
                          )}
                        </div>
                        <div className="text-center p-4 bg-green-50 rounded-xl border border-[rgba(34,197,94,0.2)]">
                          <div className="text-2xl font-bold text-green-700">
                            {Math.round(macros.carbs)}g
                          </div>
                          <div className="text-xs font-semibold text-green-600 uppercase tracking-wide mt-1">
                            Carbs
                          </div>
                          {profile?.daily_carbs_goal && (
                            <div className="text-xs text-green-500 mt-1">
                              of {profile.daily_carbs_goal}g
                            </div>
                          )}
                        </div>
                        <div className="text-center p-4 bg-yellow-50 rounded-xl border border-yellow-200">
                          <div className="text-2xl font-bold text-yellow-700">
                            {Math.round(macros.fats)}g
                          </div>
                          <div className="text-xs font-semibold text-yellow-600 uppercase tracking-wide mt-1">
                            Fats
                          </div>
                          {profile?.daily_fats_goal && (
                            <div className="text-xs text-yellow-500 mt-1">
                              of {profile.daily_fats_goal}g
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Split Selector Modal — opens when user clicks Auto-Schedule Week */}
        {showSplitSelector && (
          <CustomSplitSelector
            daysPerWeek={profile?.days_per_week || 3}
            duration={profile?.workout_duration_preference || ""}
            onSelectSplit={handleSplitSelected}
            onCancel={() => { setShowSplitSelector(false); setScheduleMode(null); }}
          />
        )}
        {showScheduleChoiceModal && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[10000] p-4"
            onClick={() => setShowScheduleChoiceModal(false)}
          >
            <Card
              className="w-full max-w-sm border-none shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Schedule This Week</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setShowScheduleChoiceModal(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-sm text-[#555555] mt-1">How would you like to schedule your week?</p>
              </CardHeader>
              <CardContent className="space-y-3 pb-6">
                {/* Option A: use active program */}
                <button
                  onClick={handleScheduleActiveProgram}
                  className="w-full text-left p-4 rounded-xl border-2 border-[rgba(204,255,0,0.3)] bg-[rgba(204,255,0,0.08)] hover:border-[rgba(204,255,0,0.3)] hover:bg-[rgba(204,255,0,0.12)] transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-[rgba(204,255,0,0.12)] rounded-lg flex-shrink-0">
                      <BookOpen className="w-5 h-5 text-[#ccff00]" />
                    </div>
                    <div>
                      <p className="font-semibold text-white">Continue My Program</p>
                      <p className="text-xs text-[#555555] mt-0.5 truncate max-w-[220px]">
                        {activeProgram?.name} · Week {activeEnrollment?.current_week || 1}
                      </p>
                    </div>
                  </div>
                </button>

                {/* Option B: generate a fresh week */}
                <button
                  onClick={() => {
                    setShowScheduleChoiceModal(false);
                    setScheduleMode("week");
                    setShowSplitSelector(true);
                  }}
                  className="w-full text-left p-4 rounded-xl border-2 border-[#2a2a2a] bg-[#1a1a1a] hover:border-[rgba(204,255,0,0.2)] hover:bg-[#202020] transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-[#202020] rounded-lg flex-shrink-0">
                      <CalendarIcon className="w-5 h-5 text-[#a0a0a0]" />
                    </div>
                    <div>
                      <p className="font-semibold text-white">Generate New Week</p>
                      <p className="text-xs text-[#555555] mt-0.5">
                        Pick a split and auto-generate workouts for this week
                      </p>
                    </div>
                  </div>
                </button>
              </CardContent>
            </Card>
          </div>
        )}

        {showProgramStartModal && activeEnrollment && activeProgram && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[10000] p-4"
            onClick={() => setShowProgramStartModal(false)}
          >
            <Card
              className="w-full max-w-sm border-none shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Set Program Start Date</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setShowProgramStartModal(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-sm text-[#555555] mt-1">
                  Choose when <span className="font-medium text-white">{activeProgram.name}</span> begins.
                  All workouts will be rescheduled from this date.
                </p>
              </CardHeader>
              <CardContent className="space-y-5 pb-6">
                {/* Current vs new date info */}
                {activeEnrollment.start_date && (
                  <div className="flex items-center gap-2 text-xs text-[#555555] bg-[#1a1a1a] rounded-lg p-3">
                    <CalendarIcon className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>
                      Currently starts{" "}
                      <span className="font-medium text-white">
                        {format(new Date(activeEnrollment.start_date), "MMMM d, yyyy")}
                      </span>
                    </span>
                  </div>
                )}

                {/* Date input */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-white">New Start Date</label>
                  <input
                    type="date"
                    value={selectedProgramStartDate}
                    onChange={(e) => setSelectedProgramStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border-2 border-[#2a2a2a] focus:border-[rgba(204,255,0,0.3)] focus:outline-none text-white text-sm transition-colors"
                  />
                </div>

                {/* Preview: what week/day this maps to */}
                {selectedProgramStartDate && (
                  <div className="bg-[rgba(204,255,0,0.08)] border border-[rgba(204,255,0,0.3)] rounded-lg p-3 text-sm">
                    <p className="font-medium text-[#ccff00] mb-1">Schedule Preview</p>
                    <p className="text-[#ccff00] text-xs">
                      Program runs{" "}
                      <span className="font-semibold">
                        {format(new Date(selectedProgramStartDate), "MMM d")}
                      </span>
                      {" → "}
                      <span className="font-semibold">
                        {format(
                          addDays(
                            new Date(selectedProgramStartDate),
                            (activeProgram.cycle_length || 7) * (activeProgram.num_cycles || 1) - 1
                          ),
                          "MMM d, yyyy"
                        )}
                      </span>
                    </p>
                    <p className="text-[#ccff00] text-xs mt-1">
                      {(activeProgram.cycle_length || 7) * (activeProgram.num_cycles || 1)} total days ·{" "}
                      {activeProgram.num_cycles || 1} cycle{activeProgram.num_cycles !== 1 ? "s" : ""}
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowProgramStartModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 bg-[rgba(204,255,0,0.08)]0"
                    disabled={
                      !selectedProgramStartDate ||
                      selectedProgramStartDate === activeEnrollment.start_date ||
                      updateEnrollmentMutation.isPending
                    }
                    onClick={() =>
                      updateEnrollmentMutation.mutate({
                        enrollmentId: activeEnrollment.id,
                        startDate: selectedProgramStartDate,
                      })
                    }
                  >
                    {updateEnrollmentMutation.isPending ? "Saving..." : "Confirm Start Date"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Program Duration Modal — program mode only */}
        {showDurationModal && selectedSplit && (
          <ProgramDurationModal
            split={selectedSplit}
            goal={profile?.primary_goal || "general_fitness"}
            onConfirm={handleDurationConfirmed}
            onCancel={() => {
              setShowDurationModal(false);
              setSelectedSplit(null);
              setScheduleMode(null);
              setPendingExercisesPerDay(null);
            }}
          />
        )}

        {/* Approval Modal */}
        {showApprovalModal && pendingSchedule && (
          <WorkoutApprovalModal
            schedule={pendingSchedule.schedule}
            onApprove={handleApproveSchedule}
            onCancel={() => {
              setShowApprovalModal(false);
              setPendingSchedule(null);
              setScheduleMode(null);
              setPendingExercisesPerDay(null);
            }}
          />
        )}

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title={`Delete ${deleteTarget?.type === 'program' ? 'Program' : 'Workout'}?`}
          description={
            deleteTarget?.type === 'program'
              ? `This will remove "${deleteTarget.name}", your enrollment, and all scheduled workouts tied to it. This action cannot be undone.`
              : `This will permanently delete "${deleteTarget?.name}" and remove it from the schedule. This action cannot be undone.`
          }
          confirmText="Delete"
          cancelText="Cancel"
          variant="danger"
          onConfirm={() => {
            if (deleteTarget.type === 'program') {
              deleteProgramMutation.mutate(deleteTarget.id);
            } else {
              deleteWorkoutMutation.mutate(deleteTarget.id);
            }
            setDeleteTarget(null);
          }}
          loading={deleteProgramMutation.isPending || deleteWorkoutMutation.isPending}
        />
      </div>
    </div>
  );
}
