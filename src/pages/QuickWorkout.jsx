import { useState, useEffect, useRef, useMemo } from "react";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProfile, isExerciseLiked, useToggleExerciseLike } from "@/hooks/useUserQueries";
import { useWorkoutExercises } from "@/hooks/useWorkoutExercises";
import { useWorkoutSession } from "@/hooks/useWorkoutSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LoadingScreen } from "@/components/ui/loading-spinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { queryKeys, invalidateSchedule, invalidateWorkoutLogs } from "@/lib/queryKeys";
import { Dumbbell, Pencil, Check, Brain, Plus } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import SortableExerciseRow from "@/components/workouts/SortableExerciseRow";
import { getTodayString } from "@/utils/dateUtils";
import { toast } from "sonner";
import ExerciseCard from "@/components/workouts/ExerciseCard";
import VdotZonesCard from "@/components/workouts/VdotZonesCard";
import WorkoutLoggingHeader from "@/components/workouts/WorkoutLoggingHeader";
import AddExerciseForm from "@/components/workouts/AddExerciseForm";
import { getLastExercisePerformance } from "@/utils/exerciseStats";
import { EXERCISE_DB } from "@/ml/exerciseDB";
import { getCoachingPhase, getPreSessionInsight } from "@/utils/coachingEngine";
import PreSessionInsightCard from "@/components/workouts/PreSessionInsightCard";
import { STALE_SESSION_MS } from "@/lib/workoutSessionFlag";

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

  const { checkForActiveSession, createSession, saveProgress, completeSession, cancelSession, restoreSession } = useWorkoutSession();

  const { profile } = useProfile();
  const toggleLike = useToggleExerciseLike();
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

  // Recent lifts for the empty-canvas quick-start list — the exercises the
  // athlete logged most recently, most-recent first, deduped. This fills the
  // space between the hero and the docked add form so the first viewport has
  // substance (one-tap re-add) instead of a dead void.
  const recentExerciseNames = useMemo(() => {
    const seen = new Set();
    const out = [];
    const sorted = [...allWorkoutLogs].sort(
      (a, b) => new Date(b.log_date || 0) - new Date(a.log_date || 0)
    );
    for (const log of sorted) {
      for (const e of log.exercises || []) {
        const name = e.name?.trim();
        if (name && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          out.push(name);
          if (out.length >= 6) return out;
        }
      }
    }
    return out;
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
    moveExercise,
    addExercise: addExerciseRaw,
  } = useWorkoutExercises(prescribedInitial);

  // Drag-to-reorder exercises. Items are keyed by their current index (stable
  // for the duration of a drag; a reorder itself changes indices, which is fine
  // since dnd-kit only needs identity to hold still mid-gesture).
  const dragSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const handleExerciseDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    moveExercise(Number(active.id), Number(over.id));
  };

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
        // Recent session: drop straight back into it. No dialog, no new session,
        // nothing discarded. See STALE_SESSION_MS.
        if (ageMs < STALE_SESSION_MS) {
          restoreSession(session.id);
          setExercises(session.exercises || []);
          setStartTime(new Date(session.start_time).getTime());
        } else {
          // Stale: ask. Never auto-finish — that marked it completed without
          // ever writing a workout_logs row, destroying the logged sets.
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

  // Rest timer tick — phase-aligned to whole seconds, absolute end timestamp.
  // rtb-6: a fixed 500ms polling interval fired off the wall-clock second
  // boundary, so the displayed countdown stuttered (a 2x/sec poll lands the
  // ceil() flip at an arbitrary phase, visibly skipping or doubling a second).
  // Mirror the elapsed-clock pattern in WorkoutLoggingHeader: recompute from
  // Date.now() and schedule the NEXT tick at the next whole-second boundary of
  // the remaining time, so the readout decrements exactly once per real second.
  // The chain is (re)started imperatively by startRestTimer/addRestTime rather
  // than polled, so there's no fixed-interval poll at all.
  const restTickRef = useRef(null);
  useEffect(() => {
    restTickRef.current = () => {
      if (restTimerEndRef.current === null) return;
      const msLeft = restTimerEndRef.current - Date.now();
      const remaining = Math.max(0, Math.ceil(msLeft / 1000));
      setRestTimer(remaining);
      if (remaining <= 0) {
        restTimerEndRef.current = null;
        // Rest is over — flash 0:00 for a beat, then clear the chip so the
        // bottom bar collapses back to its single elapsed-clock row instead of
        // stranding a dead 0:00 countdown. setRestTimer(null) is what tears the
        // rest cluster down (restActive = restTimer !== null).
        clearTimeout(restTimerRef.current);
        restTimerRef.current = setTimeout(() => setRestTimer(null), 900);
        return;
      }
      // ms until the countdown's next whole-second flip.
      const msToNextSecond = ((msLeft % 1000) + 1000) % 1000 || 1000;
      clearTimeout(restTimerRef.current);
      restTimerRef.current = setTimeout(() => restTickRef.current(), msToNextSecond);
    };
    return () => clearTimeout(restTimerRef.current);
  }, []);

  const startRestTimer = (duration) => {
    setRestDuration(duration);
    restTimerEndRef.current = Date.now() + duration * 1000;
    setRestTimer(duration);
    restTickRef.current?.(); // kick the boundary-aligned chain
  };

  const skipRestTimer = () => {
    clearTimeout(restTimerRef.current);
    restTimerEndRef.current = null;
    setRestTimer(null);
  };

  const addRestTime = (seconds) => {
    if (restTimerEndRef.current !== null) {
      restTimerEndRef.current += seconds * 1000;
      setRestDuration((prev) => prev + seconds);
      restTickRef.current?.(); // re-sync the countdown to the new end time
    }
  };

  const saveWorkoutLogMutation = useMutation({
    mutationFn: async () => {
      const today = getTodayString(profile?.timezone);
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

  // Empty canvas (no exercises, not the prescribed flow, resume decision past):
  // the body becomes a single thumb-zone-docked layout — one type-display hero
  // up top, the add-exercise form pinned into the lower third — so the first
  // viewport carries substance with no dead void and the primary Add action
  // lands under the thumb.
  const isEmptyCanvas = exercises.length === 0 && !prescribed && !resumeSession;

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
        weightUnit={weightUnit}
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

      <div
        className={`max-w-5xl mx-auto p-4 md:p-6 pt-[calc(96px+env(safe-area-inset-top,0px))] lg:pt-32 pb-[calc(var(--logging-bar-clearance,132px)+16px)] lg:pb-6 ${
          // Empty canvas: make the body a viewport-tall flex column so the
          // add-exercise form can be pushed into the lower (thumb) third with
          // no dead void between the hero and the form. lg keeps the normal
          // block flow (desktop has no thumb-zone constraint).
          isEmptyCanvas
            ? "flex flex-col min-h-[calc(100svh-96px-env(safe-area-inset-top,0px)-var(--logging-bar-clearance,132px))] lg:block lg:min-h-0"
            : ""
        }`}
      >
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
        {/* Empty canvas — ONE type-display hero frames the action, a quiet
            COACH chip (if any), a recent-lifts quick-start list that grows to
            fill the band, then the add-exercise form whose CTA lands in the
            lower (thumb) third. The parent flex column is justify-center, so the
            whole stack is balanced top↕bottom with no contiguous >120px void,
            and the growing list pins the form low. lg drops back to block flow. */}
        {isEmptyCanvas && (
          <>
            <div className="rise-in lg:hidden">
              <h2 className="type-display text-[26px] leading-[1.1]">
                Build your session
              </h2>
              <p className="text-sm font-semibold text-ink-muted mt-1.5 leading-relaxed">
                Add a lift to start logging sets, reps, and load.
              </p>
            </div>

            {!prescribed && preSessionInsight && (
              !insightExpanded ? (
                <button
                  type="button"
                  onClick={() => setInsightExpanded(true)}
                  className="w-full mt-4 glass px-3.5 py-3 rounded-xl flex items-start gap-2.5 text-left rise-in touch-manipulation min-h-[44px] lg:hidden"
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
                <div className="mt-4 lg:hidden">
                  <PreSessionInsightCard
                    insight={preSessionInsight}
                    onAccept={handleInsightAccept}
                    onDismiss={() => { setInsightDismissed(true); setInsightExpanded(false); }}
                  />
                </div>
              )
            )}

            {/* Quick-start list — one-tap re-add of recent lifts as full-width
                rows. flex-1 lets this region absorb the slack between the hero
                and the docked form so neither gap exceeds 120px while the form's
                Add CTA stays in the thumb zone. When there's no history a quiet
                hint fills the same band. */}
            <div className="mt-6 flex-1 min-h-0 flex flex-col justify-center lg:hidden">
              {recentExerciseNames.length > 0 ? (
                <>
                  <p className="section-label mb-2.5">Recent lifts</p>
                  <div className="flex flex-col gap-2">
                    {recentExerciseNames.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => addExercise(name)}
                        className="w-full min-h-[48px] px-4 glass rounded-xl text-sm font-bold text-ink flex items-center gap-2.5 touch-manipulation glass-interactive rise-in"
                      >
                        <span className="w-7 h-7 rounded-lg bg-charcoal-surface2 flex items-center justify-center shrink-0">
                          <Plus className="w-4 h-4 text-ink-muted" />
                        </span>
                        <span className="truncate text-left flex-1">{name}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="glass rounded-2xl px-4 py-5 flex items-center gap-3 rise-in">
                  <span className="w-10 h-10 rounded-xl bg-charcoal-surface2 flex items-center justify-center shrink-0">
                    <Dumbbell className="w-5 h-5 text-ink-muted" />
                  </span>
                  <p className="text-[13px] font-semibold text-ink-muted leading-relaxed">
                    Pick a lift below to log your first set. Your recent lifts will show up here next time.
                  </p>
                </div>
              )}
            </div>

            {/* The add-exercise form — its Add CTA is the page's primary action
                and lands in the thumb zone (lower third) because the flex-1 list
                above pushes it down. Flows inline on desktop. */}
            <div className="mt-5 lg:mt-0">
              <AddExerciseForm
                onAdd={addExercise}
                showCloseButton={false}
                exerciseNames={allHistoryExerciseNames}
                hasExercises={false}
              />
            </div>
          </>
        )}

        {!resumeSession && !isEmptyCanvas && (
        <>
        {/* Pre-session insight (Phase 2+) — suppressed when the engine has
            already prescribed loads, to avoid two coaches contradicting. Once
            exercises exist it's the full insight card with its accept/dismiss
            actions. */}
        {!prescribed && preSessionInsight && (
          <PreSessionInsightCard
            insight={preSessionInsight}
            onAccept={handleInsightAccept}
            onDismiss={() => { setInsightDismissed(true); setInsightExpanded(false); }}
          />
        )}

        {/* Exercise List */}
        <div className="space-y-4">
          <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={handleExerciseDragEnd}>
            <SortableContext
              items={exercises.map((_, i) => String(i))}
              strategy={verticalListSortingStrategy}
            >
              {exercises.map((exercise, exerciseIndex) => {
                const lastPerformance = getLastExercisePerformance(allWorkoutLogs, exercise.name);
                return (
                  <SortableExerciseRow key={exerciseIndex} id={String(exerciseIndex)} exerciseIndex={exerciseIndex}>
                    {(dragHandleProps) => (
                      <ExerciseCard
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
                        liked={isExerciseLiked(profile, exercise.name)}
                        onToggleLike={() => toggleLike.mutate({ profile, exerciseName: exercise.name })}
                        dragHandleProps={dragHandleProps}
                      />
                    )}
                  </SortableExerciseRow>
                );
              })}
            </SortableContext>
          </DndContext>

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

      {/* Resume previous session prompt. onOpenChange is a no-op — dismissing via
          scrim tap must not silently cancel the real in-progress session; only
          the explicit "Start Fresh" button may do that. */}
      <Dialog open={!!resumeSession} onOpenChange={() => {}}>
        <DialogContent sheetMinHeight="" hideClose>
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
