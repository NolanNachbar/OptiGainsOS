import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useUserQueries";
import { queryKeys } from "@/lib/queryKeys";
import { LoadingScreen } from "@/components/ui/loading-spinner";
import { Module } from "@/components/ui/system";
import ExerciseProgressChart from "@/components/progress/ExerciseProgressChart";
import { getLoggedExerciseSummaries } from "@/utils/exerciseStats";
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

  if (!user || isLoading) {
    return <LoadingScreen />;
  }

  return (
    <div
      className="min-h-full px-4 sm:px-6 pt-2 lg:pt-6 max-w-[720px] mx-auto"
      style={{ paddingBottom: "calc(var(--floating-chrome-bottom) + 64px)" }}
    >
      <div className="hidden lg:block mb-5">
        <h1 className="type-display text-[26px]">Lifts</h1>
      </div>

      {summaries.length === 0 ? (
        <div className="glass-inset flex items-center justify-center text-center py-16 px-6 -mx-4 sm:-mx-6 lg:mx-0">
          <p className="text-sm font-semibold text-muted-2">
            Log a workout with completed sets to see lift progress here.
          </p>
        </div>
      ) : (
        <Module label={`Lifts · ${summaries.length}`}>
          {summaries.map((s) => {
            const isOpen = expanded === s.name;
            return (
              <div key={s.name} className="border-t hairline first:border-t-0">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : s.name)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center gap-3 py-2.5 min-h-[44px] text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-extrabold text-ink truncate">{s.name}</p>
                    <p className="text-[10px] font-semibold text-muted-2 mt-0.5">
                      {format(parseISO(s.lastDate), "MMM d")} · {s.count} session{s.count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-technical text-xs font-bold text-ink tabular-nums">
                      {s.currentE1rm} <span className="text-[10px] font-semibold text-muted-2">{weightUnit}</span>
                    </p>
                    <p
                      className={`font-technical text-[10px] font-bold tabular-nums mt-0.5 ${
                        s.change4w == null
                          ? "text-faint"
                          : s.change4w > 0
                          ? "text-leaf"
                          : s.change4w < 0
                          ? "text-muted-2"
                          : "text-muted-2"
                      }`}
                    >
                      {s.change4w == null
                        ? "— / 4wk"
                        : `${s.change4w > 0 ? "+" : ""}${s.change4w} / 4wk`}
                    </p>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-faint shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {isOpen && (
                  <div className="pb-3">
                    <ExerciseProgressChart data={s.history} exerciseName={s.name} weightUnit={weightUnit} />
                  </div>
                )}
              </div>
            );
          })}
        </Module>
      )}
    </div>
  );
}
