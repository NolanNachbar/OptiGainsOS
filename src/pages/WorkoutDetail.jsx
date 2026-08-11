import { useState, useEffect, useRef, useMemo } from "react";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProfile, isExerciseLiked, useToggleExerciseLike, useExerciseShotNotes } from "@/hooks/useUserQueries";
import { useTodayPrescription } from "@/hooks/useEngineQueries";
import { useWorkoutExercises } from "@/hooks/useWorkoutExercises";
import { useLogProgramWorkout } from "@/hooks/useProgramQueries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { LoadingScreen } from "@/components/ui/loading-spinner";
import { queryKeys, invalidateSchedule, invalidateWorkoutLogs, invalidateWorkouts, invalidatePrograms } from "@/lib/queryKeys";
import { ArrowLeft, Clock, Target, Dumbbell, Edit, Copy, AlertTriangle, Activity, RotateCw, ChevronDown, Camera } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import SortableExerciseRow from "@/components/workouts/SortableExerciseRow";
import { getTodayString } from "@/utils/dateUtils";
import { toast } from "sonner";
import { calculateDailyTargets, transferProgressionState } from "@/utils/programProgression";
import { checkRecoveryWindow, getWorkoutMuscleGroups } from "@/utils/fatigueManagement";
import { getTodayProgramWorkout } from "@/utils/programSchedule";
import { getWorkoutBodyData } from "@/utils/muscleVolumeUtils";
import MuscleHeatMap from "@/components/MuscleHeatMap";
import { SegmentedControl } from "@/components/ui/system";
import ExerciseCard from "@/components/workouts/ExerciseCard";
import WorkoutLoggingHeader from "@/components/workouts/WorkoutLoggingHeader";
import AddExerciseForm from "@/components/workouts/AddExerciseForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { getLastExercisePerformance } from "@/utils/exerciseStats";
import { useWorkoutSession } from "@/hooks/useWorkoutSession";
import { STALE_SESSION_MS } from "@/lib/workoutSessionFlag";

const isRunEx = (ex) => /\b(run|sprint|cardio|zone ?2)\b/i.test(ex.name || '');

// Name a prescribed run by its type; drop the "Garmin Zx-Zy. " provenance prefix
// from the notes so the interval/tempo structure shows on its own.
const CARDIO_TYPE_LABEL = {
  interval: "Intervals", threshold: "Threshold", tempo: "Tempo",
  long: "Long run", easy: "Easy run", recovery: "Recovery run",
};
const cardioStructure = (notes) => String(notes || "").replace(/^Garmin\s+[^.]*\.\s*/i, "").trim();

// Renders a program day's conditioning (run/swim) sessions. Reads the real
// cardio_sessions shape (activity_type / run_type / zone / duration_minutes /
// pace / notes) plus any run-named exercises. Shared by logging + view mode so
// the run detail — type, pace, and rep structure — is visible either way.
function CardioSessions({ programWorkout }) {
  const runExercises = (programWorkout?.exercises || []).filter(isRunEx).map((ex) => ({
    _name: ex.name, run_type: ex.run_type || null, zone: ex.zone || null,
    duration_minutes: ex.duration_minutes || null, time_of_day: ex.time_of_day || null,
    pace: ex.pace || null, notes: ex.notes || null,
  }));
  const allCardio = [...runExercises, ...(programWorkout?.cardio_sessions || [])];
  if (allCardio.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="section-label">Conditioning</p>
      {allCardio.map((c, i) => {
        const rtype = String(c.run_type || "").toLowerCase();
        const name = c._name || CARDIO_TYPE_LABEL[rtype] || (c.zone ? `${c.zone} ${c.activity_type || "run"}` : "Run");
        const structure = cardioStructure(c.notes);
        const meta = [
          c.duration_minutes ? `${c.duration_minutes} min` : null,
          c.pace ? `${c.pace}${/^\d+:\d{2}$/.test(String(c.pace)) ? "/mi" : ""}` : null,
          c.zone || null,
          c.time_of_day && c.time_of_day !== "anytime" ? c.time_of_day.toUpperCase() : null,
        ].filter(Boolean).join(" · ");
        return (
          <div key={`cardio-${i}`} className="flex items-start justify-between px-3.5 py-3 glass-inset">
            <div className="flex items-start gap-2.5">
              <Activity className="w-4 h-4 text-carb mt-0.5 shrink-0" />
              <div>
                <p className="text-[13.5px] font-bold text-ink">{name}</p>
                {meta && <p className="font-technical text-[11px] font-semibold text-ink-muted">{meta}</p>}
                {structure && <p className="text-[11px] text-ink-muted mt-0.5 leading-snug">{structure}</p>}
              </div>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-ink-muted border border-charcoal-border rounded-full px-2.5 py-1 shrink-0">Cardio</span>
          </div>
        );
      })}
    </div>
  );
}

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

// Engine-generated workouts carry the RIR target in the exercise notes ("RIR 2",
// "RIR 3 · ..."). No RIR in notes → 0, matching how scaleWeightToReps treats reps.
const parseRirFromNotes = (notes) => {
  const m = String(notes || '').match(/RIR\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : 0;
};

// "Back Squat (Top Set)" / "Back Squat (Back-off)" → "back squat"
const baseLiftName = (name) =>
  String(name || '').toLowerCase().replace(/\s*\([^)]*\)\s*$/, '').trim();

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
  const [recoveryWarnings, setRecoveryWarnings] = useState([]);
  const [restTimer, setRestTimer] = useState(null); // seconds remaining for rest (display only)
  const [restDuration, setRestDuration] = useState(90); // default rest duration
  const [muscleView, setMuscleView] = useState("anterior");
  const [resumeSession, setResumeSession] = useState(null); // session data to offer resume for
  const [showShotList, setShowShotList] = useState(false); // "Shot list" toggle — off by default, per-exercise shot notes
  const workoutCardRef = useRef(null);
  const restTimerRef = useRef(null); // setInterval handle
  const restTimerEndRef = useRef(null); // absolute end timestamp for the rest timer

  const { checkForActiveSession, createSession, saveProgress, completeSession, cancelSession, restoreSession } = useWorkoutSession();

  // Detect program source from URL params
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const isProgramSource = urlParams.get('source') === 'program';
  const enrollmentId = urlParams.get('enrollmentId');
  const programWorkoutId = urlParams.get('programWorkoutId');

  // Fetch user profile to get weight unit preference
  const { profile } = useProfile();
  const toggleLike = useToggleExerciseLike();
  const { shotNoteFor, noteCount: shotNoteCount, isLoading: shotNotesLoading, error: shotNotesError } = useExerciseShotNotes();
  const weightUnit = profile?.weight_unit || 'lbs';

  // Exercise reactions (like/dislike per exercise)

  // Fetch enrollment data (program mode only)
  const { data: enrollment, isError: enrollmentError, refetch: refetchEnrollment } = useQuery({
    queryKey: ['enrollment', enrollmentId],
    queryFn: () => db.entities.ProgramEnrollment.get(enrollmentId),
    enabled: isProgramSource && !!enrollmentId,
  });

  // Fetch program workout data (program mode only)
  const { data: programWorkout, isError: programWorkoutError, refetch: refetchProgramWorkout } = useQuery({
    queryKey: ['programWorkout', programWorkoutId],
    queryFn: () => db.entities.ProgramWorkout.get(programWorkoutId),
    enabled: isProgramSource && !!programWorkoutId,
  });

  const logProgramWorkout = useLogProgramWorkout();

  // Today's engine-computed loads (training_prescription.strength_block). The
  // approved plan (programWorkout.exercises) carries no load_lbs — it's the
  // static weekly shape, not the daily autoregulated numbers — so a session
  // seeded from it alone falls back to a from-history Epley estimate instead
  // of what the engine actually prescribed today. Same join PrescribedSessionCard
  // already does for display; this makes the logged session agree with it.
  const { prescription: todayPrescription, isLoading: isTodayPrescriptionLoading } = useTodayPrescription(getTodayString(profile?.timezone));
  const engineByName = useMemo(() => {
    const strengthBlock = todayPrescription?.prescription?.strength_block || [];
    return new Map(strengthBlock.map((ex) => [ex.name, ex]));
  }, [todayPrescription]);

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
    moveExercise,
    addExercise,
  } = useWorkoutExercises([]);

  // All exercise names in current workout (to avoid duplicates when replacing)
  const allExerciseNames = exerciseLogs.map(e => e.name);

  // Drag-to-reorder exercises. Items are keyed by their current index (stable
  // for the duration of a drag; a reorder itself changes indices, which is fine
  // since dnd-kit only needs identity to hold still mid-gesture).
  const dragSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const handleExerciseDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    moveExercise(Number(active.id), Number(over.id));
  };

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
      return;
    }
    const workoutId = urlParams.get('id');
    checkForActiveSession({ workoutId, programWorkoutId }).then((session) => {
      if (!session) return;
      const ageMs = Date.now() - new Date(session.start_time).getTime();
      // A live session is NEVER restarted or discarded. Set the phone down
      // mid-set, come back, reload: we drop straight back into logging with the
      // saved sets, no dialog and no confirmation. An empty `exercises` (started
      // logging but hasn't completed a set yet) restores too — the init effect
      // below reseeds the template and `isLogging` stays true.
      if (ageMs < STALE_SESSION_MS) {
        restoreSession(session.id);
        setExerciseLogs(session.exercises || []);
        setStartTime(new Date(session.start_time).getTime());
        setPreWorkoutNotes(session.notes || "");
        setIsLogging(true);
        return;
      }
      // Older than a day: silently resuming would be wrong (he's here for a new
      // workout), but auto-finishing threw the logged sets away with no
      // workout_logs row ever written. Ask instead.
      setResumeSession(session);
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
        // No id in the URL: resolve today's prescribed session instead of
        // dead-ending. Prefer a workout scheduled for today, otherwise fall
        // back to the most recently created workout. Only show the empty state
        // when the athlete genuinely has no saved workouts.
        try {
          const today = getTodayString(profile?.timezone);
          let resolved = null;

          const scheduled = await db.entities.WorkoutSchedule.filter({
            scheduled_date: today,
            created_by: user.id,
          });
          const scheduledWorkoutId = scheduled?.[0]?.workout_id;
          if (scheduledWorkoutId) {
            const scheduledWorkouts = await db.entities.Workout.filter({
              id: scheduledWorkoutId,
              created_by: user.id,
            });
            resolved = scheduledWorkouts[0] || null;
          }

          if (!resolved) {
            const allWorkouts = await db.entities.Workout.filter({ created_by: user.id });
            resolved = [...allWorkouts].sort(
              (a, b) => new Date(b.created_date || b.created_at || 0) - new Date(a.created_date || a.created_at || 0)
            )[0] || null;
          }

          if (resolved) {
            setWorkout(resolved);
          } else {
            setWorkoutNotFound(true);
          }
        } catch {
          setWorkoutNotFound(true);
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
    // Program-mode seeding needs today's engine loads to be in hand before it
    // runs once — the effect only fires while exerciseLogs.length === 0, so if
    // it seeds early off an empty engineByName it never gets a second chance
    // to pick up the real load_lbs once the prescription query resolves.
    if (isProgramSource && isTodayPrescriptionLoading) return;
    if (workout && isLogging && exerciseLogs.length === 0) {
      let initialLogs;

      // `sets` arrives in two shapes across sources: a COUNT (number, e.g. seeded
      // templates `sets: 4`) or an ARRAY of set objects (real saved workouts /
      // log format). Array.from({length: <array>}) coerces the array to NaN for
      // length != 1, seeding ZERO rows — so multi-set exercises rendered with
      // nothing to log. Normalize to a count for both init paths.
      const resolveSetCount = (sets, fallback = 3) =>
        Array.isArray(sets) ? (sets.length || fallback) : (Number(sets) || fallback);

      if (isProgramSource && programWorkout?.exercises && enrollment) {
        // Program mode: initialize with set types and target weights
        initialLogs = programWorkout.exercises.filter(ex => !isRunEx(ex)).map((ex, index) => {
          // The plan's set_scheme carries no load_lbs — it's the static weekly
          // shape, not the day's autoregulated numbers. Match today's engine row
          // (training_prescription.strength_block) by set_type so real e1RM-based
          // loads seed the session instead of a from-history Epley guess.
          // Keyed by label first: two blocks (e.g. "Back-off Vol" / "Back-off Int")
          // can share set_type "backoff", and keying on set_type alone would
          // collapse them so the last one's load wins for both.
          const engineBlocksByLabel = new Map(
            (engineByName.get(ex.name)?.set_scheme || []).map((b) => [b.label || b.set_type, b])
          );
          const targets = progressionTargetsMap[ex.name];
          const numSets = resolveSetCount(ex.sets);

          // Get last performance for autofill. A merged lift is logged under its
          // base name ("Bench Press") but everything before the merge was logged
          // under the variant names it was built from, so fall back to those —
          // otherwise every merged lift shows an empty history and seeds at zero.
          const lastPerf = getLastExercisePerformance(allWorkoutLogs, ex.name)
            || (ex.components || []).reduce(
                 (found, c) => found || getLastExercisePerformance(allWorkoutLogs, c), null);

          const targetReps = parseRepTarget(ex.rep_target);
          const scaledWeight = lastPerf?.lastWeight && lastPerf?.lastReps
            ? scaleWeightToReps(lastPerf.lastWeight, lastPerf.lastReps, targetReps)
            : lastPerf?.lastWeight || 0;

          // A lift the engine merged (heavy top set, then back-offs) arrives as ONE
          // exercise carrying a set_scheme: blocks of sets that each have their own
          // reps, RIR and load. Seed straight from the blocks so the card shows the
          // prescription as written instead of flattening it to one uniform target.
          // Everything else has no scheme and keeps the uniform seed.
          const scheme = Array.isArray(ex.set_scheme) ? ex.set_scheme : null;
          const sets = scheme
            ? scheme.flatMap((block) => {
                const blockReps = parseRepTarget(block.rep_target ?? ex.rep_target);
                const engineBlock = engineBlocksByLabel.get(block.label || block.set_type)
                  || engineBlocksByLabel.get(block.set_type);
                const blockWeight = engineBlock?.load_lbs
                  || block.load_lbs
                  || (lastPerf?.lastWeight && lastPerf?.lastReps
                      ? scaleWeightToReps(lastPerf.lastWeight, lastPerf.lastReps, blockReps)
                      : targets?.workingWeight || scaledWeight);
                return Array.from({ length: Number(block.sets) || 1 }, () => ({
                  reps: blockReps,
                  weight: blockWeight,
                  completed: false,
                  rpe: null,
                  rir: block.rir_target ?? ex.rir_target ?? null,
                  set_type: block.set_type || 'working',
                  set_label: block.label || null,
                }));
              }).map((s, setIndex) => ({ ...s, set_number: setIndex + 1 }))
            // All sets default to working type at working weight
            : Array.from({ length: numSets }, (_, setIndex) => ({
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
        // Standard mode: autofill with last used weight, scaled to target reps via Epley.
        // Two passes: first compute each exercise's own-history suggestion, then
        // derive back-off weights from the SAME DAY's top set instead of the
        // back-off's own logged history. History-based back-off fill self-
        // perpetuates bad data (a back-off once logged at top-set weight keeps
        // getting suggested at top-set weight forever); anchoring to the top
        // set's e1RM with the back-off's reps+RIR gives the intended drop
        // (e.g. top 3@RIR2 vs back-off 5@RIR3 → ~92% of top weight).
        const suggestions = workout.exercises?.map((exercise) => {
          const lastPerf = getLastExercisePerformance(allWorkoutLogs, exercise.name);
          const targetReps = parseRepTarget(exercise.reps);
          const weight = lastPerf?.lastWeight && lastPerf?.lastReps
            ? scaleWeightToReps(lastPerf.lastWeight, lastPerf.lastReps, targetReps)
            : lastPerf?.lastWeight || 0;
          return { exercise, targetReps, weight };
        }) || [];

        for (const s of suggestions) {
          if (!/\(back-?off/i.test(s.exercise.name)) continue;
          const top = suggestions.find(
            (t) => t !== s &&
              /\(top set\)/i.test(t.exercise.name) &&
              baseLiftName(t.exercise.name) === baseLiftName(s.exercise.name)
          );
          if (!top?.weight) continue;
          const topE1rm = top.weight * (1 + 0.0333 * (top.targetReps + parseRirFromNotes(top.exercise.notes)));
          const boPct = 1 + 0.0333 * (s.targetReps + parseRirFromNotes(s.exercise.notes));
          s.weight = Math.round((topE1rm / boPct) / 2.5) * 2.5;
        }

        initialLogs = suggestions.map((s, index) => ({
          name: s.exercise.name,
          exercise_index: index,
          sets: Array.from({ length: resolveSetCount(s.exercise.sets) }, (_, setIndex) => ({
            set_number: setIndex + 1,
            reps: s.targetReps,
            weight: s.weight,
            completed: false,
            rpe: null,
            set_type: 'working',
          })),
        }));
      }

      setExerciseLogs(initialLogs);
      // startTime is set by handleStartLogging (or handleResumeSession for resumed sessions)
    }
  }, [workout, isLogging, isProgramSource, programWorkout, enrollment, progressionTargetsMap, allWorkoutLogs, exerciseLogs.length, setExerciseLogs, engineByName, isTodayPrescriptionLoading]);

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
      const today = getTodayString(profile?.timezone);
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
        // Calculate which cycle this workout belongs to from today's schedule.
        // useProgram stores the program object directly under this key (not
        // wrapped as { program }); the cycle is also recomputed authoritatively
        // inside useLogProgramWorkout, so this is only a best-effort hint.
        const activeProgram = queryClient.getQueryData(['program', enrollment.program_id]);
        const todayWorkout = activeProgram ? getTodayProgramWorkout(enrollment, activeProgram.workouts || [], profile?.timezone) : null;
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

  // When a "(Top Set)" set is logged, cascade the ACTUAL performance into the
  // matching "(Back-off)" exercise: back-off weight = top set's e1RM (from what
  // was really lifted, not the autofill suggestion) scaled to the back-off's
  // reps + RIR. Only untouched (uncompleted) back-off sets are overwritten, so
  // a back-off already logged or hand-edited mid-session stays as entered.
  const handleUpdateSet = (exIdx, setIdx, field, value) => {
    updateSetData(exIdx, setIdx, field, value);

    if (field !== 'completed' || value !== true) return;
    setExerciseLogs(prev => {
      const top = prev[exIdx];
      if (!top || !/\(top set\)/i.test(top.name)) return prev;
      const set = top.sets?.[setIdx];
      const weight = Number(set?.weight);
      const reps = Number(set?.reps);
      if (!weight || !reps) return prev;

      const boIdx = prev.findIndex(
        (ex) => /\(back-?off/i.test(ex.name) && baseLiftName(ex.name) === baseLiftName(top.name)
      );
      if (boIdx < 0) return prev;

      const notesFor = (name) => workout?.exercises?.find((e) => e.name === name)?.notes;
      const topRir = set.rir ?? parseRirFromNotes(notesFor(top.name));
      const e1rm = weight * (1 + 0.0333 * (reps + topRir));
      const boNotesRir = parseRirFromNotes(notesFor(prev[boIdx].name));

      return prev.map((ex, i) => i !== boIdx ? ex : {
        ...ex,
        sets: ex.sets.map((s) => {
          if (s.completed) return s;
          const boReps = Number(s.reps) || reps;
          const boRir = s.rir ?? boNotesRir;
          const boWeight = Math.round((e1rm / (1 + 0.0333 * (boReps + boRir))) / 2.5) * 2.5;
          return { ...s, weight: boWeight };
        }),
      });
    });
  };

  // Replace an exercise with a chosen alternative.
  const handleReplaceExercise = (oldName, newExercise) => {
    setExerciseLogs(prev => prev.map(ex => {
      if (ex.name !== oldName) return ex;

      const repsRaw = String(newExercise.reps ?? newExercise.rep_target ?? "10").trim();
      const rangeMatch = repsRaw.match(/^(\d+)\s*-\s*(\d+)/);
      const newReps = rangeMatch
        ? Math.round((parseInt(rangeMatch[1], 10) + parseInt(rangeMatch[2], 10)) / 2)
        : (parseInt(repsRaw, 10) || ex.sets[0]?.reps || 10);

      // Autofill the replacement's load from its own history (scaled to the new
      // rep target), mirroring the initial-load seeding. Was hardcoded to 0, so
      // swapping blanked the weight even when the new movement had past logs.
      const lastPerf = getLastExercisePerformance(allWorkoutLogs, newExercise.name);
      const seedWeight = lastPerf?.lastWeight && lastPerf?.lastReps
        ? scaleWeightToReps(lastPerf.lastWeight, lastPerf.lastReps, newReps)
        : lastPerf?.lastWeight || 0;

      // Carry forward already-completed sets exactly as logged so a mid-exercise
      // swap never discards finished work; only the remaining (uncompleted) sets
      // adopt the replacement's seed load/reps.
      const completedCount = ex.sets.filter(s => s.completed).length;
      return {
        ...ex,
        name: newExercise.name,
        notes: completedCount > 0
          ? `Swapped ${oldName} → ${newExercise.name} after ${completedCount} set${completedCount > 1 ? 's' : ''}`
          : null,
        rest_seconds: newExercise.rest || newExercise.rest_seconds || ex.rest_seconds,
        sets: ex.sets.map((s, i) => s.completed
          ? { ...s, set_number: i + 1 }
          : {
              ...s,
              set_number: i + 1,
              reps: newReps,
              weight: seedWeight,
              completed: false,
              rpe: null,
              set_type: 'working',
            }),
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

  // Total sets the athlete has actually logged (marked complete). Gates the
  // logging header's coral Finish + live elapsed clock so the bar stays calm
  // until there's real progress — TASTE calm-until-progress, same threshold as
  // QuickWorkout's canFinish.
  const loggedSetsCount = exerciseLogs.reduce(
    (n, ex) => n + (ex.sets?.filter(s => s.completed).length || 0),
    0
  );

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

  // A program workout that genuinely failed to load (network/server error) is
  // retryable and distinct from a deleted/invalid workout link.
  const programLoadError = isProgramSource
    && (enrollmentError || programWorkoutError)
    && !!enrollmentId && !!programWorkoutId;
  const loadFailed = workoutNotFound
    || (isProgramSource && (enrollmentError || programWorkoutError || !enrollmentId || !programWorkoutId));

  if (loadFailed) {
    return (
      <div className="max-w-6xl mx-auto p-4 md:p-6 min-h-[calc(100dvh-var(--layout-header-height,56px)-var(--dock-clearance))] flex flex-col items-center justify-center">
        <Card className="w-full max-w-md mx-auto rise-in">
          <CardContent className="py-12 text-center">
            <i className="w-10 h-10 rounded-xl glass-inset text-ink-muted flex items-center justify-center not-italic mx-auto mb-3">
              <Dumbbell className="w-5 h-5" />
            </i>
            {programLoadError ? (
              <>
                <h2 className="type-display text-2xl text-ink mb-2">Couldn&apos;t load this workout</h2>
                <p className="text-[13px] font-semibold text-ink-muted mb-6">
                  Couldn&apos;t load this program workout, try again.
                </p>
                <div className="flex flex-col sm:flex-row sm:justify-center gap-3">
                  <Button
                    variant="volt"
                    size="lg"
                    className="w-full sm:w-auto"
                    onClick={() => { refetchEnrollment(); refetchProgramWorkout(); }}
                  >
                    <RotateCw className="w-4 h-4 mr-2" />
                    Try again
                  </Button>
                  <Button variant="ghost" size="lg" className="w-full sm:w-auto" onClick={() => navigate("/workouts")}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Workouts
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h2 className="type-display text-2xl text-ink mb-2">Workout not found</h2>
                <p className="text-[13px] font-semibold text-ink-muted mb-6">
                  This workout may have been deleted, or the link is no longer valid.
                </p>
                <Button variant="volt" size="lg" className="w-full sm:w-auto" onClick={() => navigate("/workouts")}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Workouts
                </Button>
              </>
            )}
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
          weightUnit={weightUnit}
          startTime={startTime}
          canFinish={loggedSetsCount > 0}
          restTimer={restTimer}
          restDuration={restDuration}
          onSkipRest={skipRestTimer}
          onAddRestTime={addRestTime}
        />
      )}

      <div className={`max-w-6xl mx-auto p-4 md:p-6 ${isLogging ? 'pt-16 pb-[calc(var(--logging-bar-clearance,132px)+16px)] lg:pt-32 lg:pb-6' : 'min-h-[calc(100dvh-var(--layout-header-height,56px)-var(--dock-clearance))] pb-32 lg:pb-6 flex flex-col'}`}>
        <div className="lg:flex lg:items-start lg:gap-6 w-full">
        <div className="flex-1 min-w-0 rise-in">
        {!isLogging && (
          <Button
            variant="ghost"
            size="lg"
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
                  <Badge variant="slate">Logging Active</Badge>
                )}
                {isLogging && (
                  <button
                    type="button"
                    onClick={() => setShowShotList((v) => !v)}
                    aria-pressed={showShotList}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold border transition-colors ${
                      showShotList
                        ? 'bg-brand/[0.16] border-brand/40 text-brand'
                        : 'border-charcoal-border text-ink-muted hover:border-brand/30 hover:text-ink'
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    Shot list
                  </button>
                )}
                {/* Diagnostic status while the toggle is on — a silent fetch failure
                    or an empty result otherwise looks identical to "feature missing". */}
                {isLogging && showShotList && (shotNotesError || shotNotesLoading || shotNoteCount === 0) && (
                  <span className="text-[11px] font-semibold text-warn self-center">
                    {shotNotesError
                      ? `Shot notes failed to load: ${shotNotesError.message || String(shotNotesError)}`
                      : shotNotesLoading
                        ? "Loading shot notes…"
                        : "No shot notes found for this account"}
                  </span>
                )}
              </div>
              {workout.exercises?.length > 0 && getWorkoutBodyData(workout.exercises).length > 0 && (
                <div className="flex items-center gap-2 shrink-0 lg:hidden">
                  <span className="section-label hidden sm:inline">Muscles worked</span>
                  <SegmentedControl
                    value={muscleView}
                    onChange={setMuscleView}
                    options={[
                      { value: "anterior", label: "Front" },
                      { value: "posterior", label: "Back" },
                    ]}
                  />
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col md:flex-row md:gap-8">
            <div className="flex-1 min-w-0">
              {/* Title + description */}
              <CardTitle className="type-display text-2xl mb-1">{workout.title}</CardTitle>
              {workout.description && workout.description.trim().toLowerCase() !== (workout.title || "").trim().toLowerCase() && (
                <p className="text-[13px] font-semibold text-ink-muted mb-4">{workout.description}</p>
              )}
              {/* wd-5: one HERO figure (Exercises — always present, the core
                  count for the session) reads as the hero-metric; Duration is
                  subordinate (smaller, muted) so the two summary numbers form a
                  clear hierarchy instead of two equal-weight twins. */}
              <div className="flex flex-wrap items-end gap-x-8 gap-y-3 mb-6">
                  <div className="flex items-center gap-2.5">
                    <Target className="w-6 h-6 text-ink-muted" />
                    <div>
                      <div className="section-label">Exercises</div>
                      <div className="hero-metric text-[28px] text-ink">{workout.exercises?.length || 0} <span className="text-[12px] font-semibold text-ink-muted">{(workout.exercises?.length || 0) === 1 ? 'exercise' : 'exercises'}</span></div>
                    </div>
                  </div>
                  {workout.duration_minutes != null && (
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-ink-faint" />
                      <div>
                        <div className="section-label">Duration</div>
                        <div className="font-technical font-bold text-[14px] text-ink-secondary">{workout.duration_minutes} <span className="text-[11px] font-semibold text-ink-muted">min</span></div>
                      </div>
                    </div>
                  )}
                </div>


                {!isLogging && !resumeSession && (
                  <div className="space-y-3">
                    <Button
                      onClick={handleStartLogging}
                      variant="volt"
                      size="lg"
                      className="w-full hidden lg:flex"
                    >
                      <Dumbbell className="w-5 h-5 mr-2" />
                      Start Logging Workout
                    </Button>
                    {workout.created_by === user.id && (
                      <div className="flex gap-2">
                        <Button
                          onClick={() => navigate(`/create-workout?edit=${workout.id}`)}
                          variant="outline"
                          size="lg"
                          className="flex-1"
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          Edit Workout
                        </Button>
                        <Button
                          onClick={() => cloneWorkoutMutation.mutate()}
                          variant="outline"
                          size="lg"
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

              {/* Right: muscle figure sidebar — hidden while logging so set inputs sit at the top */}
              {!isLogging && workout.exercises?.length > 0 && (() => {
                const bodyData = getWorkoutBodyData(workout.exercises);
                return bodyData.length > 0 ? (
                  <div className="flex flex-col items-center mt-4 md:mt-0 md:w-64 md:shrink-0 lg:hidden">
                    <MuscleHeatMap data={bodyData} view={muscleView} className="flex-1" maxWidth={150} />
                  </div>
                ) : null;
              })()}
          </CardContent>
        </Card>

        {isLogging ? (
          // Logging Mode - Show editable exercise logs
          <div className="space-y-6">
            {/* Pre-workout Notes — collapsed by default so the first exercise
                stays above the fold. Auto-opens if notes already exist. */}
            <details open={!!preWorkoutNotes} className="glass-inset group">
              <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
                <span className="section-label">Pre-workout Notes</span>
                <ChevronDown className="w-4 h-4 text-ink-muted transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <div className="px-4 pb-3">
                <Textarea
                  value={preWorkoutNotes}
                  onChange={(e) => setPreWorkoutNotes(e.target.value)}
                  placeholder="Anything notable going in? Energy, soreness, focus..."
                  className="bg-transparent border-none focus-visible:ring-0 px-0 min-h-[60px] resize-none text-base"
                />
              </div>
            </details>

            {/* Recovery warnings (program mode) */}
            {recoveryWarnings.length > 0 && (
              <div className="glass px-4 py-3">
                <div className="flex items-start gap-2.5">
                  <i className="w-[26px] h-[26px] rounded-sm bg-warn/[0.15] text-warn flex items-center justify-center flex-shrink-0 not-italic">
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

            <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={handleExerciseDragEnd}>
              <SortableContext
                items={exerciseLogs.map((_, i) => String(i))}
                strategy={verticalListSortingStrategy}
              >
                {exerciseLogs.map((exerciseLog, exerciseIndex) => {
                  const lastPerformance = getLastExercisePerformance(allWorkoutLogs, exerciseLog.name);
                  const programEx = isProgramSource ? programWorkout?.exercises?.find(ex => ex.name === exerciseLog.name) || null : null;
                  const targets = programEx ? progressionTargetsMap[programEx.name] : null;
                  // Match the template entry BY NAME, like programEx above. This was
                  // `workout.exercises[exerciseIndex]` — a positional lookup into an
                  // array that removeExercise never filters. Delete exercise 2 and
                  // exercise 3 slides into index 2 while the template at index 2 is
                  // still the deleted one, so the dead exercise's notes AND its
                  // target sets x reps (ExerciseCard renders both from this prop)
                  // reappear on the exercise below it.
                  const originalEx = workout?.exercises?.find(e => e.name === exerciseLog.name) || null;
                  return (
                    <SortableExerciseRow
                      key={exerciseIndex}
                      id={String(exerciseIndex)}
                      exerciseIndex={exerciseIndex}
                      // Scroll the card (and the active set row it contains) clear of
                      // the floating Cancel/Finish bar when focus/scrollIntoView lands
                      // here, matching the bar's measured footprint.
                      className="scroll-mb-[calc(var(--logging-bar-clearance,132px)+16px)] lg:scroll-mb-0"
                    >
                      {(dragHandleProps) => (
                        <ExerciseCard
                          exercise={exerciseLog}
                          exerciseIndex={exerciseIndex}
                          weightUnit={weightUnit}
                          onUpdateSet={handleUpdateSet}
                          onAddSet={addSet}
                          onRemoveSet={removeSet}
                          onRemoveExercise={removeExercise}
                          onUpdateNotes={updateExerciseNotes}
                          onUpdateName={updateExerciseName}
                          originalExercise={originalEx}
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
                          liked={isExerciseLiked(profile, exerciseLog.name)}
                          onToggleLike={() => toggleLike.mutate({ profile, exerciseName: exerciseLog.name })}
                          dragHandleProps={dragHandleProps}
                          showShotList={showShotList}
                          shotNote={shotNoteFor(exerciseLog.name)}
                        />
                      )}
                    </SortableExerciseRow>
                  );
                })}
              </SortableContext>
            </DndContext>

            {/* Cardio sessions (program mode only — separate from lift, not logged as sets) */}
            {isProgramSource && <CardioSessions programWorkout={programWorkout} />}

            {/* Add Exercise Form */}
            <AddExerciseForm onAdd={addExercise} exerciseNames={allHistoryExerciseNames} />
          </div>
        ) : (
          // View Mode - Show exercises read-only
          <>
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
                        <div className="w-8 h-8 rounded-full glass-inset border border-charcoal-border flex items-center justify-center text-ink-secondary font-technical font-extrabold text-[13px] flex-shrink-0">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[15px] font-extrabold text-ink mb-2">{exercise.name}</h4>
                          {isLogFormat ? (
                            <table className="w-full text-sm mt-2">
                              <thead>
                                <tr className="border-b border-charcoal-border">
                                  <th className="text-left py-2 px-2 text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink-muted">Set</th>
                                  <th className="text-left py-2 px-2 text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink-muted">Weight</th>
                                  <th className="text-left py-2 px-2 text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink-muted">Reps</th>
                                </tr>
                              </thead>
                              <tbody>
                                {exercise.sets.map((set, si) => (
                                  <tr key={si} className="border-b border-charcoal-borderSoft">
                                    <td className="py-2 px-2 font-technical font-extrabold text-ink-muted">{set.set_number}</td>
                                    <td className="py-2 px-2 font-technical font-semibold text-ink-secondary">{set.weight} <span className="text-[10px] text-ink-faint">{weightUnit}</span></td>
                                    <td className="py-2 px-2 font-technical font-semibold text-ink-secondary">{set.duration_s != null ? `${set.duration_s}s` : set.reps}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <div className="flex flex-wrap gap-4 text-[12.5px] font-semibold text-ink-muted">
                              {exercise.sets > 1 && (
                                <div>
                                  <span className="text-ink-muted">Sets:</span> <span className="font-technical font-extrabold text-ink-secondary">{exercise.sets}</span>
                                </div>
                              )}
                              <div>
                                <span className="text-ink-muted">{exercise.sets === 1 ? 'Duration / Target' : 'Reps'}:</span> <span className="font-technical font-extrabold text-ink-secondary">{exercise.reps}</span>
                              </div>
                              {exercise.rest_seconds > 0 && (
                                <div>
                                  <span className="text-ink-muted">Rest:</span> <span className="font-technical font-extrabold text-ink-secondary">{exercise.rest_seconds}s</span>
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

          {/* Conditioning — read-only run/swim detail (was missing from view mode,
              so a two-a-day's run had no clickable detail). */}
          {isProgramSource &&
            (programWorkout?.cardio_sessions?.length > 0 ||
              (programWorkout?.exercises || []).some(isRunEx)) && (
            <Card className="mt-3">
              <CardContent className="pt-4 pb-4">
                <CardioSessions programWorkout={programWorkout} />
              </CardContent>
            </Card>
          )}

          {/* Sticky thumb-zone primary action — mobile only. Keeps "Start
              Logging" reachable after scrolling the exercise list. Clears the
              floating dock via --dock-clearance + safe-area inset.
              wd-6: the CTA is its own teal action surface, so the wrapping
              glass-elevated panel (a card around a button) is dropped — the
              button rides directly in the sticky slot with no redundant chrome
              behind it. */}
          <div
            className="lg:hidden sticky bottom-0 -mx-4 px-4 pt-3 z-30 pointer-events-none"
            style={{ paddingBottom: 'calc(var(--dock-clearance) + env(safe-area-inset-bottom))' }}
          >
            <Button
              onClick={handleStartLogging}
              variant="volt"
              size="lg"
              className="w-full pointer-events-auto"
              data-tutorial="start-logging-btn"
            >
              <Dumbbell className="w-5 h-5 mr-2" />
              Start Logging Workout
            </Button>
          </div>
          </>
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
              <SegmentedControl
                value={muscleView}
                onChange={setMuscleView}
                size="md"
                className="mb-3"
                options={[
                  { value: "anterior", label: "Front" },
                  { value: "posterior", label: "Back" },
                ]}
              />
              <MuscleHeatMap data={bodyData} view={muscleView} maxWidth={200} />
            </div>
          ) : null;
        })()}
        </div>{/* end two-column flex */}
      </div>

      {/* Resume previous session prompt. Dismissing via scrim tap must NOT cancel
          the real in-progress session (that used to fire handleDismissResume, so
          an accidental tap outside the dialog silently discarded the workout) —
          onOpenChange is a no-op here; only the explicit "Start Fresh" button may
          cancel it. */}
      <Dialog open={!!resumeSession} onOpenChange={() => {}}>
        <DialogContent className="max-w-sm" hideClose>
          <DialogHeader>
            <DialogTitle>Resume Workout?</DialogTitle>
          </DialogHeader>
          <p className="text-[14px] font-medium text-ink-secondary leading-relaxed">
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
          <DialogDescription>
            Some sets haven't been checked off. Would you like to mark them all as complete?
          </DialogDescription>
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
        <DialogContent className="md:max-w-md">
          <DialogHeader>
            <DialogTitle>Finish Workout</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="section-label">Workout Notes</label>
              <Textarea
                value={postWorkoutNotes}
                onChange={(e) => setPostWorkoutNotes(e.target.value)}
                placeholder="What felt good/bad? Any injuries? Pump quality?"
                rows={4}
              />
            </div>
            <div className="flex gap-3">
              <Button variant="ghost" size="lg" className="flex-1" onClick={() => setShowPostWorkoutDialog(false)}>
                Go Back
              </Button>
              <Button
                variant="volt"
                size="lg"
                className="flex-[2]"
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
