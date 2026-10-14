import { useMemo, useState } from "react";
import { buildFinishSummary } from "@/utils/finishSummary";

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

  return (
    <div className="rounded-xl border border-charcoal-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 min-h-[44px] text-left touch-manipulation"
      >
        <span className="text-xs font-bold text-ink">Summary</span>
        <span className="font-technical text-xs text-ink-muted tabular-nums">
          {summary.volume.toLocaleString()} {weightUnit}
          {summary.prs.length > 0 ? ` · ${summary.prs.length} PR${summary.prs.length === 1 ? "" : "s"}` : ""}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 text-[11px] font-technical text-ink-muted">
          {summary.exercises.map((e) => (
            <div key={e.name} className="flex justify-between gap-3">
              <span className="text-ink truncate">{e.name}</span>
              <span className="tabular-nums text-right shrink-0">
                {e.best ? `${e.best.weight}×${e.best.reps}` : "—"}
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
