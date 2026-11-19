import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/api/supabaseClient";
import { queryKeys } from "@/lib/queryKeys";
import CycleDayGrid from "@/components/programs/CycleDayGrid";
import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState, IconButton, SectionLabel } from "@/components/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WORKOUT_TYPES } from "@/lib/constants";
import { Plus, Copy, ChevronUp, X } from "lucide-react";
import ExerciseEditor from "./ExerciseEditor";

export default function InlineDayEditor({
  dayIndex,
  workout,
  allWorkouts,
  updateWorkoutByDay,
  addExercise,
  removeExercise,
  updateExercise,
  onCopyDay,
  onClose,
  addCardioWorkout,
  removeCardioWorkout,
  updateCardioWorkout,
}) {
  const { user } = useAuth();
  const { data: libraryWorkouts = [] } = useQuery({
    queryKey: queryKeys.workouts(),
    queryFn: () => db.entities.Workout.filter({ created_by: user.id }),
    enabled: !!user,
  });
  const cardioLibrary = libraryWorkouts.filter(w => w.focus === 'cardio' || w.focus === 'hiit');

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {/* Day label is a static identifier, not an action — neutral outline
                Badge, matching CycleDayGrid + StepConfirm. Coral is action-only. */}
            <Badge variant="outline">
              Day {dayIndex}
            </Badge>
            Editing Exercises
          </CardTitle>
          <IconButton icon={ChevronUp} label="Close editor" onClick={onClose} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Workout title + type */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-micro text-ink-muted">Title</Label>
            <Input
              value={workout.title}
              onChange={(e) => updateWorkoutByDay(dayIndex, "title", e.target.value)}
              className="mt-0.5"
            />
          </div>
          <div>
            <Label className="text-micro text-ink-muted">Type</Label>
            <Select
              value={workout.focus || "strength"}
              onValueChange={(v) => updateWorkoutByDay(dayIndex, "focus", v)}
            >
              <SelectTrigger className="mt-0.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORKOUT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Exercises */}
        {(workout.exercises || []).length === 0 && (
          <EmptyState title="No exercises yet">
            Add the first exercise to build this day.
          </EmptyState>
        )}

        {(workout.exercises || []).map((ex, exIdx) => (
          <ExerciseEditor
            key={exIdx}
            exercise={ex}
            index={exIdx}
            dayIndex={dayIndex}
            workoutType={workout.focus}
            updateExercise={updateExercise}
            removeExercise={removeExercise}
            canRemove={(workout.exercises || []).length > 0}
          />
        ))}

        <div className="flex gap-2 flex-wrap">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => addExercise(dayIndex)}
          >
            <Plus className="w-3 h-3 mr-1" />
            Add Exercise
          </Button>
          {/* Copy to another day */}
          <Select
            onValueChange={(targetDay) => onCopyDay(dayIndex, parseInt(targetDay))}
          >
            <SelectTrigger className="w-auto">
              <Copy className="w-3 h-3 mr-1" />
              Copy to...
            </SelectTrigger>
            <SelectContent>
              {allWorkouts
                .filter((w) => w.day_index !== dayIndex)
                .map((w) => (
                  <SelectItem key={w.day_index} value={String(w.day_index)}>
                    Day {w.day_index}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {/* Cardio Workouts */}
        <div className="border-t border-charcoal-borderSoft pt-3">
          <SectionLabel className="mb-2">Cardio workouts</SectionLabel>
          <Select
            value=""
            onValueChange={(workoutId) => {
              const w = cardioLibrary.find((w) => w.id === workoutId);
              if (w) addCardioWorkout(dayIndex, {
                workout_id: w.id,
                title: w.title,
                exercises: w.exercises || [],
                duration_minutes: w.duration_minutes || 30,
                time_of_day: "anytime",
              });
            }}
          >
            <SelectTrigger className="text-ink-muted">
              <SelectValue placeholder={cardioLibrary.length ? "Add cardio workout…" : "No cardio workouts in library yet"} />
            </SelectTrigger>
            <SelectContent>
              {cardioLibrary.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="space-y-1.5 mt-2">
            {(workout.cardio_sessions || []).map((c, i) => (
              <Card key={i} variant="inset" className="flex items-center gap-2 px-3 py-1.5">
                <span className="text-body text-ink flex-1 truncate">{c.title}</span>
                <span className="font-numeral tabular-nums text-caption text-ink-muted shrink-0">{c.duration_minutes} min</span>
                <Select value={c.time_of_day} onValueChange={(v) => updateCardioWorkout(dayIndex, i, "time_of_day", v)}>
                  <SelectTrigger className="w-24 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="am">AM</SelectItem>
                    <SelectItem value="pm">PM</SelectItem>
                    <SelectItem value="anytime">Anytime</SelectItem>
                  </SelectContent>
                </Select>
                <IconButton icon={X} label="Remove cardio" onClick={() => removeCardioWorkout(dayIndex, i)} className="-my-2 shrink-0" />
              </Card>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <Label className="text-micro text-ink-muted">Notes</Label>
          <Textarea
            value={workout.notes || ""}
            onChange={(e) => updateWorkoutByDay(dayIndex, "notes", e.target.value)}
            placeholder="Workout notes…"
            rows={2}
            className="mt-0.5"
          />
        </div>
      </CardContent>
    </Card>
  );
}
