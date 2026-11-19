import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/api/supabaseClient";
import { queryKeys } from "@/lib/queryKeys";
import CycleDayGrid from "@/components/programs/CycleDayGrid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WORKOUT_TYPES } from "@/lib/constants";
import { Plus, Copy, ChevronUp, Dumbbell, X, Activity } from "lucide-react";
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
          <CardTitle className="text-body flex items-center gap-2">
            {/* Day label is a static identifier, not an action — neutral outline
                Badge, matching CycleDayGrid + StepConfirm. Coral is action-only. */}
            <Badge variant="outline" className="text-caption">
              Day {dayIndex}
            </Badge>
            Editing Exercises
          </CardTitle>
          <Button variant="outline" size="sm" onClick={onClose} aria-label="Close editor" className="min-h-[44px] min-w-[44px] px-0">
            <ChevronUp className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Workout title + type */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-caption">Title</Label>
            <Input
              value={workout.title}
              onChange={(e) => updateWorkoutByDay(dayIndex, "title", e.target.value)}
              className="mt-0.5 text-body"
            />
          </div>
          <div>
            <Label className="text-caption">Type</Label>
            <Select
              value={workout.focus || "strength"}
              onValueChange={(v) => updateWorkoutByDay(dayIndex, "focus", v)}
            >
              <SelectTrigger className="mt-0.5 text-body">
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
          <div className="text-center py-6 text-ink-muted">
            <Dumbbell className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-body mb-3">No exercises yet, start building this day.</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => addExercise(dayIndex)}
              className="min-h-[44px]"
            >
              <Plus className="w-3 h-3 mr-1" />
              Add Exercise
            </Button>
          </div>
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
            variant="outline"
            onClick={() => addExercise(dayIndex)}
            className="min-h-[44px]"
          >
            <Plus className="w-3 h-3 mr-1" />
            Add Exercise
          </Button>
          {/* Copy to another day */}
          <Select
            onValueChange={(targetDay) => onCopyDay(dayIndex, parseInt(targetDay))}
          >
            <SelectTrigger className="w-auto min-h-[44px] min-w-[44px] text-caption">
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
        <div className="border-t hairline pt-3">
          <Label className="text-caption font-semibold flex items-center gap-1.5 mb-2">
            <Activity className="w-3.5 h-3.5 text-ink-muted" />
            Cardio Workouts
          </Label>
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
            <SelectTrigger className="min-h-[44px] text-caption text-ink-muted">
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
              <div key={i} className="flex items-center gap-2 glass-inset px-3 py-1.5">
                <Activity className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                <span className="text-caption font-medium text-ink flex-1 truncate">{c.title}</span>
                <span className="font-numeral tabular-nums text-caption text-ink-muted shrink-0">{c.duration_minutes} min</span>
                <Select value={c.time_of_day} onValueChange={(v) => updateCardioWorkout(dayIndex, i, "time_of_day", v)}>
                  <SelectTrigger className="w-24 min-h-[44px] text-body shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="am">AM</SelectItem>
                    <SelectItem value="pm">PM</SelectItem>
                    <SelectItem value="anytime">Anytime</SelectItem>
                  </SelectContent>
                </Select>
                <button type="button" aria-label="Remove cardio" onClick={() => removeCardioWorkout(dayIndex, i)} className="min-h-[44px] min-w-[44px] -my-2 flex items-center justify-center text-ink-muted hover:text-bad transition-colors shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <Label className="text-caption">Notes</Label>
          <Textarea
            value={workout.notes || ""}
            onChange={(e) => updateWorkoutByDay(dayIndex, "notes", e.target.value)}
            placeholder="Workout notes…"
            rows={2}
            className="mt-0.5 text-body"
          />
        </div>
      </CardContent>
    </Card>
  );
}
