import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Plus, X } from "lucide-react";
import { EXERCISE_DB } from "@/ml/exerciseDB";

const DB_NAMES = EXERCISE_DB.map(e => e.name).sort((a, b) =>
  a.toLowerCase().localeCompare(b.toLowerCase())
);

export default function AddExerciseForm({ onAdd, showCloseButton = true, exerciseNames = [] }) {
  const [showForm, setShowForm] = useState(true);
  const [exerciseName, setExerciseName] = useState("");

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
    return (
      <Button
        variant="outline"
        onClick={() => setShowForm(true)}
        className="w-full py-6 rounded-2xl border border-dashed border-white/[0.14] bg-transparent text-brand font-bold hover:bg-brand/[0.06] hover:border-brand/30 mb-28 lg:mb-0"
      >
        <Plus className="w-5 h-5 mr-2" />
        Add Exercise
      </Button>
    );
  }

  return (
    <div className="glass rounded-2xl border border-dashed border-white/[0.14] px-4 pt-4 pb-4 mb-28 lg:mb-0">
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
            variant="volt"
            size="lg"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
          {showCloseButton && (
            <Button variant="ghost" size="lg" className="w-11 px-0" onClick={() => setShowForm(false)}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
    </div>
  );
}
