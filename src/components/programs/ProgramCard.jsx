import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

const GOAL_LABELS = {
  muscle_gain: "Muscle Gain",
  fat_loss: "Fat Loss",
  strength: "Strength",
  endurance: "Endurance",
  general: "General Fitness",
};


export default function ProgramCard({ program, enrollment }) {
  const cycleLength = program.cycle_length || program.days_per_week || 7;
  const numCycles = program.num_cycles || program.duration_weeks || 4;
  const completedCount = enrollment?.completed_workouts?.length || 0;
  const totalWorkouts = cycleLength * numCycles;
  const progressPercent = totalWorkouts > 0 ? Math.round((completedCount / totalWorkouts) * 100) : 0;

  const durationLabel = `${cycleLength}-day cycle`;
  const frequencyLabel = `${numCycles} cycle${numCycles !== 1 ? "s" : ""}`;
  const positionLabel = enrollment
    ? `Cycle ${enrollment.current_cycle || enrollment.current_week || 1}, Day ${enrollment.current_day_index || enrollment.current_day || 1}`
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Link to={`/program/${program.id}`}>
        <div className="group relative overflow-hidden glass glass-interactive cursor-pointer">
          <div className="px-5 pt-4 pb-2">
            {/* Badges */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {(program.focus || program.goal) && (
                <Badge variant="outline">{GOAL_LABELS[program.focus || program.goal] || program.focus || program.goal}</Badge>
              )}
              {enrollment?.status === 'active' && (
                <Badge variant="outline" className="ml-auto bg-teal/10 text-teal border-teal/25">Active</Badge>
              )}
            </div>

            <h3 className="text-base font-bold text-ink mb-1">
              {program.title || program.name}
            </h3>
            {program.description && (
              <p className="text-xs text-ink-muted line-clamp-2 mb-3">{program.description}</p>
            )}

            {/* Progress bar */}
            {enrollment && (
              <div className="h-1 bg-white/[0.08] rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-teal rounded-full"
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
                  <span className="font-technical text-lg font-bold text-teal mt-0.5">{progressPercent}%</span>
                </div>
                <div className="flex-1 flex flex-col border-l hairline pl-4">
                  <span className="section-label">{positionLabel ? 'Position' : 'Cycle'}</span>
                  <span className="font-technical text-lg font-bold text-ink mt-0.5">{positionLabel || `${frequencyLabel}`}</span>
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

          {/* Tags */}
          {program.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 px-5 pb-4">
              {program.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
              ))}
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
