import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";

const GOAL_LABELS = {
  muscle_gain: "Muscle Gain",
  fat_loss: "Fat Loss",
  strength: "Strength",
  endurance: "Endurance",
  general: "General Fitness",
};

const MAX_TAGS = 3;

export default function ProgramCard({ program, enrollment }) {
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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0.7, 0.3, 1] }}
    >
      <Link to={`/program/${program.id}`}>
        <div className="group relative overflow-hidden glass glass-interactive cursor-pointer transition-transform active:scale-[0.985] active:bg-white/[0.07]">
          {/* Trailing affordance — coral-free directional cue. */}
          <ChevronRight
            className="pointer-events-none absolute top-4 right-4 h-5 w-5 text-ink-faint transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
          <div className="px-5 pt-4 pb-2 pr-12">
            {/* Badges — one chip vocabulary (outline). */}
            {(showGoalBadge || enrollment?.status === 'active') && (
              <div className="flex flex-wrap items-center gap-1.5 mb-3">
                {showGoalBadge && (
                  <Badge variant="outline">{GOAL_LABELS[goalLabel] || goalLabel}</Badge>
                )}
                {enrollment?.status === 'active' && (
                  <Badge variant="outline" className="ml-auto">Active</Badge>
                )}
              </div>
            )}

            <h3 className="text-base font-bold text-ink mb-1">
              {program.title || program.name}
            </h3>
            {program.description && (
              <p className="text-xs text-ink-muted line-clamp-2 mb-3">{program.description}</p>
            )}

            {/* Progress bar — neutral viz hue; leaf is reserved for done states. */}
            {enrollment && (
              <div className="h-1 bg-track rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-viz-1 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="flex px-5 pb-4">
            {enrollment ? (
              <>
                <div className="flex-1 flex flex-col">
                  <span className="section-label">Progress</span>
                  <span className="font-technical text-lg font-bold text-ink mt-0.5">{progressPercent}%</span>
                </div>
                <div className="flex-1 flex flex-col border-l hairline pl-4">
                  <span className="section-label">{positionLabel ? 'Position' : 'Cycle'}</span>
                  <span className="font-technical text-lg font-bold text-ink mt-0.5 whitespace-nowrap">{positionLabel || `${frequencyLabel}`}</span>
                </div>
                <div className="flex-1 flex flex-col border-l hairline pl-4">
                  <span className="section-label">Sessions</span>
                  <span className="font-technical text-lg font-bold text-ink mt-0.5">{completedCount} / {totalWorkouts}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex-1 flex flex-col">
                  <span className="section-label">Cycle</span>
                  <span className="font-technical text-lg font-bold text-ink mt-0.5">{durationLabel}</span>
                </div>
                <div className="flex-1 flex flex-col border-l hairline pl-4">
                  <span className="section-label">Length</span>
                  <span className="font-technical text-lg font-bold text-ink mt-0.5">{frequencyLabel}</span>
                </div>
              </>
            )}
          </div>

          {/* Tags — capped at MAX_TAGS + overflow count, one chip vocabulary. */}
          {hasTags && (
            <div className="flex flex-wrap gap-1 px-5 pb-4">
              {visibleTags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
              ))}
              {overflowTags > 0 && (
                <Badge variant="outline" className="text-xs font-technical">+{overflowTags}</Badge>
              )}
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
