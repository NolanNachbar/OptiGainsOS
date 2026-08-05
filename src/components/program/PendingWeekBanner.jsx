import { usePendingProgramWeek, useApprovePendingProgramWeek } from "@/hooks/useProgramQueries";

/**
 * "A new week is staged but not live."
 *
 * The weekly engine writes to program_workouts_pending and leaves last week's
 * sessions carried forward in program_workouts until Nolan approves (his call,
 * 2026-07-27). program_workouts is what the Schedule tab renders AND what the
 * daily prescriber pins Today's exercises to, so an unapproved week means both
 * views are showing last week's session in agreement — correct, but easy to read
 * as the engine ignoring a change he just made.
 *
 * The approve action used to live only on ProgramDetail, which is not a page he
 * opens daily, so the staleness was silent. This puts it on the two screens he
 * actually looks at. Renders nothing when there's no pending week.
 */
export default function PendingWeekBanner({ programId, className = "" }) {
  const { pending } = usePendingProgramWeek(programId);
  const approve = useApprovePendingProgramWeek(programId);
  const days = (pending?.rows || []).filter((r) => (r.exercises || []).length > 0).length;
  if (!days) return null;

  return (
    <div className={`glass px-3.5 py-3 rise-in border-[0.5px] border-brand/30 ${className}`}>
      <p className="section-label mb-1">New plan ready</p>
      <p className="text-xs text-muted-2 mb-2.5">
        {days} training day{days === 1 ? "" : "s"} generated for the week of {pending.week_start}.
        Until you approve it, these dates are still running last week&apos;s sessions.
      </p>
      <button
        type="button"
        onClick={() => approve.mutate(pending.rows)}
        disabled={approve.isPending}
        className="cta-action w-full text-xs"
      >
        {approve.isPending ? "Applying…" : "Approve & load this week"}
      </button>
    </div>
  );
}
