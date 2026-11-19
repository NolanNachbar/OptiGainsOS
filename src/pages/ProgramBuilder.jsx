import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useProgram, useCreateProgram, useUpdateProgram } from "@/hooks/useProgramQueries";
import { lookupExercise } from "@/ml/exerciseDB";
import { getSmartRestDuration } from "@/utils/fatigueManagement";
import { parseProgramJson } from "@/utils/programIO";
import { DndContext, DragOverlay, pointerWithin } from "@dnd-kit/core";
import DraggableWorkoutCard from "@/components/programs/DraggableWorkoutCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/ui/loading-spinner";
import { ArrowLeft, ArrowRight, Save, Check, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import ScheduleAfterCreateModal from "@/components/workouts/ScheduleAfterCreateModal";
import StepDetails from "@/components/programs/builder/StepDetails";
import StepCycleDays from "@/components/programs/builder/StepCycleDays";
import StepProgression from "@/components/programs/builder/StepProgression";
import StepConfirm from "@/components/programs/builder/StepConfirm";
import { STEPS, makeEmptyExercise, makeEmptyWorkout } from "@/components/programs/builder/constants";

export default function ProgramBuilder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const editId = searchParams.get("edit");

  const { program: existingProgram, isLoading: loadingExisting, error: errorExisting } = useProgram(editId);
  const createMutation = useCreateProgram();
  const updateMutation = useUpdateProgram();

  const [step, setStep] = useState(0);
  const [program, setProgram] = useState({
    name: "",
    description: "",
    cycle_length: 7,
    num_cycles: 4,
    goal: "strength",
    tags: [],
  });
  const [tagInput, setTagInput] = useState("");
  const [workouts, setWorkouts] = useState([]);
  const [editingDay, setEditingDay] = useState(null); // day_index being edited inline
  const [projectionWeights, setProjectionWeights] = useState({});
  const [activeDragWorkout, setActiveDragWorkout] = useState(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [createdProgram, setCreatedProgram] = useState(null);
  const importFileRef = useRef(null);
  const wasImported = useRef(false);

  const handleImportJson = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { programMeta, workouts: imported } = parseProgramJson(ev.target.result);
        setProgram(programMeta);
        setWorkouts(imported);
        wasImported.current = true;
        toast.success(`Loaded "${programMeta.name}"`);
      } catch (err) {
        toast.error(err.message || "Could not read the JSON file. Check the file and try again.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Populate from existing program when editing
  useEffect(() => {
    if (!editId || !existingProgram) return;

    // Support both v1 and v2 programs when editing
    const isV2 = existingProgram.schema_version === 2;
    setProgram({
      name: existingProgram.title || existingProgram.name || "",
      description: existingProgram.description || "",
      cycle_length: isV2 ? (existingProgram.cycle_length || existingProgram.days_per_week || 7) : (existingProgram.days_per_week || 3),
      num_cycles: isV2 ? (existingProgram.num_cycles || 4) : (existingProgram.duration_weeks || 4),
      goal: existingProgram.focus || existingProgram.goal || "strength",
      tags: existingProgram.tags || [],
    });

    if (isV2) {
      setWorkouts(existingProgram.workouts || []);
    } else {
      // Convert v1 workouts to v2 format: use day_number as day_index (week 1 only template)
      const v1Workouts = existingProgram.workouts || [];
      const converted = v1Workouts
        .filter((w) => w.week_number === 1)
        .map((w) => ({
          ...w,
          day_index: w.day_number,
        }));
      setWorkouts(converted);
    }
  }, [editId, existingProgram]);

  // Pre-populate from JSON import navigated in via router state
  useEffect(() => {
    const imp = location.state?.importedProgram;
    if (!imp || editId) return;
    setProgram(imp.programMeta);
    setWorkouts(imp.workouts);
    wasImported.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-generate cycle day slots when cycle_length changes (new programs only).
  // Skip when workouts were just populated by a JSON import — the import already
  // fills all slots and we must not overwrite them with empty day templates.
  useEffect(() => {
    if (editId) return;
    if (wasImported.current) {
      wasImported.current = false;
      return;
    }
    const slots = [];
    for (let d = 1; d <= program.cycle_length; d++) {
      const existing = workouts.find((w) => w.day_index === d);
      slots.push(existing || makeEmptyWorkout(d));
    }
    setWorkouts(slots);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program.cycle_length]);

  if (editId && loadingExisting) return <LoadingScreen />;
  if (editId && errorExisting) return (
    <div className="min-h-screen bg-charcoal flex items-center justify-center px-4">
      <Card className="max-w-sm w-full">
        <CardContent className="pt-6 text-center space-y-4">
          <div>
            <p className="type-display text-title text-ink">Program not loaded</p>
            <p className="text-ink-muted text-body mt-1">Check your connection and try again.</p>
          </div>
          <Button variant="primary" onClick={() => window.location.reload()} className="w-full min-h-[44px]">
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  // ── Step navigation ──
  const canProceed = () => {
    if (step === 0) return program.name.trim().length > 0;
    if (step === 1) return workouts.some((w) => w.exercises?.length > 0 || w.cardio_sessions?.length > 0);
    return true;
  };

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => {
    setEditingDay(null);
    setStep((s) => Math.max(s - 1, 0));
  };

  // ── Auto-detect exercise metadata from exerciseDB ──
  // Ensure sets is always a number (library workouts store sets as an array)
  const normalizeSets = (sets) =>
    typeof sets === "number" ? sets : Array.isArray(sets) ? sets.length || 3 : 3;

  const enrichExercise = (exercise) => {
    const normalized = { ...exercise, sets: normalizeSets(exercise.sets) };
    const db = lookupExercise(exercise.name);
    if (!db) return normalized;
    const isCompound = db.type === "Compound" || db.type === "Machine";
    return {
      ...normalized,
      category: isCompound ? "compound" : "isolation",
      muscle_groups: db.primaryMuscle || [],
      rest_seconds: normalized.rest_seconds || (isCompound ? 180 : 90),
    };
  };

  // ── Workout helpers ──
  const updateWorkoutByDay = (dayIndex, field, value) => {
    setWorkouts((prev) =>
      prev.map((w) =>
        w.day_index === dayIndex ? { ...w, [field]: value } : w
      )
    );
  };

  const addExercise = (dayIndex) => {
    setWorkouts((prev) =>
      prev.map((w) =>
        w.day_index === dayIndex
          ? { ...w, exercises: [...(w.exercises || []), makeEmptyExercise()] }
          : w
      )
    );
  };

  const removeExercise = (dayIndex, exIdx) => {
    setWorkouts((prev) =>
      prev.map((w) =>
        w.day_index === dayIndex
          ? { ...w, exercises: w.exercises.filter((_, i) => i !== exIdx) }
          : w
      )
    );
  };

  const updateExercise = (dayIndex, exIdx, field, value) => {
    setWorkouts((prev) =>
      prev.map((w) => {
        if (w.day_index !== dayIndex) return w;
        const exercises = [...w.exercises];
        exercises[exIdx] = { ...exercises[exIdx], [field]: value };

        // Auto-set rest + metadata when name changes
        if (field === "name" && value) {
          const rest = getSmartRestDuration(value);
          exercises[exIdx].rest_seconds = rest;
          const db = lookupExercise(value);
          if (db) {
            exercises[exIdx].category = db.type === "Compound" || db.type === "Machine" ? "compound" : "isolation";
            exercises[exIdx].muscle_groups = db.primaryMuscle || [];
          }
        }

        return { ...w, exercises };
      })
    );
  };

  const clearDay = (dayIndex) => {
    setWorkouts((prev) =>
      prev.map((w) =>
        w.day_index === dayIndex
          ? { day_index: dayIndex, title: `Day ${dayIndex}`, exercises: [], cardio_sessions: [], focus: "strength", notes: "" }
          : w
      )
    );
    if (editingDay === dayIndex) setEditingDay(null);
    toast.success(`Day ${dayIndex} cleared`);
  };

  const copyDay = (fromDay, toDay) => {
    setWorkouts((prev) => {
      const source = prev.find((w) => w.day_index === fromDay);
      if (!source) return prev;
      return prev.map((w) =>
        w.day_index === toDay
          ? {
              ...JSON.parse(JSON.stringify(source)),
              day_index: toDay,
              title: source.title,
            }
          : w
      );
    });
    toast.success(`Day ${fromDay} copied to Day ${toDay}`);
  };

  const addCardioWorkout = (dayIndex, entry) => {
    setWorkouts((prev) =>
      prev.map((w) =>
        w.day_index === dayIndex
          ? { ...w, cardio_sessions: [...(w.cardio_sessions || []), entry] }
          : w
      )
    );
  };

  const removeCardioWorkout = (dayIndex, idx) => {
    setWorkouts((prev) =>
      prev.map((w) =>
        w.day_index === dayIndex
          ? { ...w, cardio_sessions: (w.cardio_sessions || []).filter((_, i) => i !== idx) }
          : w
      )
    );
  };

  const updateCardioWorkout = (dayIndex, idx, field, value) => {
    setWorkouts((prev) =>
      prev.map((w) => {
        if (w.day_index !== dayIndex) return w;
        const cardios = [...(w.cardio_sessions || [])];
        cardios[idx] = { ...cardios[idx], [field]: value };
        return { ...w, cardio_sessions: cardios };
      })
    );
  };

  // ── DnD handlers ──
  const handleDragStart = (event) => {
    const { workout } = event.active.data.current || {};
    setActiveDragWorkout(workout || null);
  };

  const handleDragEnd = (event) => {
    setActiveDragWorkout(null);
    const { active, over } = event;
    if (!over) return;

    const dayIndex = parseInt(over.id.replace("day-", ""));
    if (isNaN(dayIndex)) return;

    const sourceWorkout = active.data.current?.workout;
    if (!sourceWorkout) return;

    // Normalize exercises from library format to program format
    const normalizedExercises = (sourceWorkout.exercises || []).map((ex) => ({
      name: ex.name || "",
      sets: typeof ex.sets === "number" ? ex.sets : Array.isArray(ex.sets) ? ex.sets.length : 3,
      rep_target: ex.rep_target || ex.reps || 8,
      rir_target: ex.rir_target ?? 2,
      rest_seconds: ex.rest_seconds || 90,
      progression: ex.progression || { weight_increment: 5, daily_min_pct: 0.85 },
    }));

    // Cardio/HIIT library workouts store cardio STEPS, not strength sets —
    // mapping them through normalizedExercises produces garbage rep/set rows and
    // never populates cardio_sessions. Drop them onto the day as a cardio session
    // instead (same shape the cardio picker writes).
    const isCardioSource = sourceWorkout.focus === "cardio" || sourceWorkout.focus === "hiit";

    setWorkouts((prev) =>
      prev.map((w) =>
        w.day_index === dayIndex
          ? isCardioSource
            ? {
                ...w,
                title: sourceWorkout.title || w.title,
                focus: sourceWorkout.focus || w.focus,
                cardio_sessions: [
                  ...(w.cardio_sessions || []),
                  {
                    workout_id: sourceWorkout.id,
                    title: sourceWorkout.title,
                    exercises: sourceWorkout.exercises || [],
                    duration_minutes: sourceWorkout.duration_minutes || 30,
                    time_of_day: "anytime",
                  },
                ],
                source_workout_id: sourceWorkout.id,
              }
            : {
                ...w,
                title: sourceWorkout.title || w.title,
                focus: sourceWorkout.focus || w.focus,
                exercises: normalizedExercises,
                source_workout_id: sourceWorkout.id,
              }
          : w
      )
    );
    toast.success(`"${sourceWorkout.title}" assigned to Day ${dayIndex}`);
  };

  // ── Cell click: open inline editor ──
  const handleCellClick = (_workout, _cycle, dayIndex) => {
    setEditingDay(editingDay === dayIndex ? null : dayIndex);
  };

  // ── Submit ──
  const handleSubmit = () => {
    // Only save days that have exercises (empty days = rest days)
    const enrichedWorkouts = workouts
      .filter((w) => w.exercises?.length > 0 || (w.cardio_sessions || []).length > 0)
      .map((w) => ({
        day_index: w.day_index,
        title: w.title,
        focus: w.focus,
        notes: w.notes || null,
        exercises: (w.exercises || []).map(enrichExercise),
        cardio_sessions: w.cardio_sessions || [],
        week_number: 1,
      }));

    const programData = {
      title: program.name,
      description: program.description,
      focus: program.goal,
      num_cycles: program.num_cycles,
      schema_version: 2,
      // No `cycle_length` column exists on `programs` — writing it 400s the whole
      // insert/update. days_per_week is the persisted cycle length; every reader
      // already falls back to it (`program.cycle_length || program.days_per_week`).
      duration_weeks: program.num_cycles,
      days_per_week: program.cycle_length,
    };

    if (editId) {
      updateMutation.mutate(
        { id: editId, updates: programData, workouts: enrichedWorkouts },
        {
          onSuccess: () => {
            toast.success("Program updated");
            navigate(`/program/${editId}`);
          },
          onError: () => toast.error("Program not updated. Try again."),
        }
      );
    } else {
      createMutation.mutate(
        { program: programData, workouts: enrichedWorkouts },
        {
          onSuccess: async (created) => {
            toast.success("Program created.");
            setCreatedProgram({ ...created, ...programData });
            setShowScheduleModal(true);
          },
          onError: () => toast.error("Program not created. Try again."),
        }
      );
    }
  };

  // ── Unique exercises for projection step ──
  const uniqueExercises = [];
  const seen = new Set();
  for (const w of workouts) {
    for (const ex of w.exercises || []) {
      if (ex.name && !seen.has(ex.name)) {
        seen.add(ex.name);
        uniqueExercises.push(ex);
      }
    }
  }

  const editingWorkout = editingDay != null ? workouts.find((w) => w.day_index === editingDay) : null;

  return (
    <div className="p-4 md:p-6 bg-charcoal transition-colors duration-300">
      <div className="max-w-5xl mx-auto">
        {/* Header — single row: step eyebrow + name, actions, progress bar.
            Collapses the old Layout-title + page-title double chrome. */}
        <div className="mb-5">
          <div className="flex items-center justify-between gap-3">
            {/* Eyebrow + step title suppressed on mobile — the Layout mobile
                header already owns the top row ("Program Builder" + date), so a
                second in-page title would double-stack the chrome. Desktop has
                no Layout header, so it keeps this title. */}
            <div className="min-w-0 hidden md:block">
              <p className="section-label">
                Step {step + 1}/{STEPS.length}
              </p>
              <p className="type-display text-title text-ink mt-0.5 truncate">
                {STEPS[step]}
              </p>
            </div>
            {/* Mobile wayfinding shares the action row instead of stacking its
                own bar, the Layout header owns the top title, so a compact
                "Step 1/4 · Details" eyebrow here is enough to orient. */}
            <p className="section-label md:hidden min-w-0 truncate">
              <span className="font-numeral tabular-nums">Step {step + 1}/{STEPS.length}</span>
              {" · "}
              {STEPS[step]}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              {!editId && (
                <>
                  <input
                    ref={importFileRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleImportJson}
                  />
                  {/* Import JSON is a power-user shortcut, not the page's job —
                      keep it a quiet `dim` utility so it sits in the same chrome
                      tier as Cancel (X) and never competes with naming the
                      program. One muted cluster, not two action groups. */}
                  <Button
                    variant="outline"
                    size="default"
                    onClick={() => importFileRef.current?.click()}
                    className="min-h-[44px]"
                  >
                    Import JSON
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/workouts")}
                aria-label="Cancel"
                className="min-h-[44px] min-w-[44px] px-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Step indicator */}
          <div className="flex gap-1 mt-2 md:mt-3">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-pill transition-colors duration-200 ease-[var(--ease)] ${
                  i <= step
                    ? "bg-brand"
                    : "bg-track"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Documented exception to the system's 8px RISE entrance: this is a
            linear stepper, so steps slide HORIZONTALLY (8px right on enter, left
            on exit) to encode forward/back direction, wayfinding the vertical
            rise can't express. Stays on the one system easing + 180–320ms band. */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.24, ease: [0.2, 0.7, 0.3, 1] }}
            className="pb-[calc(env(safe-area-inset-bottom)+80px)] md:pb-0"
          >
            {step === 0 && (
              <StepDetails
                program={program}
                setProgram={setProgram}
                tagInput={tagInput}
                setTagInput={setTagInput}
              />
            )}
            {step === 1 && (
              <DndContext
                collisionDetection={pointerWithin}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <StepCycleDays
                  workouts={workouts}
                  program={program}
                  editingDay={editingDay}
                  editingWorkout={editingWorkout}
                  onCellClick={handleCellClick}
                  onClearDay={clearDay}
                  onCopyDay={copyDay}
                  updateWorkoutByDay={updateWorkoutByDay}
                  addExercise={addExercise}
                  removeExercise={removeExercise}
                  updateExercise={updateExercise}
                  addCardioWorkout={addCardioWorkout}
                  removeCardioWorkout={removeCardioWorkout}
                  updateCardioWorkout={updateCardioWorkout}
                />
                <DragOverlay>
                  {activeDragWorkout && (
                    <DraggableWorkoutCard workout={activeDragWorkout} isOverlay />
                  )}
                </DragOverlay>
              </DndContext>
            )}
            {step === 2 && (
              <StepProgression
                exercises={uniqueExercises}
                totalCycles={program.num_cycles}
                projectionWeights={projectionWeights}
                setProjectionWeights={setProjectionWeights}
              />
            )}
            {step === 3 && (
              <StepConfirm program={program} workouts={workouts} />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation buttons — a true bottom-anchored bar above the floating
            mobile dock, not a floated guess. Sits on the shared
            --floating-chrome-bottom token (= dock's full painted footprint +
            safe-area + a 12px gap), the one clearance every floated action bar
            shares, so it can never occlude Step-1 fields. (Previously anchored on
            --dock-clearance + env(safe-area-inset-bottom), which double-counted
            the safe-area inset that --dock-clearance already folds in.) The
            scroll container reserves matching dock clearance below (see the
            motion.div pb above) so Description + Tags clear both this bar and the
            dock at 390px.

            On desktop (md+) it un-sticks and reads as a CardFooter of the form
            card above (pdm-5): a continuous hairline top border + a tight 12px
            gap (md:mt-3) glue Next to the card bottom so it owns the form's
            action, no floating gap.

            This route renders with showDock=false, so there is no floating dock
            to clear: the bar bottom-anchors directly to the safe-area inset + a
            12px gap (program-builder-1) instead of reserving the dock's painted
            footprint via --floating-chrome-bottom. The scroll container above
            reserves only this bar's own height (no +88px dock band). */}
        <div
          className="sticky z-20 -mx-4 md:mx-0 mt-6 md:mt-3 px-4 md:px-4 py-3 md:pt-3 md:pb-0 flex flex-wrap items-center gap-x-3 gap-y-1.5 glass-elevated md:bg-transparent md:shadow-none md:rounded-none md:border-x-0 md:border-b-0 md:border-t md:border-solid md:[border-top-color:var(--color-border-soft)]"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
        >
          {step > 0 && (
            <Button variant="outline" onClick={back} className="flex-1 min-h-[44px]">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button
              variant="primary"
              onClick={next}
              disabled={!canProceed()}
              // Disabled Next falls to the shared volt disabled rule: neutral
              // charcoal-surface inert with faint ink — no brand-channel border or
              // background, so coral stays the single action color and a locked
              // control never borrows it. The inline helper under Program Name
              // ("Name your program to continue") carries WHY it's locked.
              className="flex-1 md:flex-none md:ml-auto md:px-8 font-bold min-h-[44px]"
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="flex-1 md:flex-none md:ml-auto md:px-8 font-bold min-h-[44px]"
            >
              <Save className="w-4 h-4 mr-2" />
              {createMutation.isPending || updateMutation.isPending
                ? "Saving..."
                : editId
                ? "Update Program"
                : "Create Program"}
            </Button>
          )}
        </div>

        {/* Schedule after create modal */}
        {showScheduleModal && createdProgram && (
          <ScheduleAfterCreateModal
            program={createdProgram}
            workouts={workouts.filter((w) => w.exercises?.length > 0)}
            open={showScheduleModal}
            onClose={() => setShowScheduleModal(false)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Step 1: Details ──────────────────────────────────────
