import { Link } from "react-router-dom";
import { Badge, Card, Stat, cn } from "@/components/ui";
import { ChevronRight } from "lucide-react";

const GOAL_LABELS = {
  muscle_gain: "Muscle Gain",
  fat_loss: "Fat Loss",
  strength: "Strength",
  endurance: "Endurance",
  general: "General Fitness",
};

const MAX_TAGS = 3;

// Tags arrive as raw lowercase kebab strings (e.g. 'upper-body'). Humanize them
// into Title Case so they read as labels, consistent with GOAL_LABELS.
const humanizeTag = (tag) =>
  String(tag)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

export default function ProgramCard({ program, enrollment, inActiveTab }) {
  const isActive = enrollment?.status === "active";
  const cycleLength = program.cycle_length || program.days_per_week || 7;
  const numCycles = program.num_cycles || program.duration_weeks || 4;
  const completedCount = enrollment?.completed_workouts?.length || 0;
  const totalWorkouts = cycleLength * numCycles;
  const progressPercent = totalWorkouts > 0 ? Math.round((completedCount / totalWorkouts) * 100) : 0;

  const durationLabel = `${cycleLength}-day cycle`;
  const frequencyLabel = `${numCycles} cycle${numCycles !== 1 ? "s" : ""}`;
  const positionLabel = enrollment
    ? `C${enrollment.current_cycle || enrollment.current_week || 1} · D${enrollment.current_day_index || enrollment.current_day || 1}`
    : null;

  // Drop the redundant goal badge when tags already convey the program's focus.
  const tags = program.tags || [];
  const hasTags = tags.length > 0;
  const goalLabel = program.focus || program.goal;
  const showGoalBadge = goalLabel && !hasTags;
  const visibleTags = tags.slice(0, MAX_TAGS);
  const overflowTags = tags.length - visibleTags.length;

  // The in-flight program already declares itself via the 'C·D' position chip
  // on the progress line, so the separate 'Active' badge is redundant there
  // (and inside the Active tab, where every card is active). Show it only when
  // there's no position chip and the parent hasn't flagged the active context.
  const showActiveBadge = isActive && !positionLabel && inActiveTab !== true;

  return (
    <Link to={`/program/${program.id}`} className="block active:scale-[0.985] transition-transform duration-fast ease-out">
      <Card className="relative">
        <ChevronRight className="pointer-events-none absolute top-4 right-4 h-5 w-5 text-ink-muted" aria-hidden="true" />
        <div className="p-4 pr-12 flex flex-col gap-3">
          {(showGoalBadge || showActiveBadge) && (
            <div className="flex flex-wrap items-center gap-2">
              {showGoalBadge && <Badge variant="outline">{GOAL_LABELS[goalLabel] || goalLabel}</Badge>}
              {showActiveBadge && <Badge variant="outline" className="ml-auto">Active</Badge>}
            </div>
          )}

          <div>
            <h3 className="text-title text-ink">{program.title || program.name}</h3>
            {program.description && (
              <p className="mt-1 text-caption text-ink-muted line-clamp-2">{program.description}</p>
            )}
          </div>

          {enrollment ? (
            <>
              <div className="h-1 bg-track rounded-pill overflow-hidden">
                <div
                  className={cn("h-full rounded-pill transition-[width] duration-slow ease-out", isActive ? "bg-brand" : "bg-ink-faint/40")}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex items-center gap-3 tabular-nums text-caption text-ink-muted">
                <span><span className="text-emph text-ink font-numeral">{completedCount}</span> / {totalWorkouts} sessions</span>
                {isActive && positionLabel && (
                  <span className="ml-auto text-ink">{positionLabel}</span>
                )}
              </div>
            </>
          ) : (
            <div className="flex gap-4">
              <Stat size="sm" label="Cycle" value={durationLabel} />
              <Stat size="sm" label="Length" value={frequencyLabel} />
            </div>
          )}

          {hasTags && (
            <div className="flex flex-wrap gap-1">
              {visibleTags.map((tag) => (
                <Badge key={tag} variant="outline">{humanizeTag(tag)}</Badge>
              ))}
              {overflowTags > 0 && (
                <span className="self-center px-1 text-caption tabular-nums text-ink-faint">+{overflowTags}</span>
              )}
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}
