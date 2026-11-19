import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { GOALS } from "./constants";

export default function StepConfirm({ program, workouts }) {
  const totalExercises = workouts.reduce(
    (sum, w) => sum + (w.exercises?.length || 0),
    0
  );
  const totalCardioSessions = workouts.reduce(
    (sum, w) => sum + (w.cardio_sessions?.length || 0),
    0
  );
  const filledDays = workouts.filter(
    (w) => w.exercises?.length > 0 || w.cardio_sessions?.length > 0
  ).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review & Confirm</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Name spans both columns so the remaining four stats pair off evenly
              and the 5th ('Training Days') never orphans on its own row. */}
          <div className="col-span-2">
            <p className="text-xs text-ink-muted">Name</p>
            <p className="font-semibold">{program.name}</p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Cycle</p>
            <p className="font-technical font-semibold">{program.cycle_length}-day cycle &times; {program.num_cycles}</p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Total Days</p>
            <p className="font-technical font-semibold">{program.cycle_length * program.num_cycles} days</p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Goal</p>
            <p className="font-semibold">{GOALS.find(g => g.value === program.goal)?.label || program.goal?.replace("_", " ")}</p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Training Days</p>
            <p className="font-technical font-semibold">{filledDays} of {program.cycle_length} days</p>
          </div>
        </div>

        {program.description && (
          <div>
            <p className="text-xs text-ink-muted">Description</p>
            <p className="text-sm text-ink-muted">{program.description}</p>
          </div>
        )}

        <div className="border-t hairline pt-4">
          <h3 className="section-label mb-3">Cycle Template</h3>
          <div className="space-y-2">
            {workouts.map((w) => {
              const hasExercises = w.exercises?.length > 0;
              const hasCardio = w.cardio_sessions?.length > 0;
              const isEmpty = !hasExercises && !hasCardio;
              return (
                <div
                  key={w.day_index}
                  className={`flex items-center justify-between glass-inset p-2 text-sm ${
                    isEmpty ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      Day {w.day_index}
                    </Badge>
                    <span className="font-medium">
                      {isEmpty ? "Rest" : w.title}
                    </span>
                  </div>
                  <span className="text-xs text-ink-muted">
                    {[
                      hasExercises && `${w.exercises.length} exercises`,
                      hasCardio && `${w.cardio_sessions.length} cardio`,
                    ].filter(Boolean).join(" · ") || "Rest"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 glass-inset p-3 text-sm text-ink-secondary">
          <Check className="w-4 h-4 shrink-0 text-ink" />
          <span>
            Ready to save: {filledDays} training days
            {totalExercises > 0 && `, ${totalExercises} exercises`}
            {totalCardioSessions > 0 && `, ${totalCardioSessions} cardio sessions`}
            , repeated {program.num_cycles} time{program.num_cycles !== 1 ? "s" : ""}.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
