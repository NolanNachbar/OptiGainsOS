import { useState, useEffect, useRef } from "react";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys, invalidateWorkouts } from "@/lib/queryKeys";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox, ComboboxContent, ComboboxItem } from "@/components/ui/combobox";
import { LoadingScreen } from "@/components/ui/loading-spinner";
import { WORKOUT_TYPES } from "@/lib/constants";
import { Plus, Trash2, Save, Repeat2 } from "lucide-react";
import { toast } from "sonner";

const CARDIO_TYPES = new Set(['cardio', 'hiit']);

// Step types carry no owned hue: a cardio step's type is a structural label,
// not a biometric datum, so the physiological spectrum doesn't apply and a
// per-type decorative hue would be DRIFT. The earlier `border`/`text` fields
// all resolved to the same neutral hairline (dead differentiation API), so
// they're dropped — every step card gets one neutral left rule (see
// CardioStepCard) and the type reads from its label, not a color.
const STEP_TYPES = [
  { value: 'warmup',   label: 'Warmup'   },
  { value: 'active',   label: 'Active'   },
  { value: 'recovery', label: 'Recovery' },
  { value: 'rest',     label: 'Rest'     },
  { value: 'cooldown', label: 'Cooldown' },
];

const TARGET_TYPES = [
  { value: 'open',            label: 'Open (no target)' },
  { value: 'pace',            label: 'Pace (min/km)' },
  { value: 'heart_rate_zone', label: 'Heart Rate Zone' },
  { value: 'speed',           label: 'Speed (km/h)' },
  { value: 'cadence',         label: 'Cadence (spm)' },
  { value: 'power',           label: 'Power (watts)' },
];

const HR_ZONES = [
  { value: '1', label: 'Zone 1, Very Light (50–60%)' },
  { value: '2', label: 'Zone 2, Light (60–70%)' },
  { value: '3', label: 'Zone 3, Moderate (70–80%)' },
  { value: '4', label: 'Zone 4, Hard (80–90%)' },
  { value: '5', label: 'Zone 5, Max (90–100%)' },
];

const defaultStrengthExercise = () => ({ name: "", sets: 3, reps: "10", rest_seconds: 180, notes: "" });

const defaultCardioStep = (type = 'active') => ({
  step_type: type,
  name: "",
  duration_type: "time",
  duration_value: type === 'warmup' || type === 'cooldown' ? 10 : 20,
  target_type: "open",
  target_low: "",
  target_high: "",
  notes: "",
});

const defaultRepeatBlock = () => ({
  step_type: "repeat",
  repeat_count: 4,
  steps: [
    defaultCardioStep('active'),
    defaultCardioStep('recovery'),
  ],
});

export default function CreateWorkout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const [isLoading, setIsLoading] = useState(!!editId);
  // Description is an optional, rarely-used field — keep it folded behind a
  // single-row disclosure so the dense form stays short on a 390px viewport.
  const [showDescription, setShowDescription] = useState(false);
  const [workout, setWorkout] = useState({
    title: "",
    description: "",
    focus: "strength",
    duration_minutes: 30,
    exercises: [defaultStrengthExercise()],
    folder: "",
  });

  const isCardio = CARDIO_TYPES.has(workout.focus);

  const { data: allWorkouts = [] } = useQuery({
    queryKey: queryKeys.workouts(),
    queryFn: () => db.entities.Workout.filter({ created_by: user.id }),
    enabled: !!user,
  });

  const existingFolders = [...new Set(
    allWorkouts.map(w => w.folder).filter(Boolean)
  )].sort();

  const existingExercises = [...new Set(
    allWorkouts
      .flatMap(w => w.exercises || [])
      .map(ex => ex.name)
      .filter(Boolean)
      .map(name => name.trim())
  )].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    const fetchWorkout = async () => {
      if (!editId || !user) return;
      try {
        const workouts = await db.entities.Workout.filter({ id: editId, created_by: user.id });
        if (!isMounted.current) return;
        if (workouts.length > 0) {
          const existingWorkout = workouts[0];
          if (isMounted.current) {
            if (existingWorkout.description) setShowDescription(true);
            setWorkout({
              title: existingWorkout.title || "",
              description: existingWorkout.description || "",
              focus: existingWorkout.focus || "strength",
              duration_minutes: existingWorkout.duration_minutes || 30,
              exercises: existingWorkout.exercises || [defaultStrengthExercise()],
              folder: existingWorkout.folder || "",
            });
          }
        } else {
          if (isMounted.current) {
            toast.error("Workout not found");
            navigate("/workouts");
          }
        }
      } catch (error) {
        console.error("Error fetching workout:", error);
        if (isMounted.current) toast.error("Failed to load workout");
      } finally {
        if (isMounted.current) setIsLoading(false);
      }
    };
    fetchWorkout();
  }, [editId, user, navigate]);

  const handleTypeChange = (newType) => {
    const wasCardio = CARDIO_TYPES.has(workout.focus);
    const willBeCardio = CARDIO_TYPES.has(newType);
    setWorkout({
      ...workout,
      focus: newType,
      exercises: wasCardio !== willBeCardio
        ? [willBeCardio ? defaultCardioStep() : defaultStrengthExercise()]
        : workout.exercises,
    });
  };

  // ── Flat exercise ops ──
  const addExercise = () => {
    setWorkout({ ...workout, exercises: [...workout.exercises, isCardio ? defaultCardioStep() : defaultStrengthExercise()] });
  };

  const addRepeatBlock = () => {
    setWorkout({ ...workout, exercises: [...workout.exercises, defaultRepeatBlock()] });
  };

  const removeExercise = (index) => {
    setWorkout({ ...workout, exercises: workout.exercises.filter((_, i) => i !== index) });
  };

  const updateExercise = (index, field, value) => {
    const next = [...workout.exercises];
    next[index] = { ...next[index], [field]: value };
    setWorkout({ ...workout, exercises: next });
  };

  // ── Nested step ops inside a repeat block ──
  const addStepToRepeat = (blockIndex) => {
    const next = [...workout.exercises];
    const block = { ...next[blockIndex] };
    block.steps = [...block.steps, defaultCardioStep('active')];
    next[blockIndex] = block;
    setWorkout({ ...workout, exercises: next });
  };

  const removeStepFromRepeat = (blockIndex, stepIndex) => {
    const next = [...workout.exercises];
    const block = { ...next[blockIndex] };
    block.steps = block.steps.filter((_, i) => i !== stepIndex);
    next[blockIndex] = block;
    setWorkout({ ...workout, exercises: next });
  };

  const updateStepInRepeat = (blockIndex, stepIndex, field, value) => {
    const next = [...workout.exercises];
    const block = { ...next[blockIndex] };
    const steps = [...block.steps];
    steps[stepIndex] = { ...steps[stepIndex], [field]: value };
    block.steps = steps;
    next[blockIndex] = block;
    setWorkout({ ...workout, exercises: next });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const workoutData = {
        title: workout.title,
        description: workout.description,
        focus: workout.focus,
        duration_minutes: workout.duration_minutes,
        exercises: workout.exercises,
        folder: workout.folder?.trim() || null,
      };
      const duplicateName = allWorkouts.find(w =>
        w.title.toLowerCase() === workoutData.title.toLowerCase() && w.id !== editId
      );
      if (duplicateName) {
        toast.error(`A workout named "${workoutData.title}" already exists`);
        return;
      }
      if (editId) {
        await db.entities.Workout.update(editId, workoutData);
        invalidateWorkouts(queryClient);
        toast.success("Workout updated successfully");
      } else {
        await db.entities.Workout.create({ ...workoutData, created_by: user.id });
        invalidateWorkouts(queryClient);
        toast.success("Workout created successfully");
      }
      navigate("/workouts");
    } catch (error) {
      console.error(`Error ${editId ? 'updating' : 'creating'} workout:`, error);
      toast.error(`Failed to ${editId ? 'update' : 'create'} workout`);
    }
  };

  if (isLoading) return <LoadingScreen />;

  return (
    <div className="p-4 md:p-6 bg-charcoal min-h-screen transition-colors duration-300">
      <div className="max-w-5xl mx-auto">
        {/* Desktop-only page header. On mobile the shared Layout chrome already
            prints the page name and the "Workout Details" CardTitle follows
            immediately, so this in-file title+subtitle band is suppressed below
            lg, it was the redundant third header stratum that pushed the first
            input down the 390px viewport. */}
        <div className="hidden lg:block mb-6">
          <h1 className="text-2xl font-bold text-ink">{editId ? 'Edit Workout' : 'Create Workout'}</h1>
          <p className="text-ink-muted text-sm mt-0.5">
            {editId ? 'Edit structure and exercises' : 'Define structure. Save to library.'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <Card className="mb-4 md:mb-6">
            <CardHeader><CardTitle>Workout Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 sm:space-y-4">
              <div>
                <Label htmlFor="title">Workout Title *</Label>
                <Input
                  id="title"
                  value={workout.title}
                  onChange={(e) => setWorkout({ ...workout, title: e.target.value })}
                  placeholder="e.g., Upper Body Strength"
                  required
                  className="mt-1"
                />
              </div>

              {showDescription ? (
                <div className="rise-in">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    autoFocus={!workout.description}
                    value={workout.description}
                    onChange={(e) => setWorkout({ ...workout, description: e.target.value })}
                    placeholder="Describe your workout…"
                    rows={2}
                    className="mt-1"
                  />
                </div>
              ) : (
                /* Disclosure, not a data field: a quiet inline toggle (auto
                   width, no glass fill/edge/border) so it reads as a link-style
                   affordance that reveals an optional field, never as another
                   empty input competing with the real Inputs above/below. Stays
                   neutral ink-muted (not coral) so it doesn't drift into a
                   second action color beside the Save CTA. Keeps Plus + 44px. */
                <Button
                  type="button"
                  variant="dim"
                  size="lg"
                  onClick={() => setShowDescription(true)}
                  className="h-11 justify-start border-0 bg-transparent hover:bg-transparent px-1"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add description
                </Button>
              )}

              <div>
                <Label htmlFor="folder">Folder</Label>
                <Combobox
                  value={workout.folder}
                  onValueChange={(value) => setWorkout({ ...workout, folder: value })}
                  placeholder="e.g., Push Pull Legs, Upper/Lower"
                >
                  <ComboboxContent>
                    {existingFolders.map(f => (
                      <ComboboxItem key={f} value={f}>{f}</ComboboxItem>
                    ))}
                  </ComboboxContent>
                </Combobox>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-4">
                <div>
                  <Label htmlFor="type">Workout Type *</Label>
                  <Select value={workout.focus} onValueChange={handleTypeChange}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WORKOUT_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="duration">Duration (minutes) *</Label>
                  <Input
                    id="duration"
                    type="number"
                    value={workout.duration_minutes}
                    // Allow the field to be cleared mid-edit (empty string) so it
                    // can be retyped; snap back to a valid >=1 on blur. The old
                    // onChange forced 1 on every keystroke, so backspacing the
                    // value instantly reset it to 1.
                    onChange={(e) => setWorkout({ ...workout, duration_minutes: e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1) })}
                    onBlur={(e) => { if (e.target.value === '') setWorkout({ ...workout, duration_minutes: 1 }); }}
                    required
                    min="1"
                    className="mt-1"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-4 md:mb-6">
            <CardHeader><CardTitle>{isCardio ? 'Steps' : 'Exercises'}</CardTitle></CardHeader>
            <CardContent className="space-y-3 sm:space-y-4">
              {workout.exercises.map((exercise, index) => {
                if (!isCardio) {
                  return (
                    <StrengthExerciseCard
                      key={index}
                      index={index}
                      exercise={exercise}
                      canRemove={workout.exercises.length > 1}
                      existingExercises={existingExercises}
                      onRemove={() => removeExercise(index)}
                      onChange={(field, value) => updateExercise(index, field, value)}
                    />
                  );
                }
                if (exercise.step_type === 'repeat') {
                  return (
                    <RepeatBlockCard
                      key={index}
                      block={exercise}
                      canRemove={workout.exercises.length > 1}
                      onRemove={() => removeExercise(index)}
                      onChangeCount={(count) => updateExercise(index, 'repeat_count', count)}
                      onAddStep={() => addStepToRepeat(index)}
                      onRemoveStep={(si) => removeStepFromRepeat(index, si)}
                      onChangeStep={(si, field, value) => updateStepInRepeat(index, si, field, value)}
                    />
                  );
                }
                return (
                  <CardioStepCard
                    key={index}
                    index={index}
                    step={exercise}
                    canRemove={workout.exercises.length > 1}
                    onRemove={() => removeExercise(index)}
                    onChange={(field, value) => updateExercise(index, field, value)}
                  />
                );
              })}

              {/* Add-row buttons all share size=lg (h-11 = 44px tap target, so
                  no redundant min-h-[44px]) + variant=outline. border-dashed is
                  reserved for the nested insert inside a repeat block, so a
                  top-level "add" never visually rhymes with a nested one. */}
              {isCardio ? (
                <div className="flex gap-2">
                  <Button type="button" onClick={addExercise} variant="outline" size="lg" className="flex-1">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Step
                  </Button>
                  <Button type="button" onClick={addRepeatBlock} variant="outline" size="lg" className="flex-1">
                    <Repeat2 className="w-4 h-4 mr-2" />
                    Add Repeat
                  </Button>
                </div>
              ) : (
                <Button type="button" onClick={addExercise} variant="outline" size="lg" className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Exercise
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Mobile spacer: the action row below is `sticky bottom-0` and pins
              its glass lid over whatever scrolls beneath it. Without this, the
              last card's inputs can never scroll clear of the pinned bar, so
              they sit clipped behind it at the fold. The bar's full painted
              height is pt-3 (12px) + the 44px button + its bottom padding
              (--dock-total-height + 16px + safe-area), so the spacer must
              reserve that exact footprint, not a guessed ~64px, or the last
              inputs stay clipped. At lg the bar is static and needs no spacer. */}
          <div
            aria-hidden
            className="lg:hidden h-[calc(12px+44px+var(--dock-total-height)+16px+env(safe-area-inset-bottom))]"
          />

          {/* Action row. This form runs ~1168px (well past one phone viewport),
              so on mobile the coral Save must not live only at the bottom of the
              scroll: below lg the row is `sticky bottom-0`, pinned just above the
              dock (--dock-clearance) with a safe-area inset, so it stays in the
              thumb zone while the user scrolls the long form. A glass-sheet lid +
              hairline top edge separates it from the content scrolling beneath.
              At lg it returns to static flow (no dock, plenty of width), sitting
              at the natural end of the form. The negative inline margins let the
              sticky bar bleed to the page gutters on mobile while the lg:static
              state resets them. */}
          <div
            className="sticky bottom-0 z-20 -mx-4 mt-2 flex gap-3 glass-sheet [border:0] border-t-[0.5px] [border-top-color:var(--color-border-soft)] px-4 pb-[calc(var(--dock-total-height)+16px+env(safe-area-inset-bottom))] pt-3
                       lg:static lg:z-auto lg:mx-0 lg:mt-0 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:[backdrop-filter:none]"
          >
            <Button type="button" variant="ghost" size="lg" onClick={() => navigate("/workouts")} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" variant="volt" size="lg" className="flex-[2]">
              <Save className="w-4 h-4 mr-2" />
              {editId ? 'Update Workout' : 'Save Workout'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StrengthExerciseCard({ index, exercise, canRemove, existingExercises, onRemove, onChange }) {
  return (
    <div className="glass-inset p-4 rise-in">
        <div className="flex justify-between items-start mb-4">
          <h4 className="font-semibold text-ink">Exercise {index + 1}</h4>
          {canRemove && (
            <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label="Remove exercise" className="min-h-[44px] min-w-[44px] px-0 shrink-0 text-ink-muted hover:text-ink">
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
        <div className="grid gap-4">
          <div>
            <Label>Exercise Name *</Label>
            <Combobox
              value={exercise.name}
              onValueChange={(value) => onChange("name", value)}
              placeholder="e.g., Push-ups, Barbell Squat"
            >
              <ComboboxContent>
                {existingExercises.map(ex => (
                  <ComboboxItem key={ex} value={ex}>{ex}</ComboboxItem>
                ))}
              </ComboboxContent>
            </Combobox>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <div>
              <Label>Sets</Label>
              <Input
                type="number"
                value={exercise.sets}
                onChange={(e) => onChange("sets", e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1))}
                onBlur={(e) => { if (e.target.value === '') onChange("sets", 1); }}
                min="1"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Reps</Label>
              <Input
                value={exercise.reps}
                onChange={(e) => onChange("reps", e.target.value)}
                placeholder="e.g., 10-12"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Rest (sec)</Label>
              <Input
                type="number"
                value={exercise.rest_seconds}
                onChange={(e) => onChange("rest_seconds", e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0))}
                onBlur={(e) => { if (e.target.value === '') onChange("rest_seconds", 0); }}
                min="0"
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              value={exercise.notes}
              onChange={(e) => onChange("notes", e.target.value)}
              placeholder="Form cues, variations, etc."
              rows={2}
              className="mt-1"
            />
          </div>
        </div>
    </div>
  );
}

function RepeatBlockCard({ block, canRemove, onRemove, onChangeCount, onAddStep, onRemoveStep, onChangeStep }) {
  return (
    <div className="glass-inset overflow-hidden rise-in">
      {/* Repeat header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-charcoal-borderSoft">
        <Repeat2 className="w-4 h-4 text-ink-muted shrink-0" />
        <span className="text-sm font-semibold text-ink">Repeat</span>
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            value={block.repeat_count}
            onChange={(e) => onChangeCount(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1))}
            onBlur={(e) => { if (e.target.value === '') onChangeCount(1); }}
            min="1"
            max="99"
            className="w-16 min-h-[44px] text-sm text-center"
          />
          <span className="text-sm text-ink-muted">×</span>
        </div>
        <span className="font-technical text-xs text-ink-muted flex-1">
          {block.steps?.length || 0} step{block.steps?.length !== 1 ? 's' : ''} per repeat
        </span>
        {canRemove && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label="Remove repeat block" className="ml-auto shrink-0 min-h-[44px] min-w-[44px] px-0 text-ink-muted hover:text-ink">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Nested steps */}
      <div className="p-3 space-y-2">
        {(block.steps || []).map((step, si) => (
          <CardioStepCard
            key={si}
            index={si}
            step={step}
            canRemove={(block.steps || []).length > 1}
            onRemove={() => onRemoveStep(si)}
            onChange={(field, value) => onChangeStep(si, field, value)}
            nested
          />
        ))}
        {/* Nested-insert affordance: same size=lg/outline as top-level adds,
            but border-dashed (reserved here) signals it inserts INTO the
            repeat block rather than appending a top-level step. */}
        <Button
          type="button"
          onClick={onAddStep}
          variant="outline"
          size="lg"
          className="w-full border-dashed border-charcoal-border"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Step to Repeat
        </Button>
      </div>
    </div>
  );
}

function CardioStepCard({ index, step, canRemove, onRemove, onChange, nested = false }) {
  return (
    <div className="glass-inset p-4 border-l-[3px] border-l-charcoal-border rise-in">
        <div className="flex justify-between items-start mb-4">
          <span className="text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">
            Step {index + 1}
          </span>
          {canRemove && (
            <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label="Remove step" className="min-h-[44px] min-w-[44px] px-0 shrink-0 text-ink-muted hover:text-ink">
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>

        <div className="grid gap-4">
          {/* Name + Step type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Step Name</Label>
              <Input
                value={step.name}
                onChange={(e) => onChange("name", e.target.value)}
                placeholder="e.g., Easy Run, Tempo"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Step Type</Label>
              <Select value={step.step_type} onValueChange={(v) => onChange("step_type", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STEP_TYPES.map(st => (
                    <SelectItem key={st.value} value={st.value}>{st.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Duration */}
          <div>
            <Label>Duration</Label>
            <div className="flex gap-2 mt-1 items-center">
              <Select value={step.duration_type} onValueChange={(v) => onChange("duration_type", v)}>
                <SelectTrigger className="w-full sm:w-36 shrink-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="time">Time (min)</SelectItem>
                  <SelectItem value="distance">Distance (km)</SelectItem>
                  <SelectItem value="open">Open / Lap</SelectItem>
                </SelectContent>
              </Select>
              {step.duration_type !== "open" && (
                <Input
                  type="number"
                  value={step.duration_value}
                  onChange={(e) => onChange("duration_value", parseFloat(e.target.value) || 0)}
                  min="0"
                  step={step.duration_type === "distance" ? "0.1" : "1"}
                  placeholder={step.duration_type === "time" ? "min" : "km"}
                  className="flex-1"
                />
              )}
            </div>
          </div>

          {/* Target */}
          <div>
            <Label>Target</Label>
            <div className="flex gap-2 mt-1 items-center flex-wrap">
              <Select value={step.target_type} onValueChange={(v) => onChange("target_type", v)}>
                <SelectTrigger className="w-full sm:w-48 shrink-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TARGET_TYPES.map(tt => (
                    <SelectItem key={tt.value} value={tt.value}>{tt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {step.target_type === 'heart_rate_zone' && (
                <Select
                  value={step.target_low?.toString() || ""}
                  onValueChange={(v) => onChange("target_low", v)}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select zone" />
                  </SelectTrigger>
                  <SelectContent>
                    {HR_ZONES.map(z => (
                      <SelectItem key={z.value} value={z.value}>{z.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {(step.target_type === 'pace' || step.target_type === 'speed' || step.target_type === 'cadence' || step.target_type === 'power') && (
                <>
                  <Input
                    value={step.target_low}
                    onChange={(e) => onChange("target_low", e.target.value)}
                    placeholder={step.target_type === 'pace' ? "5:30" : "min"}
                    className="w-20 min-h-[44px]"
                  />
                  <span className="text-ink-muted text-sm">–</span>
                  <Input
                    value={step.target_high}
                    onChange={(e) => onChange("target_high", e.target.value)}
                    placeholder={step.target_type === 'pace' ? "6:00" : "max"}
                    className="w-20 min-h-[44px]"
                  />
                  <span className="text-xs text-ink-muted shrink-0">
                    {step.target_type === 'pace' ? '/km'
                      : step.target_type === 'speed' ? 'km/h'
                      : step.target_type === 'cadence' ? 'spm'
                      : 'W'}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label>Notes</Label>
            <Textarea
              value={step.notes}
              onChange={(e) => onChange("notes", e.target.value)}
              placeholder="e.g., Stay conversational, focus on turnover"
              rows={2}
              className="mt-1"
            />
          </div>
        </div>
    </div>
  );
}
