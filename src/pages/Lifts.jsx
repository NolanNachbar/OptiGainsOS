import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useUserQueries";
import { queryKeys } from "@/lib/queryKeys";
import { PageHeader, Card, CardHeader, CardTitle, CardDescription, ListRow, EmptyState, LoadingState, cn } from "@/components/ui";
import ExerciseProgressChart from "@/components/progress/ExerciseProgressChart";
import { getLoggedExerciseSummaries, getRepPRTable } from "@/utils/exerciseStats";
import { format, parseISO } from "date-fns";
import { ChevronDown } from "lucide-react";

// Body → Lifts (DESIGN.md / IA.md phase-2b): the e1RM progress chart used to
// be unreachable — ExerciseProgressChart only ever rendered inside
// ProgressContent.jsx, which nothing imported. This page is the real home for
// it: every logged exercise, most-recently-lifted first, each row showing its
// current e1RM and the change over the last 4 weeks; tap a row to expand its
// full history chart in place.
export default function Lifts() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const weightUnit = profile?.weight_unit || "lbs";
  const [expanded, setExpanded] = useState(null);

  const { data: workoutLogs = [], isLoading } = useQuery({
    queryKey: queryKeys.workoutLogs(user?.id),
    queryFn: () => db.entities.WorkoutLog.filter({ created_by: user.id }),
    enabled: !!user,
  });

  const summaries = useMemo(() => getLoggedExerciseSummaries(workoutLogs), [workoutLogs]);

  // Per-rep-count records for the open row only (computed on expand, not for
  // every lift in the list).
  const prTable = useMemo(
    () => (expanded ? getRepPRTable(workoutLogs, expanded) : []),
    [workoutLogs, expanded]
  );

  const shell = (children) => (
    <div
      className="min-h-full max-w-[720px] mx-auto"
      style={{ paddingBottom: "calc(var(--floating-chrome-bottom) + 64px)" }}
    >
      <PageHeader title="Lifts" meta={summaries.length > 0 ? `${summaries.length} logged, latest first` : undefined} />
      <div className="flex flex-col gap-stack">{children}</div>
    </div>
  );

  if (!user || isLoading) {
    return shell(<LoadingState rows={5} label="Loading lifts" />);
  }

  if (summaries.length === 0) {
    return shell(
      <EmptyState title="No lifts logged yet">
        Finish a workout with completed sets and each lift gets an e1RM trend here.
      </EmptyState>
    );
  }

  return shell(
    <Card>
      <CardHeader>
        <CardTitle>e1RM by lift</CardTitle>
        <CardDescription>Estimated from sets of 12 reps or fewer. Change is over the last 4 weeks.</CardDescription>
      </CardHeader>
      {summaries.map((s) => {
        const isOpen = expanded === s.name;
        let value = null;
        let unit = null;
        if (s.currentE1rm != null) {
          value = s.currentE1rm;
          unit = weightUnit;
        } else if (s.bestWeight != null) {
          // Never trained at 12 reps or fewer (calf raises and most isolation
          // work): no honest e1RM, so show the actual best set instead.
          value = s.bestWeight;
          unit = `${weightUnit} \u00d7 ${s.bestReps}`;
        } else if (s.bodyweightReps != null) {
          // Bodyweight movement never logged with added load: "0 lbs" would be
          // a lie, so report the rep count on its own.
          value = s.bodyweightReps;
          unit = "reps";
        }
        return (
          <div key={s.name} className="border-b border-charcoal-borderSoft last:border-b-0">
            <ListRow
              title={s.name}
              detail={`${format(parseISO(s.lastDate), "MMM d")} \u00b7 ${s.count} session${s.count === 1 ? "" : "s"}`}
              value={value ?? "--"}
              unit={unit}
              chevron={false}
              onClick={() => setExpanded(isOpen ? null : s.name)}
              aria-expanded={isOpen}
              className="border-b-0"
              trailing={
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "w-16 text-right text-caption font-semibold tabular-nums",
                      s.change4w != null && s.change4w > 0 ? "text-leaf" : "text-ink-muted"
                    )}
                  >
                    {s.change4w == null ? "-- / 4wk" : `${s.change4w > 0 ? "+" : ""}${s.change4w} / 4wk`}
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className={cn("h-4 w-4 shrink-0 text-ink-faint transition-transform duration-base", isOpen && "rotate-180")}
                  />
                </span>
              }
            />
            {isOpen && (
              <div className="px-gutter pb-4">
                {s.history.length > 0 ? (
                  <ExerciseProgressChart data={s.history} exerciseName={s.name} weightUnit={weightUnit} />
                ) : (
                  <p className="py-2 text-caption text-ink-muted">
                    No sets of 12 reps or fewer logged for this lift, so there is no e1RM trend to chart.{" "}
                    {s.bestWeight != null
                      ? `Best set logged is ${s.bestWeight} ${weightUnit} \u00d7 ${s.bestReps}.`
                      : s.bodyweightReps != null
                      ? `Best set logged is ${s.bodyweightReps} reps.`
                      : "No completed sets logged yet."}
                  </p>
                )}
                {prTable.length > 0 && (
                  <div className="pt-4">
                    <p className="mb-1 text-micro font-semibold uppercase tracking-[0.08em] text-ink-muted">Records by reps</p>
                    <table className="w-full text-caption tabular-nums">
                      <thead>
                        <tr className="text-left text-ink-muted">
                          <th className="py-1 font-normal">Reps</th>
                          <th className="py-1 font-normal">Best ({weightUnit})</th>
                          <th className="py-1 text-right font-normal">Set on</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prTable.map((p) => (
                          <tr key={p.reps} className="border-t border-charcoal-borderSoft text-ink">
                            <td className="py-2">{p.reps}</td>
                            <td className="py-2 font-semibold">{p.weight}</td>
                            <td className="py-2 text-right text-ink-muted">
                              {p.date ? format(parseISO(p.date), "MMM d, yyyy") : "--"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}
