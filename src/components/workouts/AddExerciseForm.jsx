import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Plus, X } from "lucide-react";
import { EXERCISE_DB } from "@/ml/exerciseDB";

const DB_NAMES = EXERCISE_DB.map(e => e.name).sort((a, b) =>
  a.toLowerCase().localeCompare(b.toLowerCase())
);

export default function AddExerciseForm({ onAdd, showCloseButton = true, exerciseNames = [], hasExercises = true }) {
  const [showForm, setShowForm] = useState(true);
  const [exerciseName, setExerciseName] = useState("");

  // Empty workout: the add-exercise input is the page's sole primary action, so
  // it owns the only coral fill and gets anchored into the thumb zone (just
  // above the bottom action bar). Once exercises exist, Finish becomes primary,
  // so Add steps down to a neutral outline and the form returns to inline flow.
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
    <div className="glass rounded-2xl border border-dashed border-charcoal-border px-4 pt-4 pb-4 lg:mb-0">
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
            <Button variant="dim" size="lg" className="w-11 px-0" onClick={() => setShowForm(false)}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
    </div>
  );

  // Empty workout on mobile: dock the add-exercise input into the thumb zone,
  // resting just above the bottom action bar (dock-clearance + the action bar's
  // own height). On desktop and once exercises exist it flows inline.
  if (isEmptyState) {
    return (
      <>
        <div
          className="lg:hidden fixed left-0 right-0 z-[9997] px-4 rise-in"
          style={{ bottom: 'calc(var(--dock-clearance, 80px) + env(safe-area-inset-bottom) + 60px)' }}
        >
          {form}
        </div>
        <div className="hidden lg:block">{form}</div>
      </>
    );
  }

  return form;
}
