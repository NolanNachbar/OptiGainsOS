import { useState, useEffect } from "react";
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

const STEP_TYPES = [
  { value: 'warmup',   label: 'Warmup',   border: 'border-l-carb/60',   text: 'text-carb' },
  { value: 'active',   label: 'Active',   border: 'border-l-teal/70',   text: 'text-teal' },
  { value: 'recovery', label: 'Recovery', border: 'border-l-leaf/60',   text: 'text-leaf' },
  { value: 'rest',     label: 'Rest',     border: 'border-l-white/20',  text: 'text-ink-muted' },
  { value: 'cooldown', label: 'Cooldown', border: 'border-l-white/25',  text: 'text-ink-muted' },
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
  { value: '1', label: 'Zone 1 — Very Light (50–60%)' },
  { value: '2', label: 'Zone 2 — Light (60–70%)' },
  { value: '3', label: 'Zone 3 — Moderate (70–80%)' },
  { value: '4', label: 'Zone 4 — Hard (80–90%)' },
  { value: '5', label: 'Zone 5 — Max (90–100%)' },
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

  useEffect(() => {
    const fetchWorkout = async () => {
      if (!editId || !user) return;
      try {
        const workouts = await db.entities.Workout.filter({ id: editId, created_by: user.id });
        if (workouts.length > 0) {
          const existingWorkout = workouts[0];
          setWorkout({
            title: existingWorkout.title || "",
            description: existingWorkout.description || "",
            focus: existingWorkout.focus || "strength",
            duration_minutes: existingWorkout.duration_minutes || 30,
            exercises: existingWorkout.exercises || [defaultStrengthExercise()],
            folder: existingWorkout.folder || "",
          });
        } else {
          toast.error("Workout not found");
          navigate("/workouts");
        }
      } catch (error) {
        console.error("Error fetching workout:", error);
        toast.error("Failed to load workout");
      } finally {
        setIsLoading(false);
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
      };
      const allWorkouts = await db.entities.Workout.filter({ created_by: user.id });
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
        <div className="mb-6">
          <p className="text-ink-muted text-sm">
            {editId ? 'Edit structure and exercises' : 'Define structure. Save to library.'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <Card className="mb-6">
            <CardHeader><CardTitle>Workout Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
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

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={workout.description}
                  onChange={(e) => setWorkout({ ...workout, description: e.target.value })}
                  placeholder="Describe your workout..."
                  rows={3}
                  className="mt-1"
                />
              </div>

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

              <div className="grid md:grid-cols-3 gap-4">
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
                    onChange={(e) => setWorkout({ ...workout, duration_minutes: parseInt(e.target.value) })}
                    required
                    min="1"
                    className="mt-1"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader><CardTitle>{isCardio ? 'Steps' : 'Exercises'}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
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

              {isCardio ? (
                <div className="flex gap-2">
                  <Button type="button" onClick={addExercise} variant="outline" className="flex-1">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Step
                  </Button>
                  <button
                    type="button"
                    onClick={addRepeatBlock}
                    className="flex-1 h-9 px-4 text-[13.5px] inline-flex items-center justify-center gap-1.5 font-semibold rounded-xl border border-violet/25 text-violet hover:bg-violet/10 transition-colors"
                  >
                    <Repeat2 className="w-4 h-4 mr-2" />
                    Add Repeat
                  </button>
                </div>
              ) : (
                <Button type="button" onClick={addExercise} variant="outline" className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Exercise
                </Button>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => navigate("/workouts")} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" variant="volt" className="flex-1">
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
    <div className="glass-inset p-4">
        <div className="flex justify-between items-start mb-4">
          <h4 className="font-semibold text-ink">Exercise {index + 1}</h4>
          {canRemove && (
            <Button type="button" variant="dim" size="sm" onClick={onRemove}>
              <Trash2 className="w-4 h-4 text-bad" />
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
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Sets</Label>
              <Input
                type="number"
                value={exercise.sets}
                onChange={(e) => onChange("sets", parseInt(e.target.value))}
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
                onChange={(e) => onChange("rest_seconds", parseInt(e.target.value))}
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
    <div className="border-[0.5px] border-violet/25 rounded-xl overflow-hidden">
      {/* Repeat header */}
      <div className="flex items-center gap-3 bg-violet/10 px-4 py-2.5">
        <Repeat2 className="w-4 h-4 text-violet shrink-0" />
        <span className="text-sm font-semibold text-violet">Repeat</span>
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            value={block.repeat_count}
            onChange={(e) => onChangeCount(Math.max(1, parseInt(e.target.value) || 1))}
            min="1"
            max="99"
            className="w-16 h-7 text-sm text-center font-technical"
          />
          <span className="text-sm text-violet">×</span>
        </div>
        <span className="font-technical text-xs text-ink-muted flex-1">
          {block.steps?.length || 0} step{block.steps?.length !== 1 ? 's' : ''} per repeat
        </span>
        {canRemove && (
          <button type="button" onClick={onRemove} className="text-ink-muted hover:text-bad transition-colors ml-auto shrink-0">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
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
        <button
          type="button"
          onClick={onAddStep}
          className="w-full h-8 inline-flex items-center justify-center rounded-lg text-xs font-semibold text-violet hover:bg-violet/10 border border-dashed border-violet/25 transition-colors"
        >
          <Plus className="w-3 h-3 mr-1" />
          Add Step to Repeat
        </button>
      </div>
    </div>
  );
}

function CardioStepCard({ index, step, canRemove, onRemove, onChange, nested = false }) {
  const meta = STEP_TYPES.find(s => s.value === step.step_type) || STEP_TYPES[1];

  const card = `glass-inset p-4 border-l-[3px] ${meta.border}`;

  return (
    <div className={card}>
        <div className="flex justify-between items-start mb-4">
          <span className={`text-[10.5px] font-bold uppercase tracking-[0.06em] ${meta.text}`}>
            Step {index + 1}
          </span>
          {canRemove && (
            <Button type="button" variant="dim" size="sm" onClick={onRemove}>
              <Trash2 className="w-4 h-4 text-bad" />
            </Button>
          )}
        </div>

        <div className="grid gap-4">
          {/* Name + Step type */}
          <div className="grid grid-cols-2 gap-4">
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
                <SelectTrigger className="w-36 shrink-0"><SelectValue /></SelectTrigger>
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
                  onChange={(e) => onChange("duration_value", parseFloat(e.target.value))}
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
                <SelectTrigger className="w-48 shrink-0"><SelectValue /></SelectTrigger>
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
                    className="w-20"
                  />
                  <span className="text-ink-muted text-sm">–</span>
                  <Input
                    value={step.target_high}
                    onChange={(e) => onChange("target_high", e.target.value)}
                    placeholder={step.target_type === 'pace' ? "6:00" : "max"}
                    className="w-20"
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
