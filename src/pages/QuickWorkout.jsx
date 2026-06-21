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
import { Textarea } from "@/components/ui/textarea";
import { LoadingScreen } from "@/components/ui/loading-spinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { queryKeys, invalidateSchedule, invalidateWorkoutLogs } from "@/lib/queryKeys";
import { Dumbbell, Pencil, Check, Brain } from "lucide-react";
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
  // The Layout chrome and the logging band both surface today's date already,
  // so the default session title carries no date — a date-stamped default just
  // reprinted the chrome's "Quick Workout" + date in a second, inconsistently
  // formatted row. Prescribed sessions keep their descriptive title (no date).
  const [workoutTitle, setWorkoutTitle] = useState(
    prescribed?.title || "Quick Workout"
  );
  // Only surface run-pace zones for run/cardio intent — a generic lifting
  // "Quick Workout" should not show VDOT paces. Driven by prescribed modality
  // or run/cardio keywords in the (editable) title.
  const isRunCardio =
    prescribed?.modality === "run" || /run|cardio|interval/i.test(workoutTitle);
  // The Layout chrome already prints "Quick Workout" + today's date on mobile,
  // so a default-titled session needs no second body title (that was the
  // top-of-page duplicate). Only render the mobile body title when the session
  // is customized — a prescribed session or a user-edited title — so the rename
  // affordance is still reachable when the title actually carries information.
  const defaultTitle = "Quick Workout";
  const isCustomTitle = !!prescribed || workoutTitle !== defaultTitle;
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
  // On the empty canvas the insight starts as a compact coach chip; tapping it
  // expands to the full PreSessionInsightCard (accept/dismiss) rather than
  // blind-accepting the suggestion.
  const [insightExpanded, setInsightExpanded] = useState(false);
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
    replaceExercise: replaceExerciseRaw,
    addExercise: addExerciseRaw,
  } = useWorkoutExercises(prescribedInitial);

  // Wrapper for addExercise that autofills weight from last performance or insight suggestion
  const addExercise = (exerciseName) => {
    const suggestion = insightSuggestions[exerciseName.toLowerCase()];
    const lastPerf = getLastExercisePerformance(allWorkoutLogs, exerciseName);
    const defaultWeight = suggestion || lastPerf?.lastWeight || 0;
    return addExerciseRaw(exerciseName, defaultWeight);
  };

  // Same autofill on swap: seed the replacement's load from its own history so a
  // swap doesn't blank the weight. (ponytail: seeds raw last weight, not rep-
  // scaled — the picker keeps the old rep target, so scaling is ~identity here.)
  const replaceExercise = (oldName, newExercise) => {
    const suggestion = insightSuggestions[newExercise?.name?.toLowerCase()];
    const lastPerf = getLastExercisePerformance(allWorkoutLogs, newExercise?.name);
    return replaceExerciseRaw(oldName, newExercise, suggestion || lastPerf?.lastWeight || 0);
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
        // The session clock must not tick before the Resume-vs-Start-Fresh
        // decision is made — a running timer behind the prompt reads as if a
        // session already started and contradicts the choice. Hold the header
        // timer at rest until the prompt is resolved (null hides the cluster).
        startTime={resumeSession ? null : startTime}
        canFinish={exercises.length > 0}
        restTimer={restTimer}
        restDuration={restDuration}
        onSkipRest={skipRestTimer}
        onAddRestTime={addRestTime}
      />

      <div className="max-w-5xl mx-auto p-4 md:p-6 pt-[calc(96px+env(safe-area-inset-top,0px))] lg:pt-32 pb-[calc(var(--logging-bar-clearance,132px)+16px)] lg:pb-6">
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
              Logging the engine's prescribed session, targets pre-filled
            </p>
          )}
        </div>

        {/* Mobile session title / rename — the desktop block above (the
            IntersectionObserver target) is hidden on phones. The Layout chrome
            already prints "Quick Workout" + today's date, so a DEFAULT-titled
            session shows no duplicate body title, only a quiet "Rename
            session" affordance so the user can still customize it. A customized
            or prescribed session shows the real title (which the chrome can't
            convey) with the same 44px Pencil/Check toggle. */}
        {editingTitle ? (
          <div className="mb-6 lg:hidden">
            <div className="flex items-center gap-2">
              <Dumbbell className="w-5 h-5 text-ink-muted shrink-0" />
              <Input
                autoFocus
                value={workoutTitle}
                onChange={(e) => setWorkoutTitle(e.target.value)}
                onBlur={() => setEditingTitle(false)}
                onKeyDown={(e) => e.key === 'Enter' && setEditingTitle(false)}
                className="type-display text-xl min-h-[44px] flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Save workout title"
                onClick={() => setEditingTitle(false)}
                className="min-h-[44px] min-w-[44px] shrink-0 text-ink-muted hover:text-ink"
              >
                <Check className="w-4 h-4 text-teal" />
              </Button>
            </div>
          </div>
        ) : isCustomTitle ? (
          <div className="mb-6 lg:hidden">
            <div className="flex items-center gap-2">
              <Dumbbell className="w-5 h-5 text-ink-muted shrink-0" />
              <h1 className="type-display text-xl flex-1 min-w-0 truncate">{workoutTitle}</h1>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Edit workout title"
                onClick={() => setEditingTitle(true)}
                className="min-h-[44px] min-w-[44px] shrink-0 text-ink-muted hover:text-ink"
              >
                <Pencil className="w-4 h-4" />
              </Button>
            </div>
            {prescribed && (
              <p className="text-xs font-semibold text-ink-muted mt-1">
                Logging the engine's prescribed session, targets pre-filled
              </p>
            )}
          </div>
        ) : !resumeSession ? (
          // Default-titled session: the chrome already prints "Quick Workout" +
          // today's date, so DON'T reprint the title here. Show only a quiet
          // "Rename session" affordance. Gated on !resumeSession so this row
          // doesn't bleed through the Resume scrim before the user decides.
          <button
            type="button"
            aria-label="Rename session"
            onClick={() => setEditingTitle(true)}
            className="mb-3 lg:hidden flex items-center gap-1.5 min-h-[44px] -my-2 text-sm font-semibold text-ink-muted hover:text-ink touch-manipulation"
          >
            <Pencil className="w-4 h-4 shrink-0" />
            Rename session
          </button>
        ) : null}

        {isRunCardio && <VdotZonesCard className="mb-6" />}

        {/* Engine prescription banner */}
        {prescribed && (
          <div className="mb-6 glass px-4 py-3 flex items-center gap-2.5">
            <div className="w-[26px] h-[26px] rounded-md bg-teal/15 flex items-center justify-center shrink-0">
              <Brain className="w-3.5 h-3.5 text-teal" />
            </div>
            <span className="text-xs font-semibold text-ink-muted leading-relaxed">
              Loaded from <span className="text-ink font-bold">Engine Prescription</span>, confirm or adjust each set, then finish.
            </span>
          </div>
        )}

        {/* While the Resume-vs-Start-Fresh decision is pending, the page behind
            the prompt must NOT render its empty-state ("No exercises yet" + add
            form), that contradicts the sheet's "you have an unfinished
            session" claim. Hold the body until the choice is made; the chosen
            path (resume restores the saved sets, start-fresh seeds a blank
            session) then renders the right state. */}
        {!resumeSession && (
        <>
        {/* Pre-session insight (Phase 2+) — suppressed when the engine has
            already prescribed loads, to avoid two coaches contradicting. On the
            empty canvas it's a compact single-line teal coach chip so the first
            viewport stays one coherent stack; once exercises exist it expands to
            the full insight card with its accept/dismiss actions. */}
        {!prescribed && preSessionInsight && (
          exercises.length === 0 && !insightExpanded ? (
            <button
              type="button"
              onClick={() => setInsightExpanded(true)}
              className="w-full mb-4 glass px-3.5 py-3 rounded-xl flex items-start gap-2.5 text-left rise-in touch-manipulation min-h-[44px]"
            >
              <span className="w-[26px] h-[26px] rounded-md bg-teal/15 flex items-center justify-center shrink-0 mt-0.5">
                <Brain className="w-3.5 h-3.5 text-teal" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[10px] text-teal uppercase tracking-[0.08em] font-bold mb-0.5">Coach</span>
                <span className="block text-[12.5px] font-semibold text-ink-muted leading-relaxed">
                  {preSessionInsight.message}
                </span>
              </span>
            </button>
          ) : (
            <PreSessionInsightCard
              insight={preSessionInsight}
              onAccept={handleInsightAccept}
              onDismiss={() => { setInsightDismissed(true); setInsightExpanded(false); }}
            />
          )
        )}

        {/* Empty-state prompt is folded INTO the docked AddExerciseForm (it
            renders its own header in the thumb zone), so there is no longer a
            standalone top-of-page card split away from the bottom action. */}

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
              <Textarea
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                placeholder="PRE: how you felt going in. POST: anything hard, easy, or painful."
                rows={3}
                className="border-0 bg-transparent shadow-none px-0 focus-visible:shadow-none focus-visible:border-0"
              />
            </div>
          )}

        </div>
        </>
        )}

        {/* Resume decision pending: the live empty-state form is intentionally
            held back (it would contradict the "unfinished session" sheet), but
            the body must not read as a dead black void behind the scrim. Render
            a calm, on-brand placeholder so the surface looks deliberate while
            the athlete picks Resume vs Start Fresh. */}
        {resumeSession && (
          <div className="rise-in flex flex-col items-center justify-center text-center gap-3 py-16 text-ink-muted">
            <span className="w-12 h-12 rounded-2xl glass flex items-center justify-center">
              <Dumbbell className="w-6 h-6 text-ink-muted" />
            </span>
            <p className="text-sm font-semibold max-w-[15rem] leading-relaxed">
              You have an unfinished session. Resume it or start fresh to begin logging.
            </p>
          </div>
        )}
      </div>

      {/* Resume previous session prompt */}
      <Dialog open={!!resumeSession} onOpenChange={(open) => { if (!open) handleDismissResume(); }}>
        <DialogContent sheetMinHeight="">
          <DialogHeader>
            <DialogTitle>Resume Workout?</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            You have an unfinished session started {formatTimeAgo(resumeSession?.start_time)}. Would you like to pick up where you left off?
          </DialogDescription>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" size="lg" className="flex-1" onClick={handleDismissResume}>
              Start Fresh
            </Button>
            {/* Resume is the recommended path, so it carries the solid coral
                CTA weight to read as clear primary in under 2s. The page body is
                held behind the scrim (!resumeSession gate) so no competing coral
                fill bleeds through, this is the only coral surface on screen,
                paired with the neutral-outline Start Fresh. */}
            <Button variant="volt" size="lg" className="flex-1" onClick={handleResumeSession}>
              Resume
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
