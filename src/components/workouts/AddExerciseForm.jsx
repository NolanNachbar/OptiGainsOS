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
      {/* Quiet caption only — the type-display directive ("Build your session")
          lives one level up on the page so the hero frames this action. Here
          "No exercises yet" is a low-weight status caption, NOT a second hero,
          so the two don't compete. */}
      {isEmptyState && (
        <div className="flex items-center gap-1.5 mb-2.5">
          <Dumbbell className="w-3.5 h-3.5 text-ink-muted shrink-0" />
          <p className="text-xs font-semibold text-ink-muted leading-tight">No exercises yet</p>
        </div>
      )}
      <div className="flex gap-2">
          <div className="flex-1 min-w-0">
            <Combobox
              value={exerciseName}
              onValueChange={setExerciseName}
              items={allNames}
              // Short placeholder so it never truncates inside the narrow input
              // on a 390px row (the old "Exercise name (e.g., Bench Press)" was
              // clipped beside the Add button). The Combobox list teaches the
              // format; the field only needs to label itself.
              placeholder="Exercise name"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
          </div>
          <Button
            onClick={handleAdd}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            variant={isEmptyState ? "volt" : "outline"}
            size="lg"
            // <sm the label is dropped so Add collapses to an icon-only square,
            // reclaiming row width for the exercise-name field (which is the
            // part that was getting squeezed/truncated). The label returns at
            // sm+ where there's room.
            className={isEmptyState ? "aspect-square px-0 sm:aspect-auto sm:px-[22px]" : undefined}
            aria-label="Add exercise"
          >
            <Plus className="w-4 h-4 sm:mr-1" />
            <span className={isEmptyState ? "hidden sm:inline" : undefined}>Add</span>
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
