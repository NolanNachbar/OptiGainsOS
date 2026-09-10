import { Link } from "react-router-dom";
import { Flag, ChevronRight } from "lucide-react";
import { useEnrollments } from "@/hooks/useProgramQueries";
import { Button } from "@/components/ui/button";

// Days after the last block ended before the nudge gets a warning tint. A day or
// two between blocks is a deload, not a lapse; a fortnight is drift.
const DRIFT_DAYS = 5;

const daysSince = (iso) => {
  if (!iso) return null;
  const then = new Date(iso);
  if (!Number.isFinite(then.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - then.getTime()) / 86400000));
};

/**
 * "Your program finished. Pick the next one."
 *
 * Nothing in the app said this. A v2 enrollment flips itself to `completed` on
 * the last workout of the last cycle (useProgramQueries.js), silently, one
 * second after the log lands — and from then on the Weekly Schedule just stops
 * getting new days, because the generator has no enrollment to anchor to. The
 * only signal that a block had ended was the engine cron failing every morning,
 * which is not a place he looks.
 *
 * Deliberately not self-healing: enrolling in the next block is a training
 * decision, so this states the situation and hands him the two doors. It does
 * not pick one.
 */
export default function ProgramCompleteCard({ className = "" }) {
  const { enrollments, isLoading } = useEnrollments();
  if (isLoading) return null;

  // A paused program is a deliberate hold, not a gap — it has its own resume
  // path on the program page and does not need chasing here.
  if (enrollments.some((e) => e.status === "active" || e.status === "paused")) return null;

  const finished = enrollments
    .filter((e) => e.status === "completed")
    .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))[0];

  // Never enrolled in anything. That is a first-run state, not a lapsed one, and
  // the Programs tab already reads as the place to start.
  if (!finished) return null;

  const gap = daysSince(finished.updated_at);
  const drifting = gap != null && gap >= DRIFT_DAYS;
  const title = finished.program?.title || "Your program";

  return (
    <div className={`glass overflow-hidden ${className}`}>
      <div className="px-4 sm:px-5 py-4 flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            drifting ? "bg-[rgb(var(--warn-rgb)/0.14)] text-warn" : "bg-[var(--glass-inset-bg)] text-secondary"
          }`}
        >
          <Flag className="h-[18px] w-[18px]" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="type-display text-[17px] sm:text-[18px]">Program complete</h3>
          <p className="mt-1 text-[12.5px] font-semibold text-secondary">
            {title} finished
            {gap == null ? "" : gap === 0 ? " today" : gap === 1 ? " yesterday" : `, ${gap} days ago`}.
          </p>
          <p className={`mt-1 text-[12px] font-semibold ${drifting ? "text-warn" : "text-muted-2"}`}>
            The weekly schedule stops filling in until you start the next block.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="volt" size="lg" asChild>
              <Link to="/train?tab=programs" className="inline-flex min-h-[44px] items-center gap-1">
                Start the next block
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            {finished.program_id && (
              <Link
                to={`/program/${finished.program_id}`}
                className="inline-flex min-h-[44px] items-center px-3 text-[12.5px] font-semibold text-ink-muted transition-colors duration-200 hover:text-ink [transition-timing-function:var(--ease)]"
              >
                Run {title} again
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
