import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProfile, useToggleExerciseLike, useExerciseShotNotes } from "@/hooks/useUserQueries";
import { useTodayPrescription } from "@/hooks/useEngineQueries";
import { useWorkoutExercises } from "@/hooks/useWorkoutExercises";
import { useLogProgramWorkout } from "@/hooks/useProgramQueries";
import { resolveProgramLibraryWorkoutId } from "@/lib/resolveProgramLibraryWorkoutId";
import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/ui/loading-spinner";
import { queryKeys, invalidateSchedule, invalidateWorkoutLogs, invalidateWorkouts, invalidatePrograms } from "@/lib/queryKeys";
import { ArrowLeft, Edit, Copy } from "lucide-react";
import { PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { getTodayString } from "@/utils/dateUtils";
import { toast } from "sonner";
import { calculateDailyTargets, transferProgressionState } from "@/utils/programProgression";
import { getTodayProgramWorkout } from "@/utils/programSchedule";
import { getWorkoutBodyData } from "@/utils/muscleVolumeUtils";
import { SegmentedControl } from "@/components/ui/system";
import ExerciseCard from "@/components/workouts/ExerciseCard";
import WorkoutLoggingHeader from "@/components/workouts/WorkoutLoggingHeader";
import AddExerciseForm from "@/components/workouts/AddExerciseForm";
import { getLastExercisePerformance } from "@/utils/exerciseStats";
import { isWarmupSet, baseType } from "@/utils/setTypes";
import { currentE1rm, loadForTarget } from "@/utils/e1rm";
import { exerciseProgressionWeight, doubleSeed } from "@/utils/progressionRules";
import { applyEquipmentProfileToWorkout, substituteFor } from "@/utils/equipmentProfile";
import { orderExercisesForFatigue } from "@/utils/exerciseOrder";
import { useWorkoutSession } from "@/hooks/useWorkoutSession";
import { useWeighInGate } from "@/hooks/useWeighInGate";
import { STALE_SESSION_MS, AUTO_FINISH_STALE_MS, AUTO_FINISH_MAX_AGE_MS } from "@/lib/workoutSessionFlag";
import { sessionSilenceMs } from "@/lib/buildWorkoutLogFromSession";

import { isRunEx, scaleWeightToReps, parseRirFromNotes, parseRirTarget, baseLiftName } from "@/components/workouts/detail/workoutDetailUtils";
import { buildInitialLogs } from "@/components/workouts/detail/buildInitialLogs";
import WorkoutDetailDialogs from "../components/workouts/detail/WorkoutDetailDialogs";
import WorkoutViewMode from "../components/workouts/detail/WorkoutViewMode";
import WorkoutLogger from "../components/workouts/detail/WorkoutLogger";
import AnatomySidebar from "../components/workouts/detail/AnatomySidebar";
import SessionCard from "../components/workouts/detail/SessionCard";
import SessionChips from "../components/workouts/detail/SessionChips";

// Name a prescribed run by its type; drop the "Garmin Zx-Zy. " provenance prefix
// from the notes so the interval/tempo structure shows on its own.
import { useRestTimer } from "@/components/workouts/detail/useRestTimer";
import CardioSessions from "@/components/workouts/detail/CardioSessions";
import WorkoutLoadError from "../components/workouts/detail/WorkoutLoadError";

export default function WorkoutDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [rawWorkout, setWorkout] = useState(null);
  const [workoutNotFound, setWorkoutNotFound] = useState(false);
  const [isLogging, setIsLogging] = useState(false);
  const [preWorkoutNotes, setPreWorkoutNotes] = useState("");
  const [postWorkoutNotes, setPostWorkoutNotes] = useState("");
  const [showPostWorkoutDialog, setShowPostWorkoutDialog] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [muscleView, setMuscleView] = useState("anterior");
  const [resumeSession, setResumeSession] = useState(null); // session data to offer resume for
  const [showShotList, setShowShotList] = useState(false); // "Shot list" toggle — off by default, per-exercise shot notes

  // "Keep the important things in sight" (Nolan, r4d review): while a workout
  // is actively logging, the only persistent chrome is this page's own logging
  // header + rest bar — Layout's shared mobile page header (title/date/avatar)
  // and the floating tab dock both get out of the way, the way Strong/Hevy do.
  // Layout.jsx receives currentPageName as a static route prop, not isLogging,
  // so it can't tell "viewing" from "logging" on the same /workout-detail
  // route itself — a body data-attribute (flipped here, read by plain CSS in
  // index.css) is the least invasive way to reach into Layout's DOM without
  // threading isLogging through props Layout wasn't built to take. The resize
  // dispatch nudges Layout's existing updateHeaderHeight effect (it already
  // checks getComputedStyle(...).display !== "none") to recompute
  // --layout-header-height to 0 the instant the header is hidden, so the sub-tab
  // strip / sticky offsets that key off that var don't leave a stale gap.
  useEffect(() => {
    document.body.toggleAttribute("data-logging-active", isLogging);
    window.dispatchEvent(new Event("resize"));
    return () => {
      document.body.removeAttribute("data-logging-active");
      window.dispatchEvent(new Event("resize"));
    };
  }, [isLogging]);

  const { sessionIdRef, checkForActiveSession, createSession, saveProgress, completeSession, autoFinishSession, cancelSession, restoreSession, getSessionStatus, saveFailed, retrySave } = useWorkoutSession();

  // Detect program source from URL params
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const isProgramSource = urlParams.get('source') === 'program';
  const enrollmentId = urlParams.get('enrollmentId');
  const programWorkoutId = urlParams.get('programWorkoutId');

  // Fetch user profile to get weight unit preference
  const { profile, settled: profileSettled } = useProfile();

  // Weigh-in gate for the "Start Logging Workout" choke point below. Skipped
  // when Today's own card already ran this gate before navigating here
  // (location.state.weighInGated) -- otherwise every day a program workout or
  // library workout is started from here (Train tab, program detail, a
  // workout's own detail page) rather than Today's session card, he is never
  // asked and the weight trend loses the day.
  const { guardStart: guardWeighInStart, gateSheet: weighInGateSheet } = useWeighInGate(
    getTodayString(profile?.timezone),
    { skip: !!location.state?.weighInGated }
  );

  // Equipment substitution. rawWorkout is what's stored; `workout` is what he can
  // actually run where he is today. A library workout never passes through the
  // engine, so this is the only place a Casper day gets the rack squat swapped
  // out. On a program workout the engine already re-planned, leaving nothing
  // blocked for this to find, so it's a no-op there rather than a second opinion.
  const equipmentProfile = profile?.equipment_profile || "full_gym";
  const { workout, swaps: equipmentSwaps } = useMemo(
    () => applyEquipmentProfileToWorkout(rawWorkout, equipmentProfile),
    [rawWorkout, equipmentProfile]
  );
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
    queryFn: async () => {
      const pw = await db.entities.ProgramWorkout.get(programWorkoutId);
      return pw ? { ...pw, exercises: orderExercisesForFatigue(pw.exercises) } : pw;
    },
    enabled: isProgramSource && !!programWorkoutId,
  });

  const logProgramWorkout = useLogProgramWorkout();

  // Today's engine-computed loads (training_prescription.strength_block). The
  // approved plan (programWorkout.exercises) carries no load_lbs — it's the
  // static weekly shape, not the daily autoregulated numbers — so a session
  // seeded from it alone falls back to a from-history Epley estimate instead
  // of what the engine actually prescribed today. Same join PrescribedSessionCard
  // already does for display; this makes the logged session agree with it.
  const { prescription: rawTodayPrescription, isLoading: isTodayPrescriptionLoading } = useTodayPrescription(getTodayString(profile?.timezone));

  // Today's engine row describes TODAY. The Weekly Schedule links every day of
  // the plan through this same route, so opening a lower day from two weeks ago
  // used to seed the logger from today's upper block: the filter branch stripped
  // the old session down to whatever overlapped today, and the re-planned branch
  // (plan_pinned === false, which is every day while an equipment_profile is set)
  // replaced its movements outright. Tapping Start Session on a two-week-old
  // Lower day therefore started an Upper session. Only let the engine layer touch
  // the session when the program workout on screen IS today's.
  // Null until programWorkout resolves — `workout` is built from programWorkout,
  // and the seeding effect below is gated on `workout`, so this can never read
  // "not today" while the real today session is still loading.
  const isTodaysProgramWorkout =
    !!programWorkout?.scheduled_date
    && programWorkout.scheduled_date === getTodayString(profile?.timezone);
  const todayPrescription = isTodaysProgramWorkout ? rawTodayPrescription : null;
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
    insertSet,
    removeExercise,
    updateExerciseNotes,
    updateExerciseName,
    moveExercise,
    addExercise,
  } = useWorkoutExercises([]);

  // Wrap removeSet with an Undo toast: a fast-thumb delete right next to the
  // completion check (r1-03) has no other recovery path once tapped.
  const handleRemoveSet = (exerciseIndex, setIndex) => {
    const removedSet = exerciseLogs[exerciseIndex]?.sets?.[setIndex];
    const exerciseName = exerciseLogs[exerciseIndex]?.name;
    removeSet(exerciseIndex, setIndex);
    if (removedSet) {
      toast(`Set ${removedSet.set_number} removed`, {
        // Global closeButton (App.jsx) is pinned top-right and always tappable
        // on an actionable toast, which sits right on top of the Undo button
        // in the thumb zone. Off here so Undo isn't fighting a second tap
        // target for the same corner.
        closeButton: false,
        action: {
          label: "Undo",
          onClick: () => insertSet(exerciseIndex, setIndex, removedSet, exerciseName),
        },
      });
    }
  };

  // All exercise names in current workout (to avoid duplicates when replacing)
  const allExerciseNames = exerciseLogs.map(e => e.name);

  // Drag-to-reorder exercises. Items are keyed by their current index (stable
  // for the duration of a drag; a reorder itself changes indices, which is fine
  // since dnd-kit only needs identity to hold still mid-gesture).
  const dragSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const handleExerciseDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = Number(active.id);
    const toIndex = Number(over.id);
    moveExercise(fromIndex, toIndex);
    // Focus follows the exercise it was pointed at through the reorder (same
    // splice semantics as moveExercise itself), so dragging the focused card
    // doesn't silently refocus whatever slid into its old slot.
    setFocusedExerciseIndex((current) => {
      if (current === null) return current;
      if (current === fromIndex) return toIndex;
      if (fromIndex < toIndex && current > fromIndex && current <= toIndex) return current - 1;
      if (fromIndex > toIndex && current >= toIndex && current < fromIndex) return current + 1;
      return current;
    });
  };

  // Wraps the hook's removeExercise so focus follows a deletion instead of
  // pointing at whatever exercise slides into the removed index. Resets to
  // null (not immediately recomputed here) so the sticky-focus init effect
  // re-derives "first incomplete exercise" against the post-removal list.
  const handleRemoveExercise = (index) => {
    removeExercise(index);
    setFocusedExerciseIndex((current) => {
      if (current === null) return current;
      if (index < current) return current - 1;
      if (index === current) return null;
      return current;
    });
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

  // On mount, check for an in-progress session to offer resumption. Gated on
  // profileSettled (r6 review, major: `!isLoading` alone reads false for one
  // render while a disabled->enabled profile query is still spinning up,
  // before it's fetched anything -- `settled` requires isFetched/isSuccess or
  // an error), same as the global sweep in useGlobalAutoFinish (Layout.jsx)
  // -- a cold deep-link straight into this page could otherwise run
  // autoFinishSession before the profile query resolves, filing a swept
  // workout under the device's timezone instead of his actual profile one.
  // Once settled, a profile with no timezone set falls back to the device's
  // own Intl timezone explicitly. mountCheckDoneRef keeps this a true
  // "on mount" check (once profileSettled first flips true) rather than
  // re-running every time profileSettled happens to re-flip.
  const mountCheckDoneRef = useRef(false);
  useEffect(() => {
    if (isTutorialDemo || !profileSettled || mountCheckDoneRef.current) {
      return;
    }
    mountCheckDoneRef.current = true;
    const timezone = profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const workoutId = urlParams.get('id');
    checkForActiveSession({ workoutId, programWorkoutId }).then((session) => {
      if (!session) return;
      const ageMs = Date.now() - new Date(session.start_time).getTime();
      // null when updated_at is unavailable: never guess from start_time.
      const silenceMs = sessionSilenceMs(session);

      // Went quiet for hours but is still today's: he finished lifting and
      // never pressed Finish. Write the log, close the row, and fall through
      // to a fresh workout. Up to AUTO_FINISH_MAX_AGE_MS (48h), so
      // yesterday's forgotten session is logged too, under its start date.
      if (silenceMs !== null && silenceMs >= AUTO_FINISH_STALE_MS && ageMs < AUTO_FINISH_MAX_AGE_MS) {
        autoFinishSession(session, timezone).then((result) => {
          if (result === "logged") {
            invalidateWorkoutLogs(queryClient);
            return;
          }
          if (result === "cancelled") {
            // Empty session, closed with no log -- nothing to resume.
            return;
          }
          // result === false: either this call did the work and it failed
          // (log write or status update), or a concurrent caller (the
          // global sweep, most likely) already handled this exact session
          // id and we awaited ITS outcome instead of racing it -- the old
          // Set-based guard used to hand back a bare `false` here that
          // could not tell those two apart, so a session the sweep had
          // already closed still showed a stale Resume dialog. Re-read the
          // row directly: if it's no longer in_progress, treat it as
          // already handled.
          getSessionStatus(session.id).then((status) => {
            if (status && status !== "in_progress") {
              invalidateWorkoutLogs(queryClient);
            } else {
              setResumeSession(session);
            }
          });
        });
        return;
      }

      // A live session is NEVER restarted or discarded. Set the phone down
      // mid-set, come back, reload: we drop straight back into logging with the
      // saved sets, no dialog and no confirmation. An empty `exercises` (started
      // logging but hasn't completed a set yet) restores too — the init effect
      // below reseeds the template and `isLogging` stays true.
      if (ageMs < STALE_SESSION_MS) {
        restoreSession(session.id, session.exercises);
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
  }, [profileSettled]);

  // Flipping the equipment toggle mid-session rewrites the live logger too.
  // The seeding effect below only runs on an empty log, so without this the
  // header would say Casper while the cards still listed the racked squat.
  // Renaming in place keeps whatever sets are already completed.
  useEffect(() => {
    if (!exerciseLogs.length) return;
    let changed = false;
    const next = exerciseLogs.map((log) => {
      const to = substituteFor(log.name, equipmentProfile);
      if (!to || to === log.name) return log;
      changed = true;
      return { ...log, name: to };
    });
    if (changed) setExerciseLogs(next);
  // exerciseLogs is read, not watched: this only needs to fire on a profile change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipmentProfile]);

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

  // Initialize exercise logs when workout loads or logging mode starts
  useEffect(() => {
    // Program-mode seeding needs today's engine loads to be in hand before it
    // runs once — the effect only fires while exerciseLogs.length === 0, so if
    // it seeds early off an empty engineByName it never gets a second chance
    // to pick up the real load_lbs once the prescription query resolves.
    if (isProgramSource && isTodayPrescriptionLoading) return;
    if (workout && isLogging && exerciseLogs.length === 0) {
      const initialLogs = buildInitialLogs({ workout, isProgramSource, programWorkout, enrollment, progressionTargetsMap, allWorkoutLogs, engineByName, todayPrescription, equipmentProfile, weightUnit });
      setExerciseLogs(initialLogs);
      // startTime is set by handleStartLogging (or handleResumeSession for resumed sessions)
    }
  }, [workout, isLogging, isProgramSource, programWorkout, enrollment, progressionTargetsMap, allWorkoutLogs, exerciseLogs.length, setExerciseLogs, engineByName, todayPrescription, isTodayPrescriptionLoading, equipmentProfile]);

  const { restTimer, restDuration, startRestTimer, skipRestTimer, addRestTime } = useRestTimer();

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
      toast.success("Workout cloned.");
      navigate(`/create-workout?edit=${clonedWorkout.id}`);
    },
    onError: (error) => {
      toast.error("Workout not cloned. Try again.");
      console.error("Error cloning workout:", error);
    },
  });

  const saveWorkoutLogMutation = useMutation({
    mutationFn: async () => {
      // Re-check before writing anything. The session could have been
      // closed out from under this page mid-workout -- most likely the
      // global sweep auto-finishing it after 3h of silence, or finding it
      // empty and cancelling it -- and this button doesn't know that until
      // it asks. Checked first, before any Workout/WorkoutSchedule/WorkoutLog
      // row is created, so a "closed" verdict here never leaves an orphaned
      // Workout or WorkoutSchedule row behind with no log to match it.
      const sid = sessionIdRef.current;
      if (sid) {
        const status = await getSessionStatus(sid);
        if (status && status !== "in_progress") {
          return { alreadyClosed: true };
        }
      }

      const today = getTodayString(profile?.timezone);
      const durationSeconds = startTime ? Math.floor((Date.now() - startTime) / 1000) : null;

      // Resolve the real workout ID — program workouts use a synthetic ID
      // from the ProgramWorkout table, which doesn't exist in the workouts table
      let realWorkoutId = workout.id;

      if (workout._isProgramWorkout) {
        realWorkoutId = await resolveProgramLibraryWorkoutId(
          { ...workout, source_workout_id: programWorkout?.source_workout_id },
          user.id
        );
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
      // program_id / enrollment_id exist on workout_logs and were never
      // populated, so all 98 rows read null and nothing downstream could tell
      // a programmed session from a one-off.
      await db.entities.WorkoutLog.create({
        created_by: user.id,
        workout_schedule_id: scheduleId,
        workout_id: realWorkoutId,
        program_id: (isProgramSource && enrollment?.program_id) || null,
        enrollment_id: (isProgramSource && enrollment?.id) || null,
        log_date: today,
        exercises: exerciseLogs,
        duration_seconds: durationSeconds,
        notes: combinedNotes || null,
      });

      return { alreadyClosed: false };
    },
    onSuccess: (result) => {
      // Close first. In program mode the navigate() below is gated on a second
      // round trip (logProgramWorkout), so between the insert landing and that
      // resolving the screen is unchanged and this dialog is still up with its
      // button re-enabled. That window is how a log gets submitted twice.
      setShowPostWorkoutDialog(false);
      completeSession();
      invalidateSchedule(queryClient);
      invalidateWorkoutLogs(queryClient);

      if (result?.alreadyClosed) {
        toast.info("This workout was already saved.");
        navigate(isProgramSource && enrollment ? `/program/${enrollment.program_id}` : "/dashboard");
        return;
      }

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
                toast.success("Program complete.", { duration: 5000 });
              } else {
                toast.success("Workout logged. Progression updated.");
              }
              navigate(isProgramSource && enrollment ? `/program/${enrollment.program_id}` : "/dashboard");
            },
            onError: () => {
              toast.success("Workout logged. Progression not updated.");
              navigate(isProgramSource && enrollment ? `/program/${enrollment.program_id}` : "/dashboard");
            },
          }
        );
      } else {
        toast.success("Workout logged.");
        navigate(isProgramSource && enrollment ? `/program/${enrollment.program_id}` : "/dashboard");
      }
    },
    onError: (error) => {
      // workout_logs_no_exact_dupes is UNIQUE (created_by, log_date,
      // md5(exercises)). Hitting it means this exact workout is already saved,
      // so the athlete's data is safe and the only real defect is telling them
      // otherwise in Postgres' words. Treat it as the success it is.
      const dupe = error?.code === "23505"
        || /duplicate key|no_exact_dupes/i.test(error?.message || "");
      if (dupe) {
        setShowPostWorkoutDialog(false);
        toast.success("Workout already logged.");
        navigate(isProgramSource && enrollment ? `/program/${enrollment.program_id}` : "/dashboard");
        return;
      }
      toast.error(error.message || "Workout not saved. Check your connection and try again.");
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
      // A warm-up is not the top set; never derive back-off loads from it.
      if (isWarmupSet(set)) return prev;
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
      const seedWeight = exerciseProgressionWeight(allWorkoutLogs, newExercise) || loadForTarget(
          currentE1rm(allWorkoutLogs, newExercise.name, { components: newExercise.components || [], anchor: newExercise.e1rm_anchor }),
          newReps, parseRirTarget(newExercise.rir_target ?? newExercise.rir), weightUnit === 'kg' ? 2.5 : 5)
        || (lastPerf?.lastWeight && lastPerf?.lastReps
          ? scaleWeightToReps(lastPerf.lastWeight, lastPerf.lastReps, newReps)
          : lastPerf?.lastWeight || 0);

      const swapSeed = newExercise.progression?.type === 'double'
        ? doubleSeed(allWorkoutLogs, newExercise) : null;

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
              reps: swapSeed?.reps[i] ?? newReps,
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
    if (isTutorialDemo) {
      setIsLogging(true);
      return;
    }
    // Gate before anything flips to the logging view: a workout started from
    // here (Train tab, program detail, a workout's own detail page) never
    // ran Today's card gate, so this is the choke point that asks for today's
    // weigh-in no matter how the session got started. Deferred until the
    // gate resolves (weight on record, logged, or skipped) rather than racing
    // it behind setIsLogging(true).
    guardWeighInStart(() => {
      setIsLogging(true);
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
    });
  };

  const handleResumeSession = async () => {
    if (!resumeSession) return;
    // The dialog's snapshot can be stale by the time he taps Resume -- the
    // global sweep runs again on every visibilitychange, so a session that
    // failed to auto-finish when the dialog first opened can have been
    // closed successfully since. Re-check rather than trust the snapshot.
    const status = await getSessionStatus(resumeSession.id);
    if (status && status !== "in_progress") {
      setResumeSession(null);
      invalidateWorkoutLogs(queryClient);
      return;
    }
    restoreSession(resumeSession.id, resumeSession.exercises);
    setExerciseLogs(resumeSession.exercises || []);
    setStartTime(new Date(resumeSession.start_time).getTime());
    setPreWorkoutNotes(resumeSession.notes || "");
    setIsLogging(true);
    setResumeSession(null);
  };

  const handleDismissResume = () => {
    // Cancel the old session and start fresh
    restoreSession(resumeSession.id, resumeSession.exercises);
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
  // Cancel-confirm now lives at the page level: the header lost its own
  // kebab in the Phase A rebuild, so "Cancel workout" is reachable from the
  // focused exercise's kebab (and the zero-exercise fallback below) instead.
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

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

  const totalSetsCount = exerciseLogs.reduce((n, ex) => n + (ex.sets?.length || 0), 0);

  // "Done?" prompt, same rule as QuickWorkout: when the tick that was just made
  // completes EVERY set, ask whether the lifter is finished. It fires only on
  // the single-set transition (done: N-1 -> N with the set count unchanged), so
  // restoring a finished session, "Complete All", or editing the plan never
  // triggers it. It never finishes anything itself: "Finish workout" runs the
  // same handler as the header's Finish (RIR warning included), and Finish
  // stays a deliberate tap (CLAUDE.md: a workout never stops on its own).
  const prevSetCountsRef = useRef({ done: 0, total: 0 });
  const [showAllDonePrompt, setShowAllDonePrompt] = useState(false);
  useEffect(() => {
    const prev = prevSetCountsRef.current;
    prevSetCountsRef.current = { done: loggedSetsCount, total: totalSetsCount };
    if (resumeSession || isTutorialDemo) return;
    if (
      totalSetsCount > 0
      && loggedSetsCount === totalSetsCount
      && prev.total === totalSetsCount
      && prev.done === totalSetsCount - 1
    ) {
      setShowAllDonePrompt(true);
    }
  }, [loggedSetsCount, totalSetsCount, resumeSession, isTutorialDemo]);

  // Focused-exercise model (Ledger rebuild): exactly one exercise renders the
  // full rich card; every other exercise (before or after it) renders as a
  // compact one-line row (ExerciseCard's own isFocused=false branch), which
  // already carries the "upcoming exercise" info the old standalone Next
  // module used to compute separately — that block is gone now so upcoming
  // exercises don't show up twice.
  //
  // STICKY on purpose: initialized once (below, via useLayoutEffect) to the
  // first exercise with an incomplete set, then only ever changed by an
  // explicit user action (tapping a compact row, or dragging/removing the
  // exercise it points at). Recomputing "first incomplete" on every render
  // would yank focus away the instant its last set is checked, taking Undo /
  // Add Set / Remove Set with it mid-interaction.
  const [focusedExerciseIndex, setFocusedExerciseIndex] = useState(null);
  useLayoutEffect(() => {
    if (focusedExerciseIndex !== null) return;
    if (exerciseLogs.length === 0) return;
    const idx = exerciseLogs.findIndex((ex) => ex.sets?.some((s) => !s.completed));
    setFocusedExerciseIndex(idx === -1 ? 0 : idx);
    // Re-derive whenever the list goes from empty -> non-empty (session
    // start/resume) OR whenever something explicitly resets focus back to
    // null (handleRemoveExercise, when the removed exercise was the focused
    // one). The guard above (focusedExerciseIndex !== null) still blocks
    // every other render, so this only recomputes on those two transitions,
    // never on every keystroke/set-toggle (review r4f MAJOR 2: previously
    // depended only on exerciseLogs.length === 0, so removing one exercise
    // from a longer list never re-fired this effect and focus silently fell
    // back to plain index 0 via the effectiveFocusIndex ?? 0 below, instead
    // of the first-incomplete exercise, permanently breaking auto-advance
    // until the user tapped a row by hand).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseLogs.length === 0, focusedExerciseIndex]);

  const effectiveFocusIndex = exerciseLogs.length === 0
    ? -1
    : Math.min(focusedExerciseIndex ?? 0, exerciseLogs.length - 1);

  // Auto-advance (Phase A, MF-referenced): once the focused exercise's last
  // set is checked, hand focus to the next incomplete exercise ~600ms later
  // so the just-checked row stays on screen for a beat before the swap.
  // exerciseLogsRef keeps a live snapshot for the timeout callback (the
  // effect itself depends only on the focused exercise's own done-ness, not
  // on exerciseLogs identity, so a keystroke elsewhere doesn't cancel/replay
  // a pending advance).
  const exerciseLogsRef = useRef(exerciseLogs);
  exerciseLogsRef.current = exerciseLogs;
  const autoAdvanceTimerRef = useRef(null);
  // Tracks {index, done} of the LAST render's focused exercise. Advisor
  // caught a real bug in the first pass: tracking only a bare "was done"
  // boolean meant tapping a chip for an ALREADY-done exercise (index changes,
  // done stays true) still read as "not done -> done" and rescheduled an
  // advance, bouncing the user straight back off the exercise they just
  // navigated to review/edit. Only schedule when the SAME index flips from
  // not-done to done.
  const prevFocusedRef = useRef({ index: -1, done: false });
  const focusedExerciseForAdvance = exerciseLogs[effectiveFocusIndex];
  const focusedAllSetsDone = !!(
    focusedExerciseForAdvance?.sets?.length > 0
    && focusedExerciseForAdvance.sets.every((s) => s.completed)
  );

  useEffect(() => {
    const prev = prevFocusedRef.current;
    if (focusedAllSetsDone && prev.index === effectiveFocusIndex && !prev.done) {
      const focusIndexAtSchedule = effectiveFocusIndex;
      autoAdvanceTimerRef.current = setTimeout(() => {
        setFocusedExerciseIndex((current) => {
          // Only advance if the user hasn't already moved focus manually,
          // and only to an exercise that still has incomplete sets — never
          // jump when everything's done.
          if (current !== focusIndexAtSchedule) return current;
          const logs = exerciseLogsRef.current;
          const nextIncomplete = logs.findIndex((ex, i) =>
            i !== current && !(ex.sets?.length > 0 && ex.sets.every((s) => s.completed))
          );
          return nextIncomplete === -1 ? current : nextIncomplete;
        });
      }, 600);
    }
    prevFocusedRef.current = { index: effectiveFocusIndex, done: focusedAllSetsDone };

    return () => {
      if (autoAdvanceTimerRef.current) {
        clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
      }
    };
  }, [focusedAllSetsDone, effectiveFocusIndex]);

  // Reorder mode (Ledger rebuild): one toggle, lifted here, governs whether
  // ANY ExerciseCard shows its drag handle — hidden by default (mockup's
  // flush rows carry no handle) until chosen from a card's kebab.
  const [reorderMode, setReorderMode] = useState(false);

  const markAllSetsComplete = () => {
    setExerciseLogs(prev => prev.map(ex => ({
      ...ex,
      sets: ex.sets.map(s => ({ ...s, completed: true })),
    })));
  };

  // Completed top sets with no RIR (e.g. checked off via "Complete All" or
  // logged before this rule). Flagged once on Finish, never a hard block, so
  // older data can't trap a workout.
  const topSetsMissingRir = () => exerciseLogs.flatMap(ex => (ex.sets || [])
    .filter(s => s.completed && baseType(s) === 'top_set' && s.rir == null && s.rpe == null)
    .map(s => `${ex.name} set ${s.set_number}`));
  const rirFlaggedRef = useRef(false);

  const handleSaveWorkoutLog = () => {
    if (isTutorialDemo) { navigate('/dashboard'); return; }
    const missingRir = profile?.show_rir ?? true ? topSetsMissingRir() : [];
    if (missingRir.length && !rirFlaggedRef.current) {
      rirFlaggedRef.current = true;
      toast.warning(`Top set missing RIR: ${missingRir.join(', ')}. Add it, or tap Finish again to save as-is.`, { duration: 6000 });
      return;
    }
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
      <WorkoutLoadError navigate={navigate} programLoadError={programLoadError} refetchEnrollment={refetchEnrollment} refetchProgramWorkout={refetchProgramWorkout} />
    );
  }

  if (!workout || !user || (isProgramSource && (!enrollment || !programWorkout))) {
    return <LoadingScreen />;
  }

  // Session chips + muscle-view toggle — unchanged markup/handlers, just
  // lifted out so both the full (!isLogging) card and the compact isLogging
  // "Session details" disclosure (below the logger) can render the identical
  // elements instead of forking the JSX. Every branch inside was already
  // gated on isLogging itself, so relocating the container changes nothing
  // about when each chip appears. Defined after the loading/not-found guards
  // above (not a hook, so this is safe) since it reads workout.focus/exercises.
  const chipsRow = (
    <SessionChips equipmentSwaps={equipmentSwaps} isLogging={isLogging} isProgramSource={isProgramSource} programWorkout={programWorkout} refetchProgramWorkout={refetchProgramWorkout} setShowShotList={setShowShotList} shotNoteCount={shotNoteCount} shotNotesError={shotNotesError} shotNotesLoading={shotNotesLoading} showShotList={showShotList} workout={workout} />
  );

  const muscleToggleRow = workout.exercises?.length > 0 && getWorkoutBodyData(workout.exercises).length > 0 ? (
    <div className="flex items-center gap-2 shrink-0 lg:hidden">
      <span className="text-micro font-semibold uppercase tracking-[0.08em] text-ink-muted hidden sm:inline">Muscles worked</span>
      <SegmentedControl
        value={muscleView}
        onChange={setMuscleView}
        options={[
          { value: "anterior", label: "Front" },
          { value: "posterior", label: "Back" },
        ]}
      />
    </div>
  ) : null;

  return (
    <div className="min-h-screen relative">
      {isLogging && (
        <WorkoutLoggingHeader
          workoutTitle={workout.title}
          onBack={() => {
            // navigate(-1) with no in-app history (deep link, reload, PWA
            // cold start, push notification) can exit the app entirely —
            // fall back to a known route so the chevron is never a dead end.
            if (window.history.state?.idx > 0) navigate(-1);
            else navigate('/train');
          }}
          onFinish={handleSaveWorkoutLog}
          isSaving={saveWorkoutLogMutation.isPending || saveWorkoutLogMutation.isSuccess}
          weightUnit={weightUnit}
          startTime={startTime}
          canFinish={loggedSetsCount > 0}
          doneSets={loggedSetsCount}
          totalSets={totalSetsCount}
          restTimer={restTimer}
          restDuration={restDuration}
          onSkipRest={skipRestTimer}
          onAddRestTime={addRestTime}
          saveFailed={saveFailed}
          onRetrySave={retrySave}
          exercises={exerciseLogs.map((ex) => ({
            name: ex.name,
            done: ex.sets?.length > 0 && ex.sets.every((s) => s.completed),
          }))}
          focusedExerciseIndex={effectiveFocusIndex}
          onSelectExercise={setFocusedExerciseIndex}
        />
      )}

      {/* Mobile top padding while logging tracks the ACTUAL rendered height of
          WorkoutLoggingHeader's fixed top bar (usually 0 — it only shows
          content for the rare post-rest / save-failed states), instead of the
          old pt-16 guess that reserved 64px of dead space above the logger
          for most of the session. lg: keeps the static pt-32 (that bar always
          carries the clock/actions there). */}
      <div className={`max-w-6xl mx-auto p-4 md:p-6 ${isLogging ? 'pt-[calc(var(--logging-top-clearance,16px)+8px)] pb-[calc(var(--logging-bar-clearance,132px)+16px)] lg:pt-32 lg:pb-6' : 'min-h-[calc(100dvh-var(--layout-header-height,56px)-var(--dock-clearance))] pb-32 lg:pb-6 flex flex-col'}`}>
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

        {/* Session card — full chrome (chips, hero metrics, Start/Edit/Clone,
            muscle figure). Suppressed entirely while isLogging: the equivalent
            info moves into the "Session details" disclosure BELOW the exercise
            list (rendered further down, in the isLogging branch), so the
            focused exercise sits at the top of the page instead of under this
            card. */}
        <SessionCard chipsRow={chipsRow} cloneWorkoutMutation={cloneWorkoutMutation} handleStartLogging={handleStartLogging} isLogging={isLogging} muscleToggleRow={muscleToggleRow} muscleView={muscleView} navigate={navigate} resumeSession={resumeSession} user={user} workout={workout} />

        {isLogging ? (
          // Logging Mode - Show editable exercise logs
          <WorkoutLogger CardioSessions={CardioSessions} addExercise={addExercise} addSet={addSet} allExerciseNames={allExerciseNames} allHistoryExerciseNames={allHistoryExerciseNames} allWorkoutLogs={allWorkoutLogs} chipsRow={chipsRow} dragSensors={dragSensors} effectiveFocusIndex={effectiveFocusIndex} engineByName={engineByName} exerciseLogs={exerciseLogs} handleExerciseDragEnd={handleExerciseDragEnd} handleRemoveExercise={handleRemoveExercise} handleRemoveSet={handleRemoveSet} handleReplaceExercise={handleReplaceExercise} handleUpdateSet={handleUpdateSet} isProgramSource={isProgramSource} muscleToggleRow={muscleToggleRow} preWorkoutNotes={preWorkoutNotes} profile={profile} programWorkout={programWorkout} progressionTargetsMap={progressionTargetsMap} reorderMode={reorderMode} setFocusedExerciseIndex={setFocusedExerciseIndex} setPreWorkoutNotes={setPreWorkoutNotes} setReorderMode={setReorderMode} setShowCancelConfirm={setShowCancelConfirm} shotNoteFor={shotNoteFor} showShotList={showShotList} startRestTimer={startRestTimer} toggleLike={toggleLike} updateExerciseName={updateExerciseName} updateExerciseNotes={updateExerciseNotes} weightUnit={weightUnit} workout={workout} />
        ) : (
          // View Mode - Show exercises read-only
          <WorkoutViewMode CardioSessions={CardioSessions} handleStartLogging={handleStartLogging} isProgramSource={isProgramSource} programWorkout={programWorkout} weightUnit={weightUnit} workout={workout} />
        )}
        </div>{/* end main column */}

        {/* Sticky anatomy sidebar — desktop only */}
        <AnatomySidebar isLogging={isLogging} muscleView={muscleView} setMuscleView={setMuscleView} workout={workout} />
        </div>{/* end two-column flex */}
      </div>

      <WorkoutDetailDialogs allWorkoutLogs={allWorkoutLogs} exerciseLogs={exerciseLogs} handleCancelLogging={handleCancelLogging} handleDismissResume={handleDismissResume} handleIncompleteResponse={handleIncompleteResponse} handleResumeSession={handleResumeSession} handleSaveWorkoutLog={handleSaveWorkoutLog} postWorkoutNotes={postWorkoutNotes} resumeSession={resumeSession} saveWorkoutLogMutation={saveWorkoutLogMutation} setPostWorkoutNotes={setPostWorkoutNotes} setShowAllDonePrompt={setShowAllDonePrompt} setShowCancelConfirm={setShowCancelConfirm} setShowIncompletePrompt={setShowIncompletePrompt} setShowPostWorkoutDialog={setShowPostWorkoutDialog} showAllDonePrompt={showAllDonePrompt} showCancelConfirm={showCancelConfirm} showIncompletePrompt={showIncompletePrompt} showPostWorkoutDialog={showPostWorkoutDialog} weighInGateSheet={weighInGateSheet} weightUnit={weightUnit} />

    </div>
  );
}
