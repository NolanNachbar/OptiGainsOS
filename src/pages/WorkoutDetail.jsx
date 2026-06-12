import { useState, useEffect, useRef, useMemo } from "react";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProfile } from "@/hooks/useUserQueries";
import { useWorkoutExercises } from "@/hooks/useWorkoutExercises";
import { useLogProgramWorkout } from "@/hooks/useProgramQueries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { LoadingScreen } from "@/components/ui/loading-spinner";
import { queryKeys, invalidateSchedule, invalidateWorkoutLogs, invalidateWorkouts, invalidatePrograms } from "@/lib/queryKeys";
import { ArrowLeft, Clock, Target, Dumbbell, Edit, Copy, AlertTriangle, Activity } from "lucide-react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getLastExercisePerformance } from "@/utils/exerciseStats";
import { useWorkoutSession } from "@/hooks/useWorkoutSession";

const isRunEx = (ex) => /\b(run|sprint|cardio|zone ?2)\b/i.test(ex.name || '');

// Epley e1RM scaling with progressive overload projection.
// If last session hit target reps (or exceeded them), nudge the suggested weight
// up by 2.5 lbs — the smallest standard plate increment.
// Rounds to nearest 2.5 so suggested weights are always rackable.
const scaleWeightToReps = (lastWeight, lastReps, targetReps) => {
  if (!lastWeight || !lastReps || lastReps <= 0 || targetReps <= 0) return lastWeight || 0;
  const e1rm = lastWeight * (1 + 0.0333 * lastReps);
  const scaled = e1rm / (1 + 0.0333 * targetReps);
  const overload = lastReps >= targetReps ? 2.5 : 0;
  return Math.round((scaled + overload) / 2.5) * 2.5;
};

// Use the LOWER end of rep ranges (e.g. "8-12" → 8) so the autofill defaults
// to the heavier end of the rep range. Default is 8, not 10.
const parseRepTarget = (repTarget) => {
  const s = String(repTarget || '8').trim();
  const m = s.match(/^(\d+)\s*[-–]\s*(\d+)/);
  return m ? parseInt(m[1], 10) : (parseInt(s, 10) || 8);
};

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
  const { showLocalNotification } = usePushNotifications(user?.id);
  const [workout, setWorkout] = useState(null);
  const [workoutNotFound, setWorkoutNotFound] = useState(false);
  const [isLogging, setIsLogging] = useState(false);
  const [preWorkoutNotes, setPreWorkoutNotes] = useState("");
  const [postWorkoutNotes, setPostWorkoutNotes] = useState("");
  const [showPostWorkoutDialog, setShowPostWorkoutDialog] = useState(false);
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

  // Fetch enrollment data (program mode only)
  const { data: enrollment, isError: enrollmentError } = useQuery({
    queryKey: ['enrollment', enrollmentId],
    queryFn: () => db.entities.ProgramEnrollment.get(enrollmentId),
    enabled: isProgramSource && !!enrollmentId,
  });

  // Fetch program workout data (program mode only)
  const { data: programWorkout, isError: programWorkoutError } = useQuery({
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
    enabled: !!user,
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
      saveProgress(exerciseLogs, preWorkoutNotes);
    }
  // We intentionally watch both exerciseLogs and preWorkoutNotes
  }, [exerciseLogs, preWorkoutNotes]);

  useEffect(() => {
    const loadWorkout = async () => {
      const workoutId = urlParams.get('id');

      if (isTutorialDemo) {
        // Tutorial demo mode: create a simple demo workout with just 1 exercise and 1 set
        setWorkout({
          id: 'tutorial-demo',
          title: 'Upper Body Strength',
          description: 'Tutorial demo workout',
          focus: 'strength',
          duration_minutes: 45,
          exercises: [
            { name: 'Bench Press', sets: 1, reps: '10', rest_seconds: 90, notes: null },
          ],
          created_by: user.id,
          _isTutorialDemo: true,
        });
      } else if (isProgramSource && programWorkout) {
        // Program mode: build a synthetic workout object from program workout data.
        // Filter out run/cardio exercises — those are rendered separately as conditioning.
        const liftExercises = (programWorkout.exercises || []).filter(ex => !isRunEx(ex));
        setWorkout({
          id: programWorkout.id,
          title: programWorkout.title,
          description: programWorkout.notes || '',
          focus: programWorkout.focus || programWorkout.type || 'strength',
          duration_minutes: null,
          exercises: liftExercises.map((ex) => ({
            name: ex.name,
            sets: ex.sets || 3,
            reps: ex.rep_target || '10',
            rest_seconds: ex.rest_seconds || 180,
            notes: ex.notes || null,
          })),
          created_by: user.id,
          _isProgramWorkout: true,
        });
      } else if (!isProgramSource && workoutId) {
        try {
          const workouts = await db.entities.Workout.filter({
            id: workoutId,
            created_by: user.id
          });
          if (workouts.length > 0) {
            setWorkout(workouts[0]);
          } else {
            setWorkoutNotFound(true);
          }
        } catch {
          setWorkoutNotFound(true);
        }
      } else if (!isProgramSource) {
        setWorkoutNotFound(true);
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
        initialLogs = programWorkout.exercises.filter(ex => !isRunEx(ex)).map((ex, index) => {
          const targets = progressionTargetsMap[ex.name];
          const numSets = ex.sets || 3;

          // Get last performance for autofill
          const lastPerf = getLastExercisePerformance(allWorkoutLogs, ex.name);

          const targetReps = parseRepTarget(ex.rep_target);
          const scaledWeight = lastPerf?.lastWeight && lastPerf?.lastReps
            ? scaleWeightToReps(lastPerf.lastWeight, lastPerf.lastReps, targetReps)
            : lastPerf?.lastWeight || 0;

          // All sets default to working type at working weight
          const sets = Array.from({ length: numSets }, (_, setIndex) => ({
            set_number: setIndex + 1,
            reps: targetReps,
            weight: targets?.workingWeight || scaledWeight,
            completed: false,
            rpe: null,
            rir: ex.rir_target ?? null,
            set_type: 'working',
          }));

          return {
            name: ex.name,
            exercise_index: index,
            sets,
          };
        });
      } else {
        // Standard mode: autofill with last used weight, scaled to target reps via Epley
        initialLogs = workout.exercises?.map((exercise, index) => {
          const lastPerf = getLastExercisePerformance(allWorkoutLogs, exercise.name);
          const targetReps = parseRepTarget(exercise.reps);
          const scaledWeight = lastPerf?.lastWeight && lastPerf?.lastReps
            ? scaleWeightToReps(lastPerf.lastWeight, lastPerf.lastReps, targetReps)
            : lastPerf?.lastWeight || 0;

          return {
            name: exercise.name,
            exercise_index: index,
            sets: Array.from({ length: exercise.sets || 3 }, (_, setIndex) => ({
              set_number: setIndex + 1,
              reps: targetReps,
              weight: scaledWeight,
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
        focus: workout.focus,
        duration_minutes: workout.duration_minutes,
        exercises: workout.exercises,
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
              focus: workout.focus || 'strength',
              duration_minutes: workout.duration_minutes || 45,
              exercises: workout.exercises || [],
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
          });
          scheduleId = existing[0].id;
        } else {
          // Create new schedule entry
          const schedule = await db.entities.WorkoutSchedule.create({
            workout_id: realWorkoutId,
            scheduled_date: today,
            completed: true,
            time_of_day: "anytime",
            created_by: user.id
          });
          scheduleId = schedule.id;
        }
      }

      // Combine notes
      const combinedNotes = [
        preWorkoutNotes ? `PRE: ${preWorkoutNotes}` : null,
        postWorkoutNotes ? `POST: ${postWorkoutNotes}` : null,
      ].filter(Boolean).join("\n\n");

      // Create workout log
      await db.entities.WorkoutLog.create({
        created_by: user.id,
        workout_schedule_id: scheduleId,
        workout_id: realWorkoutId,
        log_date: today,
        exercises: exerciseLogs,
        duration_seconds: durationSeconds,
        notes: combinedNotes || null,
      });


    },
    onSuccess: () => {
      completeSession();
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
              navigate(isProgramSource && enrollment ? `/program/${enrollment.program_id}` : "/dashboard");
            },
            onError: () => {
              toast.success("Workout logged! (Progression update failed)");
              navigate(isProgramSource && enrollment ? `/program/${enrollment.program_id}` : "/dashboard");
            },
          }
        );
      } else {
        toast.success("Workout logged successfully!");
        navigate(isProgramSource && enrollment ? `/program/${enrollment.program_id}` : "/dashboard");
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
  // Don't auto-start — user must explicitly press Start
  const shouldAutoStart = false;
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
        notes: null,
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
    if (isTutorialDemo) { return; }
    const workoutId = isProgramSource ? null : urlParams.get('id');
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
    setPreWorkoutNotes(resumeSession.notes || "");
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
    setPreWorkoutNotes("");
    setPostWorkoutNotes("");
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
    if (isTutorialDemo) { navigate('/dashboard'); return; }
    if (hasIncompleteSets()) {
      setShowIncompletePrompt(true);
      return;
    }
    setShowPostWorkoutDialog(true);
  };

  const handleIncompleteResponse = (autoCheck) => {
    setShowIncompletePrompt(false);
    if (autoCheck) {
      markAllSetsComplete();
    }
    // Small delay so state update flushes before mutation reads exerciseLogs
    setTimeout(() => setShowPostWorkoutDialog(true), 50);
  };

  const loadFailed = workoutNotFound
    || (isProgramSource && (enrollmentError || programWorkoutError || !enrollmentId || !programWorkoutId));

  if (loadFailed) {
    return (
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <h2 className="text-[17px] font-extrabold text-ink mb-2">Workout not found</h2>
            <p className="text-[13px] font-semibold text-ink-muted mb-6">
              This workout may have been deleted, or the link is no longer valid.
            </p>
            <Button variant="outline" onClick={() => navigate("/workouts")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Workouts
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!workout || !user || (isProgramSource && (!enrollment || !programWorkout))) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen relative">
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

      <div className={`max-w-6xl mx-auto p-4 md:p-6 ${isLogging ? 'pt-16 pb-32 lg:pt-32 lg:pb-6' : ''}`}>
        <div className="lg:flex lg:items-start lg:gap-6">
        <div className="flex-1 min-w-0">
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

        <Card ref={workoutCardRef} className={`mb-6 ${isLogging ? 'mt-4' : ''}`}>
          <CardHeader className="pt-4 pb-2">
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="capitalize">
                  {workout.focus}
                </Badge>
                {isProgramSource && (
                  <Badge variant="slate">Program Workout</Badge>
                )}
                {isLogging && (
                  <Badge variant="green">Logging Active</Badge>
                )}
              </div>
              {workout.exercises?.length > 0 && getWorkoutBodyData(workout.exercises).length > 0 && (
                <div className="hidden md:flex items-center gap-2 shrink-0 lg:hidden">
                  <span className="section-label">Muscles worked</span>
                  <div className="flex rounded-full overflow-hidden bg-white/[0.05] border border-white/10 text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]">
                    <button
                      onClick={() => setMuscleView("anterior")}
                      className={`px-2.5 py-0.5 transition-colors ${muscleView === "anterior" ? "bg-white/[0.12] text-ink font-bold" : "text-ink-muted hover:bg-white/[0.06] hover:text-ink"}`}
                    >Front</button>
                    <button
                      onClick={() => setMuscleView("posterior")}
                      className={`px-2.5 py-0.5 transition-colors ${muscleView === "posterior" ? "bg-white/[0.12] text-ink font-bold" : "text-ink-muted hover:bg-white/[0.06] hover:text-ink"}`}
                    >Back</button>
                  </div>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col md:flex-row md:gap-8">
            <div className="flex-1 min-w-0">
              {/* Title + description */}
              <CardTitle className="type-display text-[22px] mb-1">{workout.title}</CardTitle>
              {workout.description && (
                <p className="text-[13px] font-semibold text-ink-muted mb-4">{workout.description}</p>
              )}
              <div className="flex flex-wrap gap-6 mb-6">
                  {workout.duration_minutes != null && (
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-ink-muted" />
                      <div>
                        <div className="section-label">Duration</div>
                        <div className="font-technical font-extrabold text-[15px] text-ink">{workout.duration_minutes} <span className="text-[11px] font-semibold text-ink-muted">min</span></div>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-ink-muted" />
                    <div>
                      <div className="section-label">Exercises</div>
                      <div className="font-technical font-extrabold text-[15px] text-ink">{workout.exercises?.length || 0} <span className="text-[11px] font-semibold text-ink-muted">exercises</span></div>
                    </div>
                  </div>
                </div>


                {!isLogging && (
                  <div className="space-y-3">
                    <Button
                      onClick={handleStartLogging}
                      variant="volt"
                      className="w-full text-lg py-6"
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
                  <div className="hidden md:flex flex-col md:mt-0 md:w-64 md:shrink-0 lg:hidden">
                    <MuscleHeatMap data={bodyData} view={muscleView} className="flex-1" maxWidth={220} />
                  </div>
                ) : null;
              })()}
          </CardContent>
        </Card>

        {isLogging ? (
          // Logging Mode - Show editable exercise logs
          <div className="space-y-6">
            {/* Pre-workout Notes */}
            <Card>
              <CardHeader className="pt-4 pb-2">
                <CardTitle className="section-label">Pre-workout Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={preWorkoutNotes}
                  onChange={(e) => setPreWorkoutNotes(e.target.value)}
                  placeholder="Anything notable going in? Energy, soreness, focus..."
                  className="bg-transparent border-none focus-visible:ring-0 px-0 min-h-[60px] resize-none text-base"
                />
              </CardContent>
            </Card>

            {/* Recovery warnings (program mode) */}
            {recoveryWarnings.length > 0 && (
              <div className="glass px-4 py-3">
                <div className="flex items-start gap-2.5">
                  <i className="w-[26px] h-[26px] rounded-[9px] bg-warn/[0.15] text-warn flex items-center justify-center flex-shrink-0 not-italic">
                    <AlertTriangle className="w-3.5 h-3.5" />
                  </i>
                  <div className="pt-0.5">
                    <p className="text-[12px] font-bold text-warn">Recovery Advisory</p>
                    {recoveryWarnings.map((w, i) => (
                      <p key={i} className="text-xs font-semibold text-ink-muted leading-relaxed mt-1">{w.message}</p>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {exerciseLogs.map((exerciseLog, exerciseIndex) => {
              const lastPerformance = getLastExercisePerformance(allWorkoutLogs, exerciseLog.name);
              const programEx = isProgramSource ? programWorkout?.exercises?.find(ex => ex.name === exerciseLog.name) || null : null;
              const targets = programEx ? progressionTargetsMap[programEx.name] : null;
              return (
                <div key={exerciseIndex} data-tutorial={exerciseIndex === 0 ? "exercise-card" : undefined}>
                  <ExerciseCard
                    exercise={exerciseLog}
                    exerciseIndex={exerciseIndex}
                    weightUnit={weightUnit}
                    onUpdateSet={(exIdx, setIdx, field, value) => {
                      updateSetData(exIdx, setIdx, field, value);
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

            {/* Cardio sessions (program mode only — separate from lift, not logged as sets) */}
            {isProgramSource && (() => {
              const runExercises = (programWorkout?.exercises || []).filter(isRunEx).map(ex => ({
                title: ex.name,
                duration_minutes: ex.duration_minutes || null,
                time_of_day: ex.time_of_day || null,
                zone: ex.zone || null,
              }));
              const allCardio = [...runExercises, ...(programWorkout?.cardio_sessions || [])];
              return allCardio.length > 0 && (
              <div className="space-y-2">
                <p className="section-label">Conditioning</p>
                {allCardio.map((c, i) => (
                  <div
                    key={`cardio-${i}`}
                    className="flex items-center justify-between px-3.5 py-3 glass-inset"
                  >
                    <div className="flex items-center gap-2.5">
                      <Activity className="w-4 h-4 text-carb" />
                      <div>
                        <p className="text-[13.5px] font-bold text-ink">{c.title}</p>
                        <p className="font-technical text-[11px] font-semibold text-ink-muted">
                          {[
                            c.duration_minutes ? `${c.duration_minutes} min` : null,
                            c.time_of_day && c.time_of_day !== "anytime" ? c.time_of_day.toUpperCase() : null,
                            c.zone || null,
                          ].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-carb bg-carb/10 border border-carb/20 rounded-full px-2.5 py-1">Cardio</span>
                  </div>
                ))}
              </div>
              );
            })()}

            {/* Add Exercise Form */}
            <AddExerciseForm onAdd={addExercise} exerciseNames={allHistoryExerciseNames} />

            {/* Notes Section */}
            <Card className="">
              <CardHeader className="pt-4 pb-2">
                <CardTitle className="section-label">Workout Notes (Optional)</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={postWorkoutNotes}
                  onChange={(e) => setPostWorkoutNotes(e.target.value)}
                  placeholder="How did the workout feel? Any personal records? Notes for next time..."
                  rows={3}
                />
              </CardContent>
            </Card>
          </div>
        ) : (
          // View Mode - Show exercises read-only
          <Card className="">
            <CardHeader className="pt-4 pb-2">
              <CardTitle className="text-[17px] font-extrabold text-ink">Exercises</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {workout.exercises?.map((exercise, index) => {
                const isLogFormat = Array.isArray(exercise.sets);
                return (
                  <div key={index} className="glass-inset px-4 py-3.5">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand/15 border border-brand/30 flex items-center justify-center text-brand font-technical font-extrabold text-[13px] flex-shrink-0">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[15px] font-extrabold text-ink mb-2">{exercise.name}</h4>
                          {isLogFormat ? (
                            <table className="w-full text-sm mt-2">
                              <thead>
                                <tr className="border-b border-white/[0.08]">
                                  <th className="text-left py-2 px-2 text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink-muted">Set</th>
                                  <th className="text-left py-2 px-2 text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink-muted">Weight</th>
                                  <th className="text-left py-2 px-2 text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink-muted">Reps</th>
                                </tr>
                              </thead>
                              <tbody>
                                {exercise.sets.map((set, si) => (
                                  <tr key={si} className="border-b border-white/[0.06]">
                                    <td className="py-2 px-2 font-technical font-extrabold text-ink-muted">{set.set_number}</td>
                                    <td className="py-2 px-2 font-technical font-semibold text-ink-secondary">{set.weight} <span className="text-[10px] text-ink-faint">{weightUnit}</span></td>
                                    <td className="py-2 px-2 font-technical font-semibold text-ink-secondary">{set.reps}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <div className="flex flex-wrap gap-4 text-[12.5px] font-semibold text-ink-muted">
                              {exercise.sets > 1 && (
                                <div>
                                  <span className="text-ink-faint">Sets:</span> <span className="font-technical font-extrabold text-ink-secondary">{exercise.sets}</span>
                                </div>
                              )}
                              <div>
                                <span className="text-ink-faint">{exercise.sets === 1 ? 'Duration / Target' : 'Reps'}:</span> <span className="font-technical font-extrabold text-ink-secondary">{exercise.reps}</span>
                              </div>
                              {exercise.rest_seconds > 0 && (
                                <div>
                                  <span className="text-ink-faint">Rest:</span> <span className="font-technical font-extrabold text-ink-secondary">{exercise.rest_seconds}s</span>
                                </div>
                              )}
                            </div>
                          )}
                          {exercise.notes && (
                            <p className="text-xs font-semibold text-ink-muted mt-2 italic">{exercise.notes}</p>
                          )}
                        </div>
                      </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
        </div>{/* end main column */}

        {/* Sticky anatomy sidebar — desktop only */}
        {workout.exercises?.length > 0 && (() => {
          const bodyData = getWorkoutBodyData(workout.exercises);
          return bodyData.length > 0 ? (
            <div
              className="hidden lg:flex flex-col items-center w-52 shrink-0 sticky"
              style={{ top: isLogging ? 'calc(var(--layout-header-height, 56px) + 8rem)' : 'calc(var(--layout-header-height, 56px) + 1.5rem)' }}
            >
              <p className="section-label mb-2 self-start">Muscles worked</p>
              <div className="flex rounded-full overflow-hidden bg-white/[0.05] border border-white/10 text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] mb-3">
                <button
                  onClick={() => setMuscleView("anterior")}
                  className={`px-3 py-1 transition-colors ${muscleView === "anterior" ? "bg-white/[0.12] text-ink font-bold" : "text-ink-muted hover:bg-white/[0.06] hover:text-ink"}`}
                >Front</button>
                <button
                  onClick={() => setMuscleView("posterior")}
                  className={`px-3 py-1 transition-colors ${muscleView === "posterior" ? "bg-white/[0.12] text-ink font-bold" : "text-ink-muted hover:bg-white/[0.06] hover:text-ink"}`}
                >Back</button>
              </div>
              <MuscleHeatMap data={bodyData} view={muscleView} maxWidth={200} />
            </div>
          ) : null;
        })()}
        </div>{/* end two-column flex */}
      </div>

      {/* Resume previous session prompt */}
      <Dialog open={!!resumeSession} onOpenChange={(open) => { if (!open) handleDismissResume(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Resume Workout?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-ink-muted">
            You have an unfinished session started {formatTimeAgo(resumeSession?.start_time)}. Would you like to pick up where you left off?
          </p>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={handleDismissResume}>
              Start Fresh
            </Button>
            <Button variant="volt" className="flex-1" onClick={handleResumeSession}>
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
          <p className="text-sm text-ink-muted">
            Some sets haven't been checked off. Would you like to mark them all as complete?
          </p>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => handleIncompleteResponse(false)}>
              Leave As-Is
            </Button>
            <Button variant="volt" className="flex-1" onClick={() => handleIncompleteResponse(true)}>
              Complete All
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Post-workout notes prompt */}
      <Dialog open={showPostWorkoutDialog} onOpenChange={setShowPostWorkoutDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Finish Workout</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink-muted">Post-workout Notes</label>
              <Textarea
                value={postWorkoutNotes}
                onChange={(e) => setPostWorkoutNotes(e.target.value)}
                placeholder="What felt good/bad? Any injuries? Pump quality?"
                rows={4}
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowPostWorkoutDialog(false)}>
                Go Back
              </Button>
              <Button
                variant="volt"
                className="flex-1"
                disabled={saveWorkoutLogMutation.isPending}
                onClick={() => saveWorkoutLogMutation.mutate()}
              >
                {saveWorkoutLogMutation.isPending ? "Saving..." : "Log Workout"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
