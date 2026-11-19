import { useState } from "react";
import { projectProgression } from "@/utils/programProgression";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp } from "lucide-react";

export default function StepProgression({ exercises, totalCycles, projectionWeights, setProjectionWeights }) {
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
                type="number" inputMode="decimal"
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
            // The strip already sits ON a glass-inset card, so the per-cycle
            // chips drop their own glass (no inset-on-inset) and read as flat
            // bg-track tiles with a hairline. The horizontal mask fades the
            // edges so a scrollable overflow is legible without a scrollbar.
            <div
              className="flex gap-2 overflow-x-auto no-scrollbar pb-1 [mask-image:linear-gradient(to_right,transparent,#000_16px,#000_calc(100%-16px),transparent)]"
            >
              {projections.map((p) => (
                <div
                  key={p.week}
                  className="flex-shrink-0 text-center px-4 py-2 rounded-md bg-track"
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
