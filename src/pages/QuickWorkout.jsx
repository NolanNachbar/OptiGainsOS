import { useState, useEffect, useRef, useMemo } from "react";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProfile } from "@/hooks/useUserQueries";
import { useWorkoutExercises } from "@/hooks/useWorkoutExercises";
import { useWorkoutSession } from "@/hooks/useWorkoutSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingScreen } from "@/components/ui/loading-spinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { queryKeys, invalidateSchedule, invalidateWorkoutLogs } from "@/lib/queryKeys";
import { Dumbbell, Pencil, Check } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import ExerciseCard from "@/components/workouts/ExerciseCard";
import WorkoutLoggingHeader from "@/components/workouts/WorkoutLoggingHeader";
import AddExerciseForm from "@/components/workouts/AddExerciseForm";
import { getLastExercisePerformance } from "@/utils/exerciseStats";
import { EXERCISE_DB } from "@/ml/exerciseDB";
import { getCoachingPhase, getPreSessionInsight } from "@/utils/coachingEngine";
import PreSessionInsightCard from "@/components/workouts/PreSessionInsightCard";

const formatTimeAgo = (startTimeStr) => {
  if (!startTimeStr) return "recently";
  const ms = Date.now() - new Date(startTimeStr).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
};

export default function QuickWorkout() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [startTime, setStartTime] = useState(Date.now());
  const [workoutTitle, setWorkoutTitle] = useState(`Quick Workout - ${format(new Date(), "MMM d, yyyy")}`);
  const [editingTitle, setEditingTitle] = useState(false);
  const [showTitleInHeader, setShowTitleInHeader] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [resumeSession, setResumeSession] = useState(null);
  const workoutTitleRef = useRef(null);
  const sessionInitialized = useRef(false);

  const { checkForActiveSession, createSession, saveProgress, completeSession, autoFinishSession, cancelSession, restoreSession } = useWorkoutSession();

  const { profile } = useProfile();
  const weightUnit = profile?.weight_unit || 'lbs';
  const [insightDismissed, setInsightDismissed] = useState(false);
  // exercise name → suggested weight from accepted pre-session insight
  const [insightSuggestions, setInsightSuggestions] = useState({});

  // Fetch all workout logs for autofill
  const { data: allWorkoutLogs = [] } = useQuery({
    queryKey: queryKeys.workoutLogs(user?.id),
    queryFn: async () => {
      return await db.entities.WorkoutLog.filter({
        created_by: user.id
      });
    },
    enabled: !!user,
  });

  const coachingPhase = useMemo(() => getCoachingPhase(allWorkoutLogs), [allWorkoutLogs]);
  const preSessionInsight = useMemo(() => {
    if (coachingPhase < 2 || insightDismissed) return null;
    return getPreSessionInsight(allWorkoutLogs);
  }, [allWorkoutLogs, coachingPhase, insightDismissed]);

  const handleInsightAccept = (insight) => {
    setInsightSuggestions(prev => ({
      ...prev,
      [insight.exerciseName.toLowerCase()]: insight.suggestedWeight,
    }));
    setInsightDismissed(true);
  };

  const handleApplyCoachingSuggestion = (exerciseIdx, setIdx, weight) => {
    updateSetData(exerciseIdx, setIdx, 'weight', weight);
  };

  // All exercise names: DB base + user history, deduped and sorted
  const allHistoryExerciseNames = useMemo(() => {
    const names = new Set(EXERCISE_DB.map(e => e.name));
    allWorkoutLogs.forEach(log => {
      (log.exercises || []).forEach(e => { if (e.name) names.add(e.name.trim()); });
    });
    return [...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }, [allWorkoutLogs]);

  // Exercise management
  const {
    exercises,
    setExercises,
    updateSetData,
    addSet,
    removeSet,
    removeExercise,
    updateExerciseNotes,
    updateExerciseName,
    addExercise: addExerciseRaw,
  } = useWorkoutExercises([]);

  // Wrapper for addExercise that autofills weight from last performance or insight suggestion
  const addExercise = (exerciseName) => {
    const suggestion = insightSuggestions[exerciseName.toLowerCase()];
    const lastPerf = getLastExercisePerformance(allWorkoutLogs, exerciseName);
    const defaultWeight = suggestion || lastPerf?.lastWeight || 0;
    addExerciseRaw(exerciseName, defaultWeight);
  };

  // Observe when workout title scrolls out of view
  useEffect(() => {
    if (!workoutTitleRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowTitleInHeader(!entry.isIntersecting);
      },
      { threshold: 0, rootMargin: '-80px 0px 0px 0px' }
    );

    observer.observe(workoutTitleRef.current);
    return () => observer.disconnect();
  }, []);

  // On mount: check for an existing in-progress quick workout session
  useEffect(() => {
    if (!user || sessionInitialized.current) return;
    sessionInitialized.current = true;
    checkForActiveSession({}).then((session) => {
      if (session) {
        const ageMs = Date.now() - new Date(session.start_time).getTime();
        if (ageMs >= 8 * 60 * 60 * 1000) {
          autoFinishSession(session.id);
          createSession({ exercises: [], startTime });
        } else {
          setResumeSession(session);
        }
      } else {
        createSession({ exercises: [], startTime });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Auto-save after every set update (fires when exercises state changes)
  useEffect(() => {
    if (exercises.length > 0) {
      saveProgress(exercises, null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises]);

  const saveWorkoutLogMutation = useMutation({
    mutationFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);

      // 1. Create the Workout entity
      const workout = await db.entities.Workout.create({
        title: workoutTitle,
        description: "Quick workout session",
        duration_minutes: Math.ceil(durationSeconds / 60),
        exercises: exercises,
        created_by: user.id,
      });

      // 2. Create the WorkoutSchedule entry for today
      const scheduleEntry = await db.entities.WorkoutSchedule.create({
        workout_id: workout.id,
        scheduled_date: today,
        time_of_day: "anytime",
        completed: true,
        completed_at: new Date().toISOString(),
        created_by: user.id,
      });

      // 3. Create the WorkoutLog linked to both
      await db.entities.WorkoutLog.create({
        created_by: user.id,
        workout_schedule_id: scheduleEntry.id,
        workout_id: workout.id,
        log_date: today,
        exercises: exercises,
        duration_seconds: durationSeconds,
        notes: null,
      });
    },
    onSuccess: () => {
      completeSession();
      invalidateSchedule(queryClient);
      invalidateWorkoutLogs(queryClient);
      toast.success("Workout logged successfully!");
      navigate("/dashboard");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save workout log");
    },
  });

  const handleResumeSession = () => {
    if (!resumeSession) return;
    restoreSession(resumeSession.id);
    setExercises(resumeSession.exercises || []);
    setStartTime(new Date(resumeSession.start_time).getTime());
    setResumeSession(null);
  };

  const handleDismissResume = () => {
    restoreSession(resumeSession.id);
    cancelSession();
    setResumeSession(null);
    createSession({ exercises: [], startTime: Date.now() });
  };

  const handleSave = () => {
    if (exercises.length === 0) {
      toast.error("Add at least one exercise before saving");
      return;
    }
    saveWorkoutLogMutation.mutate();
  };

  if (!user) {
    return <LoadingScreen />;
  }

  return (
    <div className="bg-[#1a1a1a]  min-h-screen relative transition-colors duration-300">
      <WorkoutLoggingHeader
        workoutTitle={workoutTitle}
        showTitleInHeader={showTitleInHeader}
        onCancel={() => navigate("/dashboard")}
        onFinish={handleSave}
        isSaving={saveWorkoutLogMutation.isPending}
      />

      <div className="max-w-5xl mx-auto p-4 md:p-6 pt-[140px] lg:pt-32 pb-40 lg:pb-6">
        <div ref={workoutTitleRef} className="mb-6">
          <div className="flex items-center gap-2">
            <Dumbbell className="w-6 h-6 text-white" />
            {editingTitle ? (
              <Input
                autoFocus
                value={workoutTitle}
                onChange={(e) => setWorkoutTitle(e.target.value)}
                onBlur={() => setEditingTitle(false)}
                onKeyDown={(e) => e.key === 'Enter' && setEditingTitle(false)}
                className="text-2xl font-bold h-10 flex-1"
              />
            ) : (
              <h1 className="text-2xl font-bold text-white">{workoutTitle}</h1>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditingTitle(editingTitle ? false : true)}
              className="h-8 w-8 text-[#a0a0a0] hover:text-white"
            >
              {editingTitle ? (
                <Check className="w-4 h-4 text-[#4ade80]" />
              ) : (
                <Pencil className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-[#a0a0a0] text-sm mt-1">Add exercises as you go</p>
        </div>

        {/* Pre-session insight card (Phase 2+) */}
        {preSessionInsight && (
          <PreSessionInsightCard
            insight={preSessionInsight}
            onAccept={handleInsightAccept}
            onDismiss={() => setInsightDismissed(true)}
          />
        )}

        {/* Exercise List */}
        <div className="space-y-4">
          {exercises.map((exercise, exerciseIndex) => {
            const lastPerformance = getLastExercisePerformance(allWorkoutLogs, exercise.name);
            return (
              <ExerciseCard
                key={exerciseIndex}
                exercise={exercise}
                exerciseIndex={exerciseIndex}
                weightUnit={weightUnit}
                onUpdateSet={updateSetData}
                onAddSet={addSet}
                onRemoveSet={removeSet}
                onRemoveExercise={removeExercise}
                onUpdateNotes={updateExerciseNotes}
                onUpdateName={updateExerciseName}
                lastPerformance={lastPerformance}
                allExerciseNames={allHistoryExerciseNames}
                workoutLogs={allWorkoutLogs}
                coachingPhase={coachingPhase}
                onApplyCoachingSuggestion={handleApplyCoachingSuggestion}
              />
            );
          })}

          {/* Add Exercise Form */}
          <AddExerciseForm
            onAdd={addExercise}
            showCloseButton={exercises.length > 0}
            exerciseNames={allHistoryExerciseNames}
          />

        </div>
      </div>

      {/* Resume previous session prompt */}
      <Dialog open={!!resumeSession} onOpenChange={(open) => { if (!open) handleDismissResume(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Resume Workout?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#a0a0a0] ">
            You have an unfinished session started {formatTimeAgo(resumeSession?.start_time)}. Would you like to pick up where you left off?
          </p>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={handleDismissResume}>
              Start Fresh
            </Button>
            <Button className="flex-1 bg-brand hover:bg-brand" onClick={handleResumeSession}>
              Resume
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
