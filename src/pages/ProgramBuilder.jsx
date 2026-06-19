import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useProgram, useCreateProgram, useUpdateProgram } from "@/hooks/useProgramQueries";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/api/supabaseClient";
import { queryKeys } from "@/lib/queryKeys";
import { lookupExercise } from "@/ml/exerciseDB";
import { getSmartRestDuration } from "@/utils/fatigueManagement";
import { projectProgression } from "@/utils/programProgression";
import { parseProgramJson } from "@/utils/programIO";
import { DndContext, DragOverlay, pointerWithin } from "@dnd-kit/core";
import CycleDayGrid from "@/components/programs/CycleDayGrid";
import WorkoutLibrarySidebar from "@/components/programs/WorkoutLibrarySidebar";
import DraggableWorkoutCard from "@/components/programs/DraggableWorkoutCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WORKOUT_TYPES } from "@/lib/constants";
import { LoadingScreen } from "@/components/ui/loading-spinner";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Minus,
  Trash2,
  Copy,
  Save,
  Check,
  ChevronUp,
  ChevronDown,
  Dumbbell,
  TrendingUp,
  Calendar,
  Repeat,
  X,
  Activity,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import ScheduleAfterCreateModal from "@/components/workouts/ScheduleAfterCreateModal";

const GOALS = [
  { value: "muscle_gain", label: "Muscle Gain" },
  { value: "fat_loss", label: "Fat Loss" },
  { value: "strength", label: "Strength" },
  { value: "endurance", label: "Endurance" },
  { value: "general", label: "General Fitness" },
];

const STEPS = ["Details", "Cycle Days", "Progression", "Confirm"];

function makeEmptyExercise() {
  return {
    name: "",
    focus: "hypertrophy",
    sets: 3,
    rep_target: "10",
    rir_target: 2,
    rest_seconds: 90,
    progression: { weight_increment: 5, daily_min_pct: 0.85 },
  };
}

function makeEmptyWorkout(dayIndex) {
  return {
    day_index: dayIndex,
    title: `Day ${dayIndex}`,
    focus: "strength",
    exercises: [],
    cardio_sessions: [],
    notes: "",
  };
}


export default function ProgramBuilder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const editId = searchParams.get("edit");
  const { user } = useAuth();

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
        toast.error(err.message || "Failed to load JSON");
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
  if (editId && errorExisting) return <div className="min-h-screen bg-charcoal flex items-center justify-center"><p className="text-bad">Failed to load program</p></div>;

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

    setWorkouts((prev) =>
      prev.map((w) =>
        w.day_index === dayIndex
          ? {
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
        exercises: (w.exercises || []).map(enrichExercise),
        cardio_sessions: w.cardio_sessions || [],
        week_number: 1,
      }));

    const programData = {
      title: program.name,
      description: program.description,
      focus: program.goal,
      num_cycles: program.num_cycles,
      cycle_length: program.cycle_length,
      schema_version: 2,
      // Keep v1 fields for backward compat (not used in v2)
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
          onError: () => toast.error("Failed to update program"),
        }
      );
    } else {
      createMutation.mutate(
        { program: programData, workouts: enrichedWorkouts },
        {
          onSuccess: async (created) => {
            toast.success("Program created!");
            setCreatedProgram({ ...created, ...programData });
            setShowScheduleModal(true);
          },
          onError: () => toast.error("Failed to create program"),
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
              <p className="type-display text-[18px] text-ink mt-0.5 truncate">
                {STEPS[step]}
              </p>
            </div>
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => importFileRef.current?.click()}
                    className="min-h-[44px]"
                  >
                    Import JSON
                  </Button>
                </>
              )}
              <Button
                variant="dim"
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
          <div className="flex gap-1 mt-3">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= step
                    ? "bg-brand"
                    : "bg-track"
                }`}
              />
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.24, ease: [0.2, 0.7, 0.3, 1] }}
            className="pb-32 md:pb-0"
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

        {/* Navigation buttons — sticky footer raised to fully clear the floating
            mobile dock (≈56px tall, 12px above the safe-area inset) with
            breathing room. Scroll container pads pb-32 — enough to keep the last
            field (Tags 'Add') clear of this footer without manufacturing an
            empty extra screen on short forms. */}
        <div
          className="sticky z-20 -mx-4 md:mx-0 mt-6 px-4 md:px-0 py-3 md:py-0 flex gap-3 glass-elevated md:bg-transparent md:shadow-none md:border-0"
          style={{ bottom: "calc(6.75rem + env(safe-area-inset-bottom))" }}
        >
          {step > 0 && (
            <Button variant="outline" onClick={back} className="flex-1 min-h-[44px]">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button
              variant="volt"
              onClick={next}
              disabled={!canProceed()}
              className="flex-1 md:flex-none md:ml-auto md:px-8 font-bold min-h-[44px]"
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              variant="volt"
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

// Mobile-friendly numeric field: -/+ steppers flanking a bare number input.
// Steppers are neutral-glass icon buttons (>=44px); they reuse the same clamp
// the typed input does so all three entry paths stay in sync.
function NumberStepper({ value, onChange, min, max, ariaLabel }) {
  const clamp = (n) => Math.max(min, Math.min(max, n));
  return (
    <div className="flex items-stretch gap-2 mt-1">
      <Button
        type="button"
        variant="dim"
        aria-label={`Decrease ${ariaLabel}`}
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= min}
        className="min-h-[44px] min-w-[44px] px-0 shrink-0"
      >
        <Minus className="w-4 h-4" />
      </Button>
      <Input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(clamp(parseInt(e.target.value) || min))}
        min={min}
        max={max}
        className="flex-1 min-h-[44px] text-center tabular-nums appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
      />
      <Button
        type="button"
        variant="dim"
        aria-label={`Increase ${ariaLabel}`}
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= max}
        className="min-h-[44px] min-w-[44px] px-0 shrink-0"
      >
        <Plus className="w-4 h-4" />
      </Button>
    </div>
  );
}

function StepDetails({ program, setProgram, tagInput, setTagInput }) {
  const update = (field, value) => setProgram((p) => ({ ...p, [field]: value }));

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !program.tags.includes(tag)) {
      update("tags", [...program.tags, tag]);
    }
    setTagInput("");
  };

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div>
          <Label>Program Name *</Label>
          <Input
            value={program.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="e.g., Push Pull Legs Hypertrophy"
            className="mt-1"
          />
        </div>

        {/* Cycle configuration — the load-bearing controls, surfaced directly
            under the name so duration is decided before optional copy. */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              Cycle Length *
            </Label>
            <NumberStepper
              value={program.cycle_length}
              onChange={(v) => update("cycle_length", v)}
              min={1}
              max={30}
              ariaLabel="cycle length"
            />
            <p className="text-xs text-ink-muted mt-0.5">Days per cycle · rest days included</p>
          </div>
          <div>
            <Label className="flex items-center gap-1">
              <Repeat className="w-3.5 h-3.5" />
              Cycles *
            </Label>
            <NumberStepper
              value={program.num_cycles}
              onChange={(v) => update("num_cycles", v)}
              min={1}
              max={20}
              ariaLabel="number of cycles"
            />
            <p className="text-xs text-ink-muted mt-0.5">Times repeated</p>
          </div>
          {/* Steppers stack full-width on mobile so the number field can breathe;
              all three controls rejoin one row on desktop. */}
          <div className="md:col-span-1">
            <Label>Goal</Label>
            <Select
              value={program.goal}
              onValueChange={(v) => update("goal", v)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue>
                  {GOALS.find(g => g.value === program.goal)?.label || program.goal}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {GOALS.map((g) => (
                  <SelectItem key={g.value} value={g.value}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Total training days info */}
        <div className="flex items-center gap-2 glass-inset p-3 text-sm text-ink-secondary font-technical">
          <Calendar className="w-4 h-4 flex-shrink-0 text-ink-muted" />
          <span>
            {program.cycle_length}-day cycle repeated {program.num_cycles} time{program.num_cycles !== 1 ? "s" : ""} = <strong className="text-ink">{program.cycle_length * program.num_cycles} total training days</strong>
          </span>
        </div>

        <div>
          <Label>Description</Label>
          <Textarea
            value={program.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder="Describe the program goals and approach…"
            rows={2}
            className="mt-1"
          />
        </div>

        <div>
          <Label>Tags</Label>
          <div className="flex gap-2 mt-1">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="e.g., powerlifting"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addTag} className="min-h-[44px]">
              Add
            </Button>
          </div>
          {program.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {program.tags.map((tag) => (
                // 44px hit target wraps the ~22px chip so the remove affordance
                // is thumb-reachable while the Badge keeps its compact size.
                <button
                  key={tag}
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  onClick={() => update("tags", program.tags.filter((t) => t !== tag))}
                  className="min-h-[44px] flex items-center"
                >
                  <Badge variant="secondary" className="cursor-pointer">
                    {tag} &times;
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Step 2: Cycle Days (DnD + Inline Edit) ─────────────

function StepCycleDays({
  workouts,
  program,
  editingDay,
  editingWorkout,
  onCellClick,
  onClearDay,
  onCopyDay,
  updateWorkoutByDay,
  addExercise,
  removeExercise,
  updateExercise,
  addCardioWorkout,
  removeCardioWorkout,
  updateCardioWorkout,
}) {
  const [showLibraryMobile, setShowLibraryMobile] = useState(false);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">
                {program.cycle_length}-Day Cycle Template
              </CardTitle>
              <p className="text-xs text-ink-muted mt-1">
                Drag workouts from the library or click a day to build exercises inline.
                This template repeats for {program.num_cycles} cycle{program.num_cycles !== 1 ? "s" : ""}.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <CycleDayGrid
            workouts={workouts}
            cycleLength={program.cycle_length}
            mode="edit"
            onCellClick={onCellClick}
            onClearDay={onClearDay}
          />

          <div className="mt-4 pt-4 border-t hairline">
            {/* Mobile: keep the cycle grid focal — collapse the library behind a toggle.
                Desktop always shows it. Sidebar stays mounted so DnD drag source persists. */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLibraryMobile((v) => !v)}
              className="md:hidden w-full justify-between min-h-[44px] mb-3"
            >
              <span className="flex items-center gap-2">
                <Dumbbell className="w-4 h-4" />
                Workout Library
              </span>
              {showLibraryMobile ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
            <div className={showLibraryMobile ? "block" : "hidden md:block"}>
              <WorkoutLibrarySidebar />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inline exercise editor */}
      <AnimatePresence>
        {editingDay != null && editingWorkout && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
          >
            <InlineDayEditor
              dayIndex={editingDay}
              workout={editingWorkout}
              allWorkouts={workouts}
              updateWorkoutByDay={updateWorkoutByDay}
              addExercise={addExercise}
              removeExercise={removeExercise}
              updateExercise={updateExercise}
              onCopyDay={onCopyDay}
              onClose={() => onCellClick(null, null, editingDay)}
              addCardioWorkout={addCardioWorkout}
              removeCardioWorkout={removeCardioWorkout}
              updateCardioWorkout={updateCardioWorkout}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InlineDayEditor({
  dayIndex,
  workout,
  allWorkouts,
  updateWorkoutByDay,
  addExercise,
  removeExercise,
  updateExercise,
  onCopyDay,
  onClose,
  addCardioWorkout,
  removeCardioWorkout,
  updateCardioWorkout,
}) {
  const { user } = useAuth();
  const { data: libraryWorkouts = [] } = useQuery({
    queryKey: queryKeys.workouts(),
    queryFn: () => db.entities.Workout.filter({ created_by: user.id }),
    enabled: !!user,
  });
  const cardioLibrary = libraryWorkouts.filter(w => w.focus === 'cardio' || w.focus === 'hiit');

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            {/* Day label is a static identifier, not an action — neutral outline
                Badge, matching CycleDayGrid + StepConfirm. Coral is action-only. */}
            <Badge variant="outline" className="text-xs">
              Day {dayIndex}
            </Badge>
            Editing Exercises
          </CardTitle>
          <Button variant="dim" size="sm" onClick={onClose} aria-label="Close editor" className="min-h-[44px] min-w-[44px] px-0">
            <ChevronUp className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Workout title + type */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Title</Label>
            <Input
              value={workout.title}
              onChange={(e) => updateWorkoutByDay(dayIndex, "title", e.target.value)}
              className="mt-0.5 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <Select
              value={workout.focus || "strength"}
              onValueChange={(v) => updateWorkoutByDay(dayIndex, "focus", v)}
            >
              <SelectTrigger className="mt-0.5 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORKOUT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Exercises */}
        {(workout.exercises || []).length === 0 && (
          <div className="text-center py-6 text-ink-muted">
            <Dumbbell className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm mb-3">No exercises yet — start building this day.</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => addExercise(dayIndex)}
              className="min-h-[44px]"
            >
              <Plus className="w-3 h-3 mr-1" />
              Add Exercise
            </Button>
          </div>
        )}

        {(workout.exercises || []).map((ex, exIdx) => (
          <ExerciseEditor
            key={exIdx}
            exercise={ex}
            index={exIdx}
            dayIndex={dayIndex}
            workoutType={workout.focus}
            updateExercise={updateExercise}
            removeExercise={removeExercise}
            canRemove={(workout.exercises || []).length > 0}
          />
        ))}

        <div className="flex gap-2 flex-wrap">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => addExercise(dayIndex)}
            className="min-h-[44px]"
          >
            <Plus className="w-3 h-3 mr-1" />
            Add Exercise
          </Button>
          {/* Copy to another day */}
          <Select
            onValueChange={(targetDay) => onCopyDay(dayIndex, parseInt(targetDay))}
          >
            <SelectTrigger className="w-auto min-h-[44px] min-w-[44px] text-xs">
              <Copy className="w-3 h-3 mr-1" />
              Copy to...
            </SelectTrigger>
            <SelectContent>
              {allWorkouts
                .filter((w) => w.day_index !== dayIndex)
                .map((w) => (
                  <SelectItem key={w.day_index} value={String(w.day_index)}>
                    Day {w.day_index}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {/* Cardio Workouts */}
        <div className="border-t hairline pt-3">
          <Label className="text-xs font-semibold flex items-center gap-1.5 mb-2">
            <Activity className="w-3.5 h-3.5 text-ink-muted" />
            Cardio Workouts
          </Label>
          <Select
            value=""
            onValueChange={(workoutId) => {
              const w = cardioLibrary.find((w) => w.id === workoutId);
              if (w) addCardioWorkout(dayIndex, {
                workout_id: w.id,
                title: w.title,
                exercises: w.exercises || [],
                duration_minutes: w.duration_minutes || 30,
                time_of_day: "anytime",
              });
            }}
          >
            <SelectTrigger className="min-h-[44px] text-xs text-ink-muted">
              <SelectValue placeholder={cardioLibrary.length ? "Add cardio workout…" : "No cardio workouts in library yet"} />
            </SelectTrigger>
            <SelectContent>
              {cardioLibrary.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="space-y-1.5 mt-2">
            {(workout.cardio_sessions || []).map((c, i) => (
              <div key={i} className="flex items-center gap-2 glass-inset px-3 py-1.5">
                <Activity className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                <span className="text-xs font-medium text-ink flex-1 truncate">{c.title}</span>
                <span className="font-technical text-xs text-ink-muted shrink-0">{c.duration_minutes} min</span>
                <Select value={c.time_of_day} onValueChange={(v) => updateCardioWorkout(dayIndex, i, "time_of_day", v)}>
                  <SelectTrigger className="w-24 min-h-[44px] text-sm shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="am">AM</SelectItem>
                    <SelectItem value="pm">PM</SelectItem>
                    <SelectItem value="anytime">Anytime</SelectItem>
                  </SelectContent>
                </Select>
                <button type="button" aria-label="Remove cardio" onClick={() => removeCardioWorkout(dayIndex, i)} className="min-h-[44px] min-w-[44px] -my-2 flex items-center justify-center text-ink-muted hover:text-bad transition-colors shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <Label className="text-xs">Notes</Label>
          <Textarea
            value={workout.notes || ""}
            onChange={(e) => updateWorkoutByDay(dayIndex, "notes", e.target.value)}
            placeholder="Workout notes…"
            rows={2}
            className="mt-0.5 text-sm"
          />
        </div>
      </CardContent>
    </Card>
  );
}


function ExerciseEditor({
  exercise,
  index,
  dayIndex,
  workoutType,
  updateExercise,
  removeExercise,
  canRemove,
}) {
  const update = (field, value) => updateExercise(dayIndex, index, field, value);
  const detected = lookupExercise(exercise.name);
  const isCardio = workoutType === "cardio" || workoutType === "hiit";

  return (
    <div className="glass-inset p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-ink-muted">#{index + 1}</span>
            {detected && (
              <Badge variant="outline" className="text-xs capitalize">
                {detected.type}
              </Badge>
            )}
            {exercise.muscle_groups?.length > 0 && (
              <span className="text-xs text-ink-muted">
                {exercise.muscle_groups.join(", ")}
              </span>
            )}
          </div>
          {canRemove && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Remove exercise"
              className="min-h-[44px] min-w-[44px] p-0 -my-2"
              onClick={() => removeExercise(dayIndex, index)}
            >
              <Trash2 className="w-3.5 h-3.5 text-bad" />
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <Input
              value={exercise.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Exercise name"
              className="text-sm"
            />
          </div>
          {!isCardio && (
            <div>
              <Label className="text-xs text-ink-muted">Focus</Label>
              <Select
                value={exercise.focus || "hypertrophy"}
                onValueChange={(v) => update("focus", v)}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="strength">Strength</SelectItem>
                  <SelectItem value="hypertrophy">Hypertrophy</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs text-ink-muted">{isCardio ? "Intensity (RIR)" : "RIR Target"}</Label>
            <Input
              type="number"
              value={exercise.rir_target}
              onChange={(e) => {
                const val = e.target.value;
                update("rir_target", val === "" ? 2 : parseFloat(val));
              }}
              min="0"
              max="5"
              step="0.5"
              className="text-sm"
            />
          </div>
          <div>
            <Label className="text-xs text-ink-muted">{isCardio ? "Rounds/Intervals" : "Sets"}</Label>
            <Input
              type="number"
              value={typeof exercise.sets === "number" ? exercise.sets : Array.isArray(exercise.sets) ? exercise.sets.length : 3}
              onChange={(e) => update("sets", parseInt(e.target.value) || 3)}
              min="1"
              className="text-sm"
            />
          </div>
          <div>
            <Label className="text-xs text-ink-muted">{isCardio ? "Duration/Distance" : "Rep Target"}</Label>
            <Input
              value={exercise.rep_target}
              onChange={(e) => update("rep_target", e.target.value)}
              placeholder={isCardio ? "e.g., 30 min, 5 km" : "e.g., 5 or 8-12"}
              className="text-sm"
            />
          </div>
          <div>
            <Label className="text-xs text-ink-muted">Rest (sec)</Label>
            <Input
              type="number"
              value={exercise.rest_seconds}
              onChange={(e) => update("rest_seconds", parseInt(e.target.value) || 90)}
              min="0"
              className="text-sm"
            />
          </div>
          {!isCardio && (
            <div>
              <Label className="text-xs text-ink-muted">Weight +/session</Label>
              <Input
                type="number"
                value={exercise.progression?.weight_increment || 5}
                onChange={(e) =>
                  update("progression", {
                    ...exercise.progression,
                    weight_increment: parseFloat(e.target.value) || 5,
                  })
                }
                min="0"
                step="2.5"
                className="text-sm"
              />
            </div>
          )}
        </div>
    </div>
  );
}

// ─── Step 3: Progression Preview ──────────────────────────

function StepProgression({ exercises, totalCycles, projectionWeights, setProjectionWeights }) {
  const [selectedExercise, setSelectedExercise] = useState(exercises[0]?.name || "");

  if (exercises.length === 0) {
    return (
      <Card>
        <CardContent className="pb-6 text-center">
          <div className="pt-6 pb-6">
            <TrendingUp className="w-10 h-10 text-ink-muted mx-auto mb-3" />
            <p className="text-sm text-ink-muted">
              No exercises found. Go back and add exercises to see projections.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentExercise = exercises.find(ex => ex.name === selectedExercise) || exercises[0];
  const startWeight = projectionWeights[currentExercise.name] || 0;
  const projections =
    startWeight > 0
      ? projectProgression(currentExercise, totalCycles, startWeight)
      : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Progression Preview</CardTitle>
        <p className="text-sm text-ink-muted mb-3">
          Enter starting weights to see projected progression. These are estimates
          assuming progression every session (best case).
        </p>
        <div className="w-full">
          <Label className="text-sm font-medium mb-2 block">Select Exercise</Label>
          <Select value={selectedExercise} onValueChange={setSelectedExercise}>
            <SelectTrigger>
              <SelectValue placeholder="Choose an exercise" />
            </SelectTrigger>
            <SelectContent>
              {exercises.map((ex) => (
                <SelectItem key={ex.name} value={ex.name}>
                  {ex.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="glass-inset p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-medium text-base">{currentExercise.name}</p>
              <p className="text-sm text-ink-muted mt-1">
                {typeof currentExercise.sets === "number" ? currentExercise.sets : Array.isArray(currentExercise.sets) ? currentExercise.sets.length : 3} sets &times; {currentExercise.rep_target} reps &middot; +
                {currentExercise.progression?.weight_increment || 5} lbs/session
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="Start lbs"
                className="w-28 text-sm"
                value={projectionWeights[currentExercise.name] || ""}
                onChange={(e) =>
                  setProjectionWeights((prev) => ({
                    ...prev,
                    [currentExercise.name]: parseFloat(e.target.value) || 0,
                  }))
                }
              />
              <span className="text-sm text-ink-muted">lbs</span>
            </div>
          </div>

          {projections.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {projections.map((p) => (
                <div
                  key={p.week}
                  className="glass-inset flex-shrink-0 text-center px-4 py-2"
                >
                  <p className="text-xs text-ink-muted">Cycle {p.week}</p>
                  <p className="font-technical text-sm font-bold text-ink mt-1">{p.weight} lbs</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-ink-muted text-sm">
              Enter a starting weight to see progression
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Step 4: Confirm ──────────────────────────────────────

function StepConfirm({ program, workouts }) {
  const totalExercises = workouts.reduce(
    (sum, w) => sum + (w.exercises?.length || 0),
    0
  );
  const totalCardioSessions = workouts.reduce(
    (sum, w) => sum + (w.cardio_sessions?.length || 0),
    0
  );
  const filledDays = workouts.filter(
    (w) => w.exercises?.length > 0 || w.cardio_sessions?.length > 0
  ).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review & Confirm</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Name spans both columns so the remaining four stats pair off evenly
              and the 5th ('Training Days') never orphans on its own row. */}
          <div className="col-span-2">
            <p className="text-xs text-ink-muted">Name</p>
            <p className="font-semibold">{program.name}</p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Cycle</p>
            <p className="font-technical font-semibold">{program.cycle_length}-day cycle &times; {program.num_cycles}</p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Total Days</p>
            <p className="font-technical font-semibold">{program.cycle_length * program.num_cycles} days</p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Goal</p>
            <p className="font-semibold">{GOALS.find(g => g.value === program.goal)?.label || program.goal?.replace("_", " ")}</p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Training Days</p>
            <p className="font-technical font-semibold">{filledDays} of {program.cycle_length} days</p>
          </div>
        </div>

        {program.description && (
          <div>
            <p className="text-xs text-ink-muted">Description</p>
            <p className="text-sm text-ink-muted">{program.description}</p>
          </div>
        )}

        <div className="border-t hairline pt-4">
          <h3 className="section-label mb-3">Cycle Template</h3>
          <div className="space-y-2">
            {workouts.map((w) => {
              const hasExercises = w.exercises?.length > 0;
              const hasCardio = w.cardio_sessions?.length > 0;
              const isEmpty = !hasExercises && !hasCardio;
              return (
                <div
                  key={w.day_index}
                  className={`flex items-center justify-between glass-inset p-2 text-sm ${
                    isEmpty ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      Day {w.day_index}
                    </Badge>
                    <span className="font-medium">
                      {isEmpty ? "Rest" : w.title}
                    </span>
                  </div>
                  <span className="text-xs text-ink-muted">
                    {[
                      hasExercises && `${w.exercises.length} exercises`,
                      hasCardio && `${w.cardio_sessions.length} cardio`,
                    ].filter(Boolean).join(" · ") || "Rest"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 glass-inset p-3 text-sm text-ink-secondary">
          <Check className="w-4 h-4 shrink-0 text-ink" />
          <span>
            Ready to save: {filledDays} training days
            {totalExercises > 0 && `, ${totalExercises} exercises`}
            {totalCardioSessions > 0 && `, ${totalCardioSessions} cardio sessions`}
            , repeated {program.num_cycles} time{program.num_cycles !== 1 ? "s" : ""}.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
