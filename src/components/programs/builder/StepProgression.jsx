import { useState } from "react";
import { projectProgression } from "@/utils/programProgression";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, EmptyState } from "@/components/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function StepProgression({ exercises, totalCycles, projectionWeights, setProjectionWeights }) {
  const [selectedExercise, setSelectedExercise] = useState(exercises[0]?.name || "");

  if (exercises.length === 0) {
    return (
      <Card>
        <EmptyState title="No exercises yet">
          Go back and add exercises to see projections.
        </EmptyState>
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
        <CardTitle>Progression preview</CardTitle>
        <CardDescription className="mb-3">
          Projection assumes a weight step every session, the best case. Enter a starting weight per exercise.
        </CardDescription>
        <div className="w-full">
          <Label className="text-micro text-ink-muted mb-2 block">Select exercise</Label>
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
        <Card variant="inset" className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-emph">{currentExercise.name}</p>
              <p className="text-caption text-ink-muted mt-1">
                {typeof currentExercise.sets === "number" ? currentExercise.sets : Array.isArray(currentExercise.sets) ? currentExercise.sets.length : 3} sets &times; {currentExercise.rep_target} reps &middot; +
                {currentExercise.progression?.weight_increment || 5} lb/session
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number" inputMode="decimal"
                placeholder="Start lb"
                className="w-28 text-body"
                value={projectionWeights[currentExercise.name] || ""}
                onChange={(e) =>
                  setProjectionWeights((prev) => ({
                    ...prev,
                    [currentExercise.name]: parseFloat(e.target.value) || 0,
                  }))
                }
              />
              <span className="text-caption text-ink-muted">lb</span>
            </div>
          </div>

          {projections.length > 0 ? (
            // The strip sits on an inset card, so the per-cycle chips read as flat
            // bg-track tiles. The horizontal mask fades the
            // edges so a scrollable overflow is legible without a scrollbar.
            <div
              className="flex gap-2 overflow-x-auto no-scrollbar pb-1 [mask-image:linear-gradient(to_right,transparent,#000_16px,#000_calc(100%-16px),transparent)]"
            >
              {projections.map((p) => (
                <div
                  key={p.week}
                  className="flex-shrink-0 text-center px-4 py-2 rounded-control bg-track"
                >
                  <p className="text-caption text-ink-muted">Cycle {p.week}</p>
                  <p className="font-numeral tabular-nums text-emph text-ink mt-1">{p.weight} lb</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-ink-muted text-caption">
              Enter a starting weight to see progression
            </div>
          )}
        </Card>
      </CardContent>
    </Card>
  );
}

// ─── Step 4: Confirm ──────────────────────────────────────
