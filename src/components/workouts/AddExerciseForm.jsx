import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Plus, X, Dumbbell } from "lucide-react";
import { EXERCISE_DB } from "@/ml/exerciseDB";

const DB_NAMES = EXERCISE_DB.map(e => e.name).sort((a, b) =>
  a.toLowerCase().localeCompare(b.toLowerCase())
);

export default function AddExerciseForm({ onAdd, showCloseButton = true, exerciseNames = [], hasExercises = true }) {
  const [showForm, setShowForm] = useState(true);
  const [exerciseName, setExerciseName] = useState("");

  // Empty workout: the add-exercise input is the page's sole primary action, so
  // it owns the only coral fill (the Add button goes `volt`). Once exercises
  // exist, Finish becomes primary, so Add steps down to a neutral outline. The
  // form always flows inline — coral expresses primacy, not a fixed position.
  const isEmptyState = !hasExercises;

  // Merge DB names with any extra names from history, deduped
  const allNames = useMemo(() => {
    if (exerciseNames.length === 0) return DB_NAMES;
    const set = new Set(DB_NAMES);
    exerciseNames.forEach(n => set.add(n));
    return [...set].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }, [exerciseNames]);

  const handleAdd = () => {
    if (onAdd(exerciseName)) {
      setExerciseName("");
      setShowForm(false);
    }
  };

  if (!showForm) {
    // Collapsed pill only appears once exercises exist (parent passes
    // showCloseButton in lockstep), so Add is a secondary action here → neutral
    // outline, never coral. Coral is reserved for the active Finish CTA.
    return (
      <Button
        variant="outline"
        onClick={() => setShowForm(true)}
        className="w-full py-6 rounded-2xl border border-dashed border-charcoal-border bg-transparent font-bold lg:mb-0"
      >
        <Plus className="w-5 h-5 mr-2" />
        Add Exercise
      </Button>
    );
  }

  const form = (
    <div className="glass rounded-2xl px-4 pt-4 pb-4 lg:mb-0 rise-in">
      {/* Empty-state prompt folded in: the input sits directly below it, so the
          "first exercise" call-to-action and its action are one unit (no
          split-away top card). */}
      {isEmptyState && (
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-[26px] h-[26px] rounded-md bg-teal/15 flex items-center justify-center shrink-0">
            <Dumbbell className="w-3.5 h-3.5 text-teal" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-ink leading-tight">No exercises yet</p>
            <p className="text-xs font-semibold text-ink-secondary leading-tight mt-0.5">
              Add your first exercise to start logging.
            </p>
          </div>
        </div>
      )}
      <div className="flex gap-2">
          <div className="flex-1">
            <Combobox
              value={exerciseName}
              onValueChange={setExerciseName}
              items={allNames}
              placeholder="Exercise name (e.g., Bench Press)"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
          </div>
          <Button
            onClick={handleAdd}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            variant={isEmptyState ? "volt" : "outline"}
            size="lg"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
          {showCloseButton && (
            <Button variant="dim" size="lg" className="aspect-square px-0" onClick={() => setShowForm(false)}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
    </div>
  );

  // The form (empty-state prompt folded in when there are no exercises yet)
  // always flows inline under the COACH card so the first viewport is one
  // coherent stack — no fixed→inline position swap, just a single coordinated
  // rise entrance. The bottom action bar in WorkoutLoggingHeader owns the thumb
  // zone; this input is the page's primary action via its coral fill, not its
  // position.
  return form;
}
