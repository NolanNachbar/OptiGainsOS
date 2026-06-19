import { useState, useEffect, useRef, useMemo } from "react";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProfile } from "@/hooks/useUserQueries";
import { useWorkoutExercises } from "@/hooks/useWorkoutExercises";
import { useWorkoutSession } from "@/hooks/useWorkoutSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingScreen } from "@/components/ui/loading-spinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { queryKeys, invalidateSchedule, invalidateWorkoutLogs } from "@/lib/queryKeys";
import { Dumbbell, Pencil, Check, Cpu } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import ExerciseCard from "@/components/workouts/ExerciseCard";
import VdotZonesCard from "@/components/workouts/VdotZonesCard";
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
  const location = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // When launched from the engine's PrescribedSessionCard ("Log this session"),
  // pre-load the prescribed lifts with their target load/reps/RIR so the athlete
  // logs *against* training_prescription instead of a blank slate. This is the
  // wire that connects the engine's prescription to the actual logging UI.
  const prescribed = location.state?.prescribedSession || null;
  const prescribedInitial = useMemo(() => {
    if (!prescribed?.exercises?.length) return [];
    // Prescribed reps can be a range string ("6-8"). Number inputs render
    // blank for those and the engine drops non-numeric sets from learning —
    // seed the set with the range's lower bound instead.
    const repsNum = (r) => {
      const n = Number(r);
      if (Number.isFinite(n)) return n;
      const m = String(r ?? "").match(/\d+/);
      return m ? parseInt(m[0], 10) : 0;
    };
    return prescribed.exercises.map((ex, i) => ({
      name: ex.name,
      exercise_index: i,
      prescribed: { reps: ex.reps, rir: ex.rir, targetWeight: ex.targetWeight },
      sets: Array.from({ length: Math.max(1, Number(ex.sets) || 1) }, (_, s) => ({
        set_number: s + 1,
        reps: repsNum(ex.reps),
        weight: ex.targetWeight || 0,
        rir: ex.rir ?? null,
        completed: false,
      })),
    }));
  }, [prescribed]);

  const [startTime, setStartTime] = useState(Date.now());
  const [workoutTitle, setWorkoutTitle] = useState(
    prescribed?.title
      ? `${prescribed.title} — ${format(new Date(), "MMM d")}`
      : `Quick Workout - ${format(new Date(), "MMM d, yyyy")}`
  );
  // Only surface run-pace zones for run/cardio intent — a generic lifting
  // "Quick Workout" should not show VDOT paces. Driven by prescribed modality
  // or run/cardio keywords in the (editable) title.
  const isRunCardio =
    prescribed?.modality === "run" || /run|cardio|interval/i.test(workoutTitle);
  const [editingTitle, setEditingTitle] = useState(false);
  const [showTitleInHeader, setShowTitleInHeader] = useState(false);
  const [resumeSession, setResumeSession] = useState(null);
  // Seed session notes with the pre-train check-in entered on Today (if any),
  // tagged PRE: so notes_parser.py attributes it to this session.
  const [sessionNotes, setSessionNotes] = useState(
    () => (location.state?.preNote ? `PRE: ${location.state.preNote}` : "")
  );
  const workoutTitleRef = useRef(null);
  const sessionInitialized = useRef(false);

  // Rest timer — mirrors WorkoutDetail: an absolute end timestamp ticked every
  // 500ms so it stays accurate across backgrounding. Without this, the rest
  // surface in WorkoutLoggingHeader stays dead on /quick-workout.
  const [restTimer, setRestTimer] = useState(null);
  const [restDuration, setRestDuration] = useState(90);
  const restTimerRef = useRef(null);
  const restTimerEndRef = useRef(null);

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
    replaceExercise,
    addExercise: addExerciseRaw,
  } = useWorkoutExercises(prescribedInitial);

  // Wrapper for addExercise that autofills weight from last performance or insight suggestion
  const addExercise = (exerciseName) => {
    const suggestion = insightSuggestions[exerciseName.toLowerCase()];
    const lastPerf = getLastExercisePerformance(allWorkoutLogs, exerciseName);
    const defaultWeight = suggestion || lastPerf?.lastWeight || 0;
    return addExerciseRaw(exerciseName, defaultWeight);
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
          createSession({ exercises: prescribedInitial, startTime });
        } else {
          setResumeSession(session);
        }
      } else {
        createSession({ exercises: prescribedInitial, startTime });
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

  // Rest timer tick — single interval, absolute end timestamp (mirrors WorkoutDetail).
  useEffect(() => {
    const tick = () => {
      if (restTimerEndRef.current === null) return;
      const remaining = Math.max(0, Math.ceil((restTimerEndRef.current - Date.now()) / 1000));
      setRestTimer(remaining);
      if (remaining <= 0) restTimerEndRef.current = null;
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
      setRestDuration((prev) => prev + seconds);
    }
  };

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
        notes: sessionNotes.trim() || null,
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
    <div className="min-h-screen relative">
      <WorkoutLoggingHeader
        workoutTitle={workoutTitle}
        showTitleInHeader={showTitleInHeader}
        onCancel={() => {
          cancelSession();
          navigate("/dashboard");
        }}
        onFinish={handleSave}
        isSaving={saveWorkoutLogMutation.isPending}
        startTime={startTime}
        canFinish={exercises.length > 0}
        restTimer={restTimer}
        restDuration={restDuration}
        onSkipRest={skipRestTimer}
        onAddRestTime={addRestTime}
      />

      <div className="max-w-5xl mx-auto p-4 md:p-6 pt-[calc(96px+env(safe-area-inset-top,0px))] lg:pt-32 pb-28 lg:pb-6">
        <div ref={workoutTitleRef} className="mb-6 hidden lg:block">
          <div className="flex items-center gap-2">
            <Dumbbell className="w-6 h-6 text-ink-muted" />
            {editingTitle ? (
              <Input
                autoFocus
                value={workoutTitle}
                onChange={(e) => setWorkoutTitle(e.target.value)}
                onBlur={() => setEditingTitle(false)}
                onKeyDown={(e) => e.key === 'Enter' && setEditingTitle(false)}
                className="text-2xl font-extrabold min-h-[44px] flex-1"
              />
            ) : (
              <h1 className="type-display text-xl md:text-2xl">{workoutTitle}</h1>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label={editingTitle ? "Save workout title" : "Edit workout title"}
              onClick={() => setEditingTitle(editingTitle ? false : true)}
              className="min-h-[44px] min-w-[44px] text-ink-muted hover:text-ink"
            >
              {editingTitle ? (
                <Check className="w-4 h-4 text-teal" />
              ) : (
                <Pencil className="w-4 h-4" />
              )}
            </Button>
          </div>
          {prescribed && (
            <p className="text-xs font-semibold text-ink-muted mt-1">
              Logging the engine's prescribed session — targets pre-filled
            </p>
          )}
        </div>

        {/* Mobile editable title row — the desktop block above (the
            IntersectionObserver target) is hidden on phones, and the Layout
            chrome only prints the static "Quick Workout" label, so without this
            the user can neither see nor rename the actual session title at
            390px. Compact type-display + a 44px Pencil/Check toggle. */}
        <div className="mb-6 lg:hidden">
          <div className="flex items-center gap-2">
            <Dumbbell className="w-5 h-5 text-ink-muted shrink-0" />
            {editingTitle ? (
              <Input
                autoFocus
                value={workoutTitle}
                onChange={(e) => setWorkoutTitle(e.target.value)}
                onBlur={() => setEditingTitle(false)}
                onKeyDown={(e) => e.key === 'Enter' && setEditingTitle(false)}
                className="type-display text-xl min-h-[44px] flex-1"
              />
            ) : (
              <h1 className="type-display text-xl flex-1 min-w-0 truncate">{workoutTitle}</h1>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label={editingTitle ? "Save workout title" : "Edit workout title"}
              onClick={() => setEditingTitle(editingTitle ? false : true)}
              className="min-h-[44px] min-w-[44px] shrink-0 text-ink-muted hover:text-ink"
            >
              {editingTitle ? (
                <Check className="w-4 h-4 text-teal" />
              ) : (
                <Pencil className="w-4 h-4" />
              )}
            </Button>
          </div>
          {prescribed && (
            <p className="text-xs font-semibold text-ink-muted mt-1">
              Logging the engine's prescribed session — targets pre-filled
            </p>
          )}
        </div>

        {isRunCardio && <VdotZonesCard className="mb-6" />}

        {/* Engine prescription banner */}
        {prescribed && (
          <div className="mb-6 glass px-4 py-3 flex items-center gap-2.5">
            <i className="w-[26px] h-[26px] rounded-md bg-teal/15 text-teal flex items-center justify-center flex-shrink-0 not-italic">
              <Cpu className="w-3.5 h-3.5" />
            </i>
            <span className="text-xs font-semibold text-ink-muted leading-relaxed">
              Loaded from <span className="text-ink font-bold">Engine Prescription</span> — confirm or adjust each set, then finish.
            </span>
          </div>
        )}

        {/* Pre-session insight card (Phase 2+) — suppressed when the engine has
            already prescribed loads, to avoid two coaches contradicting. */}
        {!prescribed && preSessionInsight && (
          <PreSessionInsightCard
            insight={preSessionInsight}
            onAccept={handleInsightAccept}
            onDismiss={() => setInsightDismissed(true)}
          />
        )}

        {/* Empty state — passive prompt; AddExerciseForm (docked to the thumb
            zone on mobile) provides the action. */}
        {exercises.length === 0 && (
          <div className="glass rounded-xl px-4 py-6 mb-4 flex flex-col items-center text-center">
            <Dumbbell className="w-7 h-7 text-ink-faint mb-3" />
            <p className="text-sm font-bold text-ink">No exercises yet</p>
            <p className="text-xs font-semibold text-ink-secondary mt-1 max-w-[260px]">
              Add your first exercise below to start logging this session.
            </p>
          </div>
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
                onReplaceExercise={replaceExercise}
                lastPerformance={lastPerformance}
                allExerciseNames={allHistoryExerciseNames}
                workoutLogs={allWorkoutLogs}
                coachingPhase={coachingPhase}
                onApplyCoachingSuggestion={handleApplyCoachingSuggestion}
                onStartRestTimer={startRestTimer}
              />
            );
          })}

          {/* Add Exercise Form */}
          <AddExerciseForm
            onAdd={addExercise}
            showCloseButton={exercises.length > 0}
            exerciseNames={allHistoryExerciseNames}
            hasExercises={exercises.length > 0}
          />

          {/* Session notes — feed back to notes_parser for programming adjustments */}
          {exercises.length > 0 && (
            <div className="glass px-4 py-3 rounded-xl space-y-1.5">
              <p className="section-label">Session notes</p>
              <textarea
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                placeholder="PRE: how you felt going in. POST: anything hard, easy, or painful."
                className="w-full bg-transparent text-sm font-semibold text-ink placeholder:text-ink-faint resize-none outline-none min-h-[64px]"
                rows={3}
              />
            </div>
          )}

        </div>
      </div>

      {/* Resume previous session prompt */}
      <Dialog open={!!resumeSession} onOpenChange={(open) => { if (!open) handleDismissResume(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Resume Workout?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-ink-muted ">
            You have an unfinished session started {formatTimeAgo(resumeSession?.start_time)}. Would you like to pick up where you left off?
          </p>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" size="lg" className="flex-1" onClick={handleDismissResume}>
              Start Fresh
            </Button>
            <Button variant="volt" size="lg" className="flex-1" onClick={handleResumeSession}>
              Resume
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
