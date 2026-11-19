import { Badge } from "@/components/ui/badge";
import { Camera } from "lucide-react";
import EquipmentProfileToggle from "@/components/workouts/EquipmentProfileToggle";
import OverrideProgramWorkout from "@/components/workouts/OverrideProgramWorkout";

// Extracted from WorkoutDetail.jsx (no behavior change).
export default function SessionChips({ equipmentSwaps, isLogging, isProgramSource, programWorkout, refetchProgramWorkout, setShowShotList, shotNoteCount, shotNotesError, shotNotesLoading, showShotList, workout }) {
  return (
    <>
    <div className="flex flex-wrap gap-2">
      <Badge variant="outline" className="capitalize">
        {workout.focus}
      </Badge>
      {isProgramSource && (
        <Badge variant="slate">Program Workout</Badge>
      )}
      <EquipmentProfileToggle swaps={equipmentSwaps} />
      {isProgramSource && !isLogging && (
        <OverrideProgramWorkout
          programWorkout={programWorkout}
          onDone={refetchProgramWorkout}
        />
      )}
      {isLogging && (
        <Badge variant="slate">Logging Active</Badge>
      )}
      {isLogging && (
        <button
          type="button"
          onClick={() => setShowShotList((v) => !v)}
          aria-pressed={showShotList}
          className="min-h-[44px] -my-2 inline-flex items-center"
        >
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold border transition-colors ${
            showShotList
              ? 'bg-brand/[0.16] border-brand/40 text-brand'
              : 'border-charcoal-border text-ink-muted hover:border-brand/30 hover:text-ink'
          }`}>
            <Camera className="w-3.5 h-3.5" />
            Shot list
          </span>
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
    </>
  );
}
