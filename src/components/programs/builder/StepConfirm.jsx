import { Card, CardContent, CardHeader, CardTitle, CardDescription, ListRow, SectionLabel, Stat } from "@/components/ui";
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

  const goalLabel = GOALS.find((g) => g.value === program.goal)?.label || program.goal?.replace("_", " ");

  return (
    <div className="flex flex-col gap-stack">
      <Card>
        <CardHeader>
          <CardTitle>Review & Confirm</CardTitle>
          {program.description && <CardDescription>{program.description}</CardDescription>}
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Stat size="sm" label="Name" value={program.name} />
          </div>
          <Stat size="sm" label="Cycle" value={`${program.cycle_length}-day x ${program.num_cycles}`} />
          <Stat size="sm" label="Total days" value={program.cycle_length * program.num_cycles} unit="days" />
          <Stat size="sm" label="Goal" value={goalLabel} />
          <Stat size="sm" label="Training days" value={`${filledDays} of ${program.cycle_length}`} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionLabel>Cycle template</SectionLabel>
        </CardHeader>
        <div>
          {workouts.map((w) => {
            const hasExercises = w.exercises?.length > 0;
            const hasCardio = w.cardio_sessions?.length > 0;
            const isEmpty = !hasExercises && !hasCardio;
            const detail =
              [
                hasExercises && `${w.exercises.length} exercises`,
                hasCardio && `${w.cardio_sessions.length} cardio`,
              ]
                .filter(Boolean)
                .join(" · ") || "Rest";
            return (
              <ListRow
                key={w.day_index}
                title={isEmpty ? "Rest" : w.title}
                detail={detail}
                value={`Day ${w.day_index}`}
                className={isEmpty ? "opacity-60" : ""}
              />
            );
          })}
        </div>
      </Card>

      <p className="px-gutter text-caption text-ink-muted">
        {`Ready to save: ${filledDays} training days`}
        {totalExercises > 0 && `, ${totalExercises} exercises`}
        {totalCardioSessions > 0 && `, ${totalCardioSessions} cardio sessions`}
        {`, repeated ${program.num_cycles} time${program.num_cycles !== 1 ? "s" : ""}.`}
      </p>
    </div>
  );
}
