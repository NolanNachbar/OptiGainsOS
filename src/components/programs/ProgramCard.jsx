import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";

const RISE = ["rise-in", "rise-in-2", "rise-in-3"];

const GOAL_LABELS = {
  muscle_gain: "Muscle Gain",
  fat_loss: "Fat Loss",
  strength: "Strength",
  endurance: "Endurance",
  general: "General Fitness",
};

const MAX_TAGS = 3;

export default function ProgramCard({ program, enrollment, index = 0 }) {
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

  return (
    <div className={RISE[index % 3]}>
      <Link to={`/program/${program.id}`}>
        <div className="group relative overflow-hidden glass glass-interactive cursor-pointer transition-transform active:scale-[0.985] active:bg-white/[0.07]">
          {/* Trailing affordance — coral-free directional cue. */}
          <ChevronRight
            className="pointer-events-none absolute top-4 right-4 h-5 w-5 text-ink-muted transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
          {/* Single content padding wrapper — no ad-hoc per-block padding. */}
          <div className="p-5 pr-12 space-y-3">
            {/* Badges — one chip vocabulary (outline). */}
            {(showGoalBadge || isActive) && (
              <div className="flex flex-wrap items-center gap-1.5">
                {showGoalBadge && (
                  <Badge variant="outline">{GOAL_LABELS[goalLabel] || goalLabel}</Badge>
                )}
                {isActive && (
                  <Badge variant="outline" className="ml-auto">Active</Badge>
                )}
              </div>
            )}

            <div>
              <h3 className="text-base font-bold text-ink mb-1">
                {program.title || program.name}
              </h3>
              {program.description && (
                <p className="text-xs text-ink-muted line-clamp-1">{program.description}</p>
              )}
            </div>

            {enrollment ? (
              <>
                {/* Compact progress line — bar + one figure, no PROGRESS/SESSIONS
                    duplication. Active keeps the live viz hue; past programs
                    drop to a muted track so the active card holds primacy. */}
                <div className="h-1 bg-track rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${isActive ? "bg-viz-1" : "bg-ink-faint/40"}`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex items-center gap-3 font-technical text-xs text-ink-muted">
                  <span className="text-ink font-bold">{progressPercent}%</span>
                  <span>{completedCount} / {totalWorkouts} sessions</span>
                  {/* Position is only meaningful for the in-flight program. */}
                  {isActive && positionLabel && (
                    <span className="ml-auto text-ink-muted">{positionLabel}</span>
                  )}
                </div>
              </>
            ) : (
              <div className="flex">
                <div className="flex-1 flex flex-col">
                  <span className="section-label">Cycle</span>
                  <span className="font-technical text-lg font-bold text-ink mt-0.5">{durationLabel}</span>
                </div>
                <div className="flex-1 flex flex-col border-l hairline pl-4">
                  <span className="section-label">Length</span>
                  <span className="font-technical text-lg font-bold text-ink mt-0.5">{frequencyLabel}</span>
                </div>
              </div>
            )}

            {/* Tags — capped at MAX_TAGS + overflow count, one chip vocabulary. */}
            {hasTags && (
              <div className="flex flex-wrap gap-1">
                {visibleTags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                ))}
                {overflowTags > 0 && (
                  <Badge variant="outline" className="text-xs font-technical">+{overflowTags}</Badge>
                )}
              </div>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}
