import { useMemo, useState } from "react";
import { buildFinishSummary } from "@/utils/finishSummary";
import { isWarmupSet } from "@/utils/setTypes";

/**
 * Plain, collapsed-by-default recap shown inside the finish dialogs. Purely
 * informational: it never gates, delays or alters saving, and it renders
 * nothing when no set was completed. A failure computing it hides it rather
 * than touching the dialog's actions.
 */
export default function FinishSummary({ exercises, allWorkoutLogs, weightUnit = "lbs" }) {
  const [open, setOpen] = useState(false);
  const summary = useMemo(() => {
    try {
      return buildFinishSummary(exercises, allWorkoutLogs);
    } catch {
      return null;
    }
  }, [exercises, allWorkoutLogs]);

  if (!summary || summary.exercises.length === 0) return null;

  const setCount = (exercises || []).reduce(
    (n, ex) => n + (ex?.sets || []).filter((s) => s?.completed && !isWarmupSet(s)).length,
    0,
  );
  const stats = [
    ["Volume", summary.volume.toLocaleString(), weightUnit],
    ["Sets", String(setCount), null],
    ["PRs", String(summary.prs.length), null],
  ];

  return (
    <div className="rounded-control border border-charcoal-border">
      <dl className="grid grid-cols-3 divide-x divide-charcoal-border border-b border-charcoal-border">
        {stats.map(([label, value, unit]) => (
          <div key={label} className="px-3 py-2.5">
            <dt className="text-micro font-technical font-bold text-ink-faint">{label}</dt>
            <dd className="pt-0.5 font-technical text-body font-extrabold text-ink tabular-nums truncate">
              {value}
              {unit && <span className="ml-1 text-caption font-semibold text-ink-muted">{unit}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 min-h-[44px] text-left touch-manipulation"
      >
        <span className="text-xs font-bold text-ink">Summary</span>
        <span className="font-technical text-xs text-ink-muted">{open ? "Hide" : "By exercise"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 text-caption font-technical text-ink-muted">
          {summary.exercises.map((e) => (
            <div key={e.name} className="flex justify-between gap-3">
              <span className="text-ink truncate">{e.name}</span>
              <span className="tabular-nums text-right shrink-0">
                {e.best ? `${e.best.weight}×${e.best.reps}` : "--"}
                {e.e1rm != null && ` · e1RM ${Math.round(e.e1rm)}`}
                {e.delta != null && ` (${e.delta > 0 ? "+" : ""}${e.delta})`}
              </span>
            </div>
          ))}
          {summary.prs.length > 0 && (
            <div className="pt-1 border-t border-charcoal-border">
              {summary.prs.map((p) => (
                <div key={`${p.exercise}-${p.reps}`} className="flex justify-between gap-3">
                  <span className="truncate">PR · {p.exercise}</span>
                  <span className="tabular-nums shrink-0">
                    {p.weight} {weightUnit} × {p.reps} (was {p.previousWeight})
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
