import { useState, useEffect, useRef, useMemo } from "react";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProfile } from "@/hooks/useUserQueries";
import { useWorkoutExercises } from "@/hooks/useWorkoutExercises";
import { useLogProgramWorkout } from "@/hooks/useProgramQueries";
import { useTutorial } from "@/hooks/useTutorial";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { LoadingScreen } from "@/components/ui/loading-spinner";
import { DIFFICULTY_COLORS } from "@/lib/constants";
import { queryKeys, invalidateSchedule, invalidateWorkoutLogs, invalidateWorkouts, invalidatePrograms } from "@/lib/queryKeys";
import { ArrowLeft, Clock, Target, Dumbbell, Edit, Copy, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { calculateDailyTargets, transferProgressionState } from "@/utils/programProgression";
import { checkRecoveryWindow, getWorkoutMuscleGroups } from "@/utils/fatigueManagement";
import { getTodayProgramWorkout } from "@/utils/programSchedule";
import { getWorkoutBodyData } from "@/utils/muscleVolumeUtils";
import MuscleHeatMap from "@/components/MuscleHeatMap";
import ExerciseCard from "@/components/workouts/ExerciseCard";
import WorkoutLoggingHeader from "@/components/workouts/WorkoutLoggingHeader";
import AddExerciseForm from "@/components/workouts/AddExerciseForm";
import ShareWorkoutModal from "@/components/workouts/ShareWorkoutModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useExerciseReactions } from "@/hooks/useExerciseReactions";
import { getLastExercisePerformance } from "@/utils/exerciseStats";
import { useWorkoutSession } from "@/hooks/useWorkoutSession";
import { analytics } from "@/lib/analytics.js";

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

export default function WorkoutDetail() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { nextStep } = useTutorial();
  const { showLocalNotification } = usePushNotifications(user?.id);
  const [workout, setWorkout] = useState(null);
  const [isLogging, setIsLogging] = useState(false);
  const [notes, setNotes] = useState("");
  const [startTime, setStartTime] = useState(null);
  const [showTitleInHeader, setShowTitleInHeader] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [recoveryWarnings, setRecoveryWarnings] = useState([]);
  const [restTimer, setRestTimer] = useState(null); // seconds remaining for rest (display only)
  const [restDuration, setRestDuration] = useState(90); // default rest duration
  const [muscleView, setMuscleView] = useState("anterior");
  const [resumeSession, setResumeSession] = useState(null); // session data to offer resume for
  const [sessionCheckDone, setSessionCheckDone] = useState(false); // true once the DB session check resolves
  const workoutCardRef = useRef(null);
  const restTimerRef = useRef(null); // setInterval handle
  const restTimerEndRef = useRef(null); // absolute end timestamp for the rest timer

  const { checkForActiveSession, createSession, saveProgress, completeSession, autoFinishSession, cancelSession, restoreSession } = useWorkoutSession();

  // Detect program source from URL params
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const isProgramSource = urlParams.get('source') === 'program';
  const enrollmentId = urlParams.get('enrollmentId');
  const programWorkoutId = urlParams.get('programWorkoutId');

  // Fetch user profile to get weight unit preference
  const { profile } = useProfile();
  const weightUnit = profile?.weight_unit || 'lbs';

  // Exercise reactions (like/dislike per exercise)
  const { getReaction, toggleReaction } = useExerciseReactions();

  // Fetch enrollment data (program mode only)
  const { data: enrollment } = useQuery({
    queryKey: ['enrollment', enrollmentId],
    queryFn: () => db.entities.ProgramEnrollment.get(enrollmentId),
    enabled: isProgramSource && !!enrollmentId,
  });

  // Fetch program workout data (program mode only)
  const { data: programWorkout } = useQuery({
    queryKey: ['programWorkout', programWorkoutId],
    queryFn: () => db.entities.ProgramWorkout.get(programWorkoutId),
    enabled: isProgramSource && !!programWorkoutId,
  });

  const logProgramWorkout = useLogProgramWorkout();

  // Exercise management
  const {
    exercises: exerciseLogs,
    setExercises: setExerciseLogs,
    updateSetData,
    addSet,
    removeSet,
    removeExercise,
    updateExerciseNotes,
    updateExerciseName,
    addExercise,
  } = useWorkoutExercises([]);

  // All exercise names in current workout (to avoid duplicates when replacing)
  const allExerciseNames = exerciseLogs.map(e => e.name);

  // Fetch all workout logs for exercise history and autofill
  const { data: allWorkoutLogs = [] } = useQuery({
    queryKey: queryKeys.workoutLogs(user?.id),
    queryFn: async () => {
      // In tutorial demo mode, return fake workout logs to show autofill feature
      if (isTutorialDemo) {
        return [
          {
            id: 'fake-log-1',
            workout_id: 'fake-workout',
            log_date: '2026-02-28',
            exercises: [
              {
                name: 'Bench Press',
                sets: [
                  { set_number: 1, weight: 135, reps: 10, completed: true },
                ],
              },
            ],
            created_by: user.id,
          },
        ];
      }

      return await db.entities.WorkoutLog.filter({
        created_by: user.id
      });
    },
    enabled: !!user && isLogging,
  });

  // All unique exercise names from history for AddExerciseForm autocomplete
  const allHistoryExerciseNames = useMemo(() => {
    const names = new Set();
    allWorkoutLogs.forEach(log => {
      (log.exercises || []).forEach(e => { if (e.name) names.add(e.name.trim()); });
    });
    return [...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }, [allWorkoutLogs]);

  // Check for tutorial demo mode
  const isTutorialDemo = urlParams.get('tutorial') === 'demo';

  // On mount, check for an in-progress session to offer resumption
  useEffect(() => {
    if (isTutorialDemo) {
      setSessionCheckDone(true);
      return;
    }
    const workoutId = urlParams.get('id');
    checkForActiveSession({ workoutId, programWorkoutId }).then((session) => {
      if (session) {
        const ageMs = Date.now() - new Date(session.start_time).getTime();
        if (ageMs >= 8 * 60 * 60 * 1000) {
          autoFinishSession(session.id);
        } else {
          setResumeSession(session);
        }
      }
      setSessionCheckDone(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save exercises to Supabase whenever a set is changed while logging
  useEffect(() => {
    if (isLogging && exerciseLogs.length > 0) {
      saveProgress(exerciseLogs, notes);
    }
  // We intentionally only watch exerciseLogs to fire after each set update
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseLogs]);

  useEffect(() => {
    const loadWorkout = async () => {
      const workoutId = urlParams.get('id');

      if (isTutorialDemo) {
        // Tutorial demo mode: create a simple demo workout with just 1 exercise and 1 set
        setWorkout({
          id: 'tutorial-demo',
          title: 'Upper Body Strength',
          description: 'Tutorial demo workout',
          type: 'strength',
          difficulty: 'intermediate',
          duration_minutes: 45,
          exercises: [
            { name: 'Bench Press', sets: 1, reps: '10', rest_seconds: 90, notes: null },
          ],
          equipment_needed: [],
          is_custom: false,
          created_by: user.id,
          _isTutorialDemo: true,
        });
      } else if (isProgramSource && programWorkout) {
        // Program mode: build a synthetic workout object from program workout data
        setWorkout({
          id: programWorkout.id,
          title: programWorkout.title,
          description: programWorkout.notes || '',
          type: programWorkout.type || 'strength',
          difficulty: 'intermediate',
          duration_minutes: null,
          exercises: (programWorkout.exercises || []).map((ex) => ({
            name: ex.name,
            sets: ex.sets || 3,
            reps: ex.rep_target || '10',
            rest_seconds: ex.rest_seconds || 180,
            notes: null,
          })),
          equipment_needed: [],
          is_custom: false,
          created_by: user.id,
          _isProgramWorkout: true,
        });
      } else if (workoutId) {
        const workouts = await db.entities.Workout.filter({
          id: workoutId,
          created_by: user.id
        });
        if (workouts.length > 0) {
          setWorkout(workouts[0]);
        }
      }
    };
    loadWorkout();
  }, [programWorkout, isProgramSource, isTutorialDemo]);

  // Calculate progression targets for each exercise (program mode)
  const progressionTargetsMap = useMemo(() => {
    if (!isProgramSource || !programWorkout?.exercises || !enrollment) return {};
    const map = {};
    for (const ex of programWorkout.exercises) {
      map[ex.name] = calculateDailyTargets(ex, enrollment.progression_state || {});
    }
    return map;
  }, [isProgramSource, programWorkout, enrollment]);

  // Compute recovery warnings as a derived value
  const computedRecoveryWarnings = useMemo(() => {
    if (isProgramSource && programWorkout?.exercises && enrollment) {
      const muscleGroups = getWorkoutMuscleGroups(programWorkout.exercises);
      return checkRecoveryWindow(muscleGroups, enrollment.progression_state || {});
    }
    return [];
  }, [isProgramSource, programWorkout, enrollment]);

  // Update recovery warnings when they change
  useEffect(() => {
    setRecoveryWarnings(computedRecoveryWarnings);
  }, [computedRecoveryWarnings]);

  // Initialize exercise logs when workout loads or logging mode starts
  useEffect(() => {
    if (workout && isLogging && exerciseLogs.length === 0) {
      let initialLogs;

      if (isProgramSource && programWorkout?.exercises && enrollment) {
        // Program mode: initialize with set types and target weights
        initialLogs = programWorkout.exercises.map((ex, index) => {
          const targets = progressionTargetsMap[ex.name];
          const numSets = ex.sets || 3;

          // Get last performance for autofill
          const lastPerf = getLastExercisePerformance(allWorkoutLogs, ex.name);

          // All sets default to working type at working weight
          const sets = Array.from({ length: numSets }, (_, setIndex) => ({
            set_number: setIndex + 1,
            reps: parseInt(ex.rep_target) || 10,
            weight: targets?.workingWeight || lastPerf?.lastWeight || 0,
            completed: false,
            rpe: null,
            set_type: 'working',
          }));

          return {
            name: ex.name,
            exercise_index: index,
            sets,
          };
        });
      } else {
        // Standard mode: autofill with last used weights
        initialLogs = workout.exercises?.map((exercise, index) => {
          const lastPerf = getLastExercisePerformance(allWorkoutLogs, exercise.name);

          return {
            name: exercise.name,
            exercise_index: index,
            sets: Array.from({ length: exercise.sets || 3 }, (_, setIndex) => ({
              set_number: setIndex + 1,
              reps: parseInt(exercise.reps) || 10,
              weight: lastPerf?.lastWeight || 0,
              completed: false,
              rpe: null,
              set_type: 'working',
            })),
          };
        }) || [];
      }

      setExerciseLogs(initialLogs);
      // startTime is set by handleStartLogging (or handleResumeSession for resumed sessions)
    }
  }, [workout, isLogging, isProgramSource, programWorkout, enrollment, progressionTargetsMap, allWorkoutLogs, exerciseLogs.length, setExerciseLogs]);

  // Observe when workout card scrolls out of view
  useEffect(() => {
    if (!workoutCardRef.current || !isLogging) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowTitleInHeader(!entry.isIntersecting);
      },
      { threshold: 0, rootMargin: '-80px 0px 0px 0px' }
    );

    observer.observe(workoutCardRef.current);
    return () => observer.disconnect();
  }, [isLogging]);

  // Rest timer — uses absolute end timestamp so it's accurate when tab is backgrounded or revisited
  useEffect(() => {
    const tick = () => {
      if (restTimerEndRef.current === null) return;
      const remaining = Math.max(0, Math.ceil((restTimerEndRef.current - Date.now()) / 1000));
      setRestTimer(remaining);
      if (remaining <= 0) {
        restTimerEndRef.current = null;
        showLocalNotification("Rest Over", "Time to get back to work!");
      }
    };
    restTimerRef.current = setInterval(tick, 500);
    return () => clearInterval(restTimerRef.current);
  }, []);

  const startRestTimer = (duration) => {
    setRestDuration(duration);
    restTimerEndRef.current = Date.now() + duration * 1000;
    setRestTimer(duration);
  };

  const skipRestTimer = () => {
    restTimerEndRef.current = null;
    setRestTimer(null);
  };

  const addRestTime = (seconds) => {
    if (restTimerEndRef.current !== null) {
      restTimerEndRef.current += seconds * 1000;
      setRestDuration(prev => prev + seconds);
    }
  };


  const cloneWorkoutMutation = useMutation({
    mutationFn: async () => {
      const clonedWorkout = await db.entities.Workout.create({
        title: `${workout.title} (Copy)`,
        description: workout.description,
        type: workout.type,
        difficulty: workout.difficulty,
        duration_minutes: workout.duration_minutes,
        exercises: workout.exercises,
        equipment_needed: workout.equipment_needed,
        is_custom: true,
        target_goals: workout.target_goals,
        created_by: user.id,
      });
      return clonedWorkout;
    },
    onSuccess: (clonedWorkout) => {
      invalidateWorkouts(queryClient);
      toast.success("Workout cloned successfully");
      navigate(`/create-workout?edit=${clonedWorkout.id}`);
    },
    onError: (error) => {
      toast.error("Failed to clone workout");
      console.error("Error cloning workout:", error);
    },
  });

  const saveWorkoutLogMutation = useMutation({
    mutationFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const durationSeconds = startTime ? Math.floor((Date.now() - startTime) / 1000) : null;

      // Resolve the real workout ID — program workouts use a synthetic ID
      // from the ProgramWorkout table, which doesn't exist in the workouts table
      let realWorkoutId = workout.id;

      if (workout._isProgramWorkout) {
        // Prefer source_workout_id (set when a library workout was dragged into the program)
        if (programWorkout?.source_workout_id) {
          realWorkoutId = programWorkout.source_workout_id;
        } else {
          // Search for existing workout by title match (reuse across cycles)
          const allUserWorkouts = await db.entities.Workout.filter({ created_by: user.id });
          const existingWorkout = allUserWorkouts.find(w => w.title === workout.title);

          if (existingWorkout) {
            realWorkoutId = existingWorkout.id;
          } else {
            // Create a new workout only if no match exists
            const created = await db.entities.Workout.create({
              title: workout.title,
              description: workout.description || '',
              type: workout.type || 'strength',
              difficulty: workout.difficulty || 'intermediate',
              duration_minutes: workout.duration_minutes || 45,
              exercises: workout.exercises || [],
              equipment_needed: [],
              is_custom: true,
              target_goals: [],
              created_by: user.id,
            });
            realWorkoutId = created.id;
          }
        }
      }

      // Check for existing schedule entry for today
      // For program workouts, don't create/update WorkoutSchedule since the program
      // tracks completion separately via enrollment.completed_workouts
      let scheduleId = null;

      if (!isProgramSource) {
        const existing = await db.entities.WorkoutSchedule.filter({
          workout_id: realWorkoutId,
          scheduled_date: today,
          created_by: user.id
        });

        if (existing.length > 0) {
          // Update existing schedule
          await db.entities.WorkoutSchedule.update(existing[0].id, {
            completed: true,
            completed_at: new Date().toISOString()
          });
          scheduleId = existing[0].id;
        } else {
          // Create new schedule entry
          const schedule = await db.entities.WorkoutSchedule.create({
            workout_id: realWorkoutId,
            scheduled_date: today,
            completed: true,
            completed_at: new Date().toISOString(),
            time_of_day: "anytime",
            created_by: user.id
          });
          scheduleId = schedule.id;
        }
      }

      // Create workout log
      await db.entities.WorkoutLog.create({
        created_by: user.id,
        workout_schedule_id: scheduleId,
        workout_id: realWorkoutId,
        log_date: today,
        exercises: exerciseLogs,
        duration_seconds: durationSeconds,
        notes: notes || null,
      });

      // Update reaction if exists
      const reactions = await db.entities.WorkoutReaction.filter({
        workout_id: workout.id,
        created_by: user.id
      });

      if (reactions.length > 0) {
        await db.entities.WorkoutReaction.update(reactions[0].id, {
          completed: true,
          completion_date: new Date().toISOString()
        });
      }
    },
    onSuccess: () => {
      completeSession();
      const durationMin = startTime ? Math.round((Date.now() - startTime) / 60000) : null;
      analytics.workoutCompleted(workout?.id, durationMin);
      invalidateSchedule(queryClient);
      invalidateWorkoutLogs(queryClient);

      // If program mode, update progression state and advance enrollment
      if (isProgramSource && enrollment && programWorkoutId) {
        // Calculate which cycle this workout belongs to from today's schedule
        const { program: activeProgram } = queryClient.getQueryData(['program', enrollment.program_id]) || {};
        const todayWorkout = activeProgram ? getTodayProgramWorkout(enrollment, activeProgram.workouts || []) : null;
        const workoutCycle = todayWorkout?.cycle;

        logProgramWorkout.mutate(
          {
            enrollmentId,
            programWorkoutId,
            exerciseLogs,
            enrollment,
            workoutCycle,
          },
          {
            onSuccess: (result) => {
              // Invalidate enrollment queries to update Dashboard and Schedule
              invalidatePrograms(queryClient);
              queryClient.invalidateQueries({ queryKey: ['enrollment', enrollmentId] });
              // Also invalidate schedule to ensure completion status updates immediately
              invalidateSchedule(queryClient);

              if (result.status === 'completed') {
                toast.success("Program completed! Congratulations!", { duration: 5000 });
              } else {
                toast.success("Workout logged! Progression updated.");
              }
              setShowShareModal(true);
            },
            onError: () => {
              toast.success("Workout logged! (Progression update failed)");
              setShowShareModal(true);
            },
          }
        );
      } else {
        toast.success("Workout logged successfully!");
        setShowShareModal(true);
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save workout log");
    },
  });

  // Auto-start logging for program workouts (skip if already completed)
  const isAlreadyCompleted = isProgramSource && enrollment?.completed_workouts?.some(
    cw => cw.program_workout_id === programWorkoutId
  );
  const shouldAutoStart = isProgramSource && workout && enrollment && programWorkout && !isLogging && !isAlreadyCompleted && sessionCheckDone && !resumeSession;
  const hasAutoStartedRef = useRef(false);

  useEffect(() => {
    if (shouldAutoStart && !hasAutoStartedRef.current) {
      hasAutoStartedRef.current = true;
      handleStartLogging();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoStart]);

  // Replace an exercise with a chosen alternative.
  const handleReplaceExercise = (oldName, newExercise) => {
    setExerciseLogs(prev => prev.map(ex => {
      if (ex.name !== oldName) return ex;

      const repsRaw = String(newExercise.reps ?? newExercise.rep_target ?? "10").trim();
      const rangeMatch = repsRaw.match(/^(\d+)\s*-\s*(\d+)/);
      const newReps = rangeMatch
        ? Math.round((parseInt(rangeMatch[1], 10) + parseInt(rangeMatch[2], 10)) / 2)
        : (parseInt(repsRaw, 10) || ex.sets[0]?.reps || 10);

      return {
        ...ex,
        name: newExercise.name,
        rest_seconds: newExercise.rest || newExercise.rest_seconds || ex.rest_seconds,
        sets: ex.sets.map((s, i) => ({
          ...s,
          set_number: i + 1,
          reps: newReps,
          weight: 0,
          completed: false,
          rpe: null,
          set_type: 'working',
        })),
      };
    }));

    // In program mode, transfer progression state so the replacement exercise
    // inherits the previous working weight as a starting reference.
    if (isProgramSource && enrollment) {
      const updatedState = transferProgressionState(
        enrollment.progression_state || {},
        oldName,
        newExercise.name
      );
      db.entities.ProgramEnrollment.update(enrollment.id, {
        progression_state: updatedState,
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['enrollment', enrollmentId] });
      });
    }
  };

  const handleStartLogging = () => {
    setIsLogging(true);
    // Advance tutorial if in demo mode
    if (isTutorialDemo) {
      nextStep();
      return;
    }
    const workoutId = isProgramSource ? null : urlParams.get('id');
    analytics.workoutStarted(workoutId || programWorkoutId, isProgramSource ? 'program' : 'library');
    const now = Date.now();
    setStartTime(now);
    createSession({
      workoutId,
      programWorkoutId: isProgramSource ? programWorkoutId : null,
      enrollmentId: isProgramSource ? enrollmentId : null,
      exercises: [],
      startTime: now,
    });
  };

  const handleResumeSession = () => {
    if (!resumeSession) return;
    restoreSession(resumeSession.id);
    setExerciseLogs(resumeSession.exercises || []);
    setStartTime(new Date(resumeSession.start_time).getTime());
    setNotes(resumeSession.notes || "");
    setIsLogging(true);
    setResumeSession(null);
  };

  const handleDismissResume = () => {
    // Cancel the old session and start fresh
    restoreSession(resumeSession.id);
    cancelSession();
    setResumeSession(null);
  };

  const handleCancelLogging = () => {
    if (isTutorialDemo) {
      // In tutorial mode, just go back to dashboard
      navigate('/dashboard');
      return;
    }
    cancelSession();
    setIsLogging(false);
    setExerciseLogs([]);
    setNotes("");
    setStartTime(null);
  };

  const [showIncompletePrompt, setShowIncompletePrompt] = useState(false);

  const hasIncompleteSets = () => {
    return exerciseLogs.some(ex => ex.sets?.some(s => !s.completed));
  };

  const markAllSetsComplete = () => {
    setExerciseLogs(prev => prev.map(ex => ({
      ...ex,
      sets: ex.sets.map(s => ({ ...s, completed: true })),
    })));
  };

  const handleSaveWorkoutLog = () => {
    if (isTutorialDemo) {
      // In tutorial mode, advance to next step and go back to dashboard
      nextStep();
      navigate('/dashboard');
      return;
    }
    if (hasIncompleteSets()) {
      setShowIncompletePrompt(true);
      return;
    }
    saveWorkoutLogMutation.mutate();
  };

  const handleIncompleteResponse = (autoCheck) => {
    setShowIncompletePrompt(false);
    if (autoCheck) {
      markAllSetsComplete();
    }
    // Small delay so state update flushes before mutation reads exerciseLogs
    setTimeout(() => saveWorkoutLogMutation.mutate(), 50);
  };

  if (!workout || !user || (isProgramSource && (!enrollment || !programWorkout))) {
    return <LoadingScreen />;
  }

  return (
    <div className="bg-slate-50 dark:bg-slate-950 min-h-screen relative transition-colors duration-300">
      {isLogging && (
        <WorkoutLoggingHeader
          workoutTitle={workout.title}
          showTitleInHeader={showTitleInHeader}
          onCancel={handleCancelLogging}
          onFinish={handleSaveWorkoutLog}
          isSaving={saveWorkoutLogMutation.isPending}
          startTime={startTime}
          restTimer={restTimer}
          restDuration={restDuration}
          onSkipRest={skipRestTimer}
          onAddRestTime={addRestTime}
        />
      )}

      <div className={`max-w-5xl mx-auto p-4 md:p-6 ${isLogging ? 'pt-[140px] pb-32 lg:pt-32 lg:pb-6' : ''}`}>
        {!isLogging && (
          <Button
            variant="ghost"
            onClick={() => navigate(isProgramSource && enrollment ? `/program/${enrollment.program_id}` : "/workouts")}
            className="mb-6"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {isProgramSource ? "Back to Program" : "Back to Workouts"}
          </Button>
        )}

        <Card ref={workoutCardRef} className={`border-none shadow-md mb-6 ${isLogging ? 'mt-4' : ''}`}>
          <div className="h-3 bg-primary-500"></div>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap gap-2">
                <Badge className={DIFFICULTY_COLORS[workout.difficulty]}>
                  {workout.difficulty}
                </Badge>
                <Badge variant="outline" className="capitalize">
                  {workout.type}
                </Badge>
                {workout.is_custom && (
                  <Badge className="bg-primary-100 text-primary-800">Custom</Badge>
                )}
                {isProgramSource && (
                  <Badge className="bg-primary-100 text-primary-800">Program Workout</Badge>
                )}
                {isLogging && (
                  <Badge className="bg-success-600 text-white shadow-sm">Logging Active</Badge>
                )}
              </div>
              {workout.exercises?.length > 0 && getWorkoutBodyData(workout.exercises).length > 0 && (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-400 uppercase tracking-wide">Muscles worked</span>
                  <div className="flex rounded-full overflow-hidden border border-slate-200 text-xs font-medium">
                    <button
                      onClick={() => setMuscleView("anterior")}
                      className={`px-2.5 py-0.5 transition-colors ${muscleView === "anterior" ? "bg-primary-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
                    >Front</button>
                    <button
                      onClick={() => setMuscleView("posterior")}
                      className={`px-2.5 py-0.5 transition-colors ${muscleView === "posterior" ? "bg-primary-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
                    >Back</button>
                  </div>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col md:flex-row md:gap-8">
            <div className="flex-1 min-w-0">
              {/* Title + description */}
              <CardTitle className="text-3xl mb-1">{workout.title}</CardTitle>
              {workout.description && (
                <p className="text-slate-600 mb-4">{workout.description}</p>
              )}
              <div className="flex flex-wrap gap-6 mb-6">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-primary-600" />
                    <div>
                      <div className="text-sm text-slate-600">Duration</div>
                      <div className="font-semibold">{workout.duration_minutes} minutes</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-primary-600" />
                    <div>
                      <div className="text-sm text-slate-600">Exercises</div>
                      <div className="font-semibold">{workout.exercises?.length || 0} exercises</div>
                    </div>
                  </div>
                </div>

                {workout.equipment_needed?.length > 0 && (
                  <div className="mb-6">
                    <h3 className="font-semibold mb-2">Equipment Needed</h3>
                    <div className="flex flex-wrap gap-2">
                      {workout.equipment_needed.map((equipment, index) => (
                        <Badge key={index} variant="secondary">
                          {equipment}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {!isLogging && (
                  <div className="space-y-3">
                    <Button
                      onClick={handleStartLogging}
                      className="w-full bg-primary-600 hover:bg-primary-700 text-lg py-6"
                      data-tutorial="start-logging-btn"
                    >
                      <Dumbbell className="w-5 h-5 mr-2" />
                      Start Logging Workout
                    </Button>
                    {workout.created_by === user.id && (
                      <div className="flex gap-2">
                        <Button
                          onClick={() => navigate(`/create-workout?edit=${workout.id}`)}
                          variant="outline"
                          className="flex-1"
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          Edit Workout
                        </Button>
                        <Button
                          onClick={() => cloneWorkoutMutation.mutate()}
                          variant="outline"
                          className="flex-1"
                          disabled={cloneWorkoutMutation.isPending}
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          Clone
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right: muscle figure sidebar */}
              {workout.exercises?.length > 0 && (() => {
                const bodyData = getWorkoutBodyData(workout.exercises);
                return bodyData.length > 0 ? (
                  <div className="mt-6 md:mt-0 md:w-64 md:shrink-0 flex flex-col">
                    <MuscleHeatMap data={bodyData} view={muscleView} className="flex-1" maxWidth={220} />
                  </div>
                ) : null;
              })()}
          </CardContent>
        </Card>

        {isLogging ? (
          // Logging Mode - Show editable exercise logs
          <div className="space-y-6">
            {/* Recovery warnings (program mode) */}
            {recoveryWarnings.length > 0 && (
              <Card className="border-amber-200 bg-amber-50 shadow-lg">
                <CardContent className="py-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-amber-800 text-sm">Recovery Advisory</p>
                      {recoveryWarnings.map((w, i) => (
                        <p key={i} className="text-sm text-amber-700 mt-1">{w.message}</p>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {exerciseLogs.map((exerciseLog, exerciseIndex) => {
              const lastPerformance = getLastExercisePerformance(allWorkoutLogs, exerciseLog.name);
              const programEx = isProgramSource ? programWorkout?.exercises?.[exerciseIndex] : null;
              const targets = programEx ? progressionTargetsMap[programEx.name] : null;
              return (
                <div key={exerciseIndex} data-tutorial={exerciseIndex === 0 ? "exercise-card" : undefined}>
                  <ExerciseCard
                    exercise={exerciseLog}
                    exerciseIndex={exerciseIndex}
                    weightUnit={weightUnit}
                    onUpdateSet={(exIdx, setIdx, field, value) => {
                      updateSetData(exIdx, setIdx, field, value);
                      // Advance tutorial when first set is completed in demo mode
                      if (isTutorialDemo && exIdx === 0 && setIdx === 0 && field === 'completed' && value === true) {
                        nextStep();
                      }
                    }}
                    onAddSet={addSet}
                    onRemoveSet={removeSet}
                    onRemoveExercise={removeExercise}
                    onUpdateNotes={updateExerciseNotes}
                    onUpdateName={updateExerciseName}
                    originalExercise={workout.exercises[exerciseIndex]}
                    lastPerformance={lastPerformance}
                    programExercise={programEx}
                    progressionTargets={targets}
                    currentReaction={getReaction(exerciseLog.name)}
                    onReactionChange={(name, reaction) => toggleReaction({ exerciseName: name, reaction })}
                    onReplaceExercise={handleReplaceExercise}
                    dayFocus={workout.focus || "Full Body"}
                    goal={profile?.primary_goal || "general_fitness"}
                    fitnessLevel={profile?.fitness_level || "intermediate"}
                    equipment={profile?.available_equipment || []}
                    currentWeekExerciseNames={allExerciseNames}
                    allExerciseNames={allHistoryExerciseNames}
                    onStartRestTimer={startRestTimer}
                    showRIR={profile?.show_rir ?? true}
                  />
                </div>
              );
            })}

            {/* Add Exercise Form */}
            <AddExerciseForm onAdd={addExercise} exerciseNames={allHistoryExerciseNames} />

            {/* Notes Section */}
            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg">Workout Notes (Optional)</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="How did the workout feel? Any personal records? Notes for next time..."
                  rows={3}
                />
              </CardContent>
            </Card>
          </div>
        ) : (
          // View Mode - Show exercises read-only
          <Card className="border-none shadow-lg">
            <CardHeader>
              <CardTitle>Exercises</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {workout.exercises?.map((exercise, index) => {
                const isLogFormat = Array.isArray(exercise.sets);
                return (
                  <Card key={index} className="bg-slate-50">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary-500 flex items-center justify-center text-white font-bold flex-shrink-0">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-lg mb-2">{exercise.name}</h4>
                          {isLogFormat ? (
                            <table className="w-full text-sm mt-2">
                              <thead>
                                <tr className="border-b border-slate-200">
                                  <th className="text-left py-2 px-2">Set</th>
                                  <th className="text-left py-2 px-2">Weight</th>
                                  <th className="text-left py-2 px-2">Reps</th>
                                </tr>
                              </thead>
                              <tbody>
                                {exercise.sets.map((set, si) => (
                                  <tr key={si} className="border-b border-slate-100">
                                    <td className="py-2 px-2 font-medium">{set.set_number}</td>
                                    <td className="py-2 px-2">{set.weight} {weightUnit}</td>
                                    <td className="py-2 px-2">{set.reps}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                              <div>
                                <span className="font-medium">Sets:</span> {exercise.sets}
                              </div>
                              <div>
                                <span className="font-medium">Reps:</span> {exercise.reps}
                              </div>
                              <div>
                                <span className="font-medium">Rest:</span> {exercise.rest_seconds}s
                              </div>
                            </div>
                          )}
                          {exercise.notes && (
                            <p className="text-sm text-slate-600 mt-2 italic">{exercise.notes}</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Resume previous session prompt */}
      <Dialog open={!!resumeSession} onOpenChange={(open) => { if (!open) handleDismissResume(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Resume Workout?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            You have an unfinished session started {formatTimeAgo(resumeSession?.start_time)}. Would you like to pick up where you left off?
          </p>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={handleDismissResume}>
              Start Fresh
            </Button>
            <Button className="flex-1 bg-primary-600 hover:bg-primary-700" onClick={handleResumeSession}>
              Resume
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Incomplete sets prompt */}
      <Dialog open={showIncompletePrompt} onOpenChange={(open) => { if (!open) setShowIncompletePrompt(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Incomplete Sets</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Some sets haven't been checked off. Would you like to mark them all as complete?
          </p>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => handleIncompleteResponse(false)}>
              Leave As-Is
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => handleIncompleteResponse(true)}>
              Complete All
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {showShareModal && (
        <ShareWorkoutModal
          workoutTitle={workout.title}
          exercises={exerciseLogs}
          onClose={() => {
            setShowShareModal(false);
            const returnTo = isProgramSource && enrollment
              ? `/program/${enrollment.program_id}`
              : "/dashboard";
            navigate(returnTo);
          }}
          onShared={() => {
            setShowShareModal(false);
            const returnTo = isProgramSource && enrollment
              ? `/program/${enrollment.program_id}`
              : "/dashboard";
            navigate(returnTo);
          }}
        />
      )}
    </div>
  );
}
