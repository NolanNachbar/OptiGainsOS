import { lookupExercise } from "@/ml/exerciseDB";
import { Button, Card } from "@/components/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";

export default function ExerciseEditor({
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
    <Card variant="inset" className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-caption text-ink-muted">#{index + 1}</span>
            {detected && (
              <Badge variant="outline" className="capitalize">
                {detected.type}
              </Badge>
            )}
            {exercise.muscle_groups?.length > 0 && (
              <span className="text-caption text-ink-muted">
                {exercise.muscle_groups.join(", ")}
              </span>
            )}
          </div>
          {canRemove && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-label="Remove exercise"
              size="icon" className="-my-2"
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
              className="text-body"
            />
          </div>
          {!isCardio && (
            <div>
              <Label className="text-caption text-ink-muted">Focus</Label>
              <Select
                value={exercise.focus || "hypertrophy"}
                onValueChange={(v) => update("focus", v)}
              >
                <SelectTrigger className="text-caption">
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
            <Label className="text-caption text-ink-muted">{isCardio ? "Intensity (RIR)" : "RIR Target"}</Label>
            <Input
              type="number" inputMode="decimal"
              value={exercise.rir_target}
              onChange={(e) => {
                const val = e.target.value;
                update("rir_target", val === "" ? 2 : parseFloat(val));
              }}
              min="0"
              max="5"
              step="0.5"
              className="text-body"
            />
          </div>
          <div>
            <Label className="text-caption text-ink-muted">{isCardio ? "Rounds/Intervals" : "Sets"}</Label>
            <Input
              type="number" inputMode="numeric"
              value={typeof exercise.sets === "number" ? exercise.sets : Array.isArray(exercise.sets) ? exercise.sets.length : 3}
              onChange={(e) => update("sets", parseInt(e.target.value) || 3)}
              min="1"
              className="text-body"
            />
          </div>
          <div>
            <Label className="text-caption text-ink-muted">{isCardio ? "Duration/Distance" : "Rep Target"}</Label>
            <Input
              value={exercise.rep_target}
              onChange={(e) => update("rep_target", e.target.value)}
              placeholder={isCardio ? "e.g., 30 min, 5 km" : "e.g., 5 or 8-12"}
              className="text-body"
            />
          </div>
          <div>
            <Label className="text-caption text-ink-muted">Rest (sec)</Label>
            <Input
              type="number" inputMode="numeric"
              value={exercise.rest_seconds}
              onChange={(e) => update("rest_seconds", parseInt(e.target.value) || 90)}
              min="0"
              className="text-body"
            />
          </div>
          {!isCardio && (
            <div>
              <Label className="text-caption text-ink-muted">Weight +/session</Label>
              <Input
                type="number" inputMode="decimal"
                value={exercise.progression?.weight_increment || 5}
                onChange={(e) =>
                  update("progression", {
                    ...exercise.progression,
                    weight_increment: parseFloat(e.target.value) || 5,
                  })
                }
                min="0"
                step="2.5"
                className="text-body"
              />
            </div>
          )}
        </div>
    </Card>
  );
}

// ─── Step 3: Progression Preview ──────────────────────────
