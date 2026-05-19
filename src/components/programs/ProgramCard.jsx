import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { DIFFICULTY_COLORS, DIFFICULTY_LEVELS } from "@/lib/constants";
import { motion } from "framer-motion";

const GOAL_LABELS = {
  muscle_gain: "Muscle Gain",
  fat_loss: "Fat Loss",
  strength: "Strength",
  endurance: "Endurance",
  general: "General Fitness",
};

const DIFFICULTY_LABELS = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
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
        <div
          className="group relative overflow-hidden rounded-xl border-l-4 bg-[#1a1a1a] border border-[#2a2a2a] hover:bg-[#242424] transition-all duration-200 cursor-pointer"
          style={{ borderLeftColor: 'var(--color-brand)' }}
        >
          <div className="px-5 pt-4 pb-2">
            {/* Badges */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {program.difficulty && (
                <Badge className={DIFFICULTY_COLORS[program.difficulty]}>
                  {DIFFICULTY_LABELS[program.difficulty] || program.difficulty}
                </Badge>
              )}
              {program.goal && (
                <Badge variant="outline">{GOAL_LABELS[program.goal] || program.goal}</Badge>
              )}
              {enrollment?.status === 'active' && (
                <Badge variant="green" className="ml-auto">Active</Badge>
              )}
            </div>

            <h3 className="text-base font-bold text-white group-hover:text-brand transition-colors mb-1">
              {program.name}
            </h3>
            {program.description && (
              <p className="text-xs text-[#555555] line-clamp-2 mb-3">{program.description}</p>
            )}

            {/* Progress bar */}
            {enrollment && (
              <div className="h-1 bg-[#202020] rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-brand rounded-full"
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
                  <span className="text-xs font-bold uppercase tracking-widest text-[#a0a0a0]">Progress</span>
                  <span className="text-lg font-bold tabular-nums text-white mt-0.5">{progressPercent}%</span>
                </div>
                <div className="flex-1 flex flex-col border-l border-[#2a2a2a] pl-4">
                  <span className="text-xs font-bold uppercase tracking-widest text-[#a0a0a0]">{positionLabel ? 'Position' : 'Cycle'}</span>
                  <span className="text-lg font-bold tabular-nums text-white mt-0.5">{positionLabel || `${frequencyLabel}`}</span>
                </div>
                <div className="flex-1 flex flex-col border-l border-[#2a2a2a] pl-4">
                  <span className="text-xs font-bold uppercase tracking-widest text-[#a0a0a0]">Sessions</span>
                  <span className="text-lg font-bold tabular-nums text-white mt-0.5">{completedCount} / {totalWorkouts}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex-1 flex flex-col">
                  <span className="text-xs font-bold uppercase tracking-widest text-[#a0a0a0]">Cycle</span>
                  <span className="text-lg font-bold tabular-nums text-white mt-0.5">{durationLabel}</span>
                </div>
                <div className="flex-1 flex flex-col border-l border-[#2a2a2a] pl-4">
                  <span className="text-xs font-bold uppercase tracking-widest text-[#a0a0a0]">Length</span>
                  <span className="text-lg font-bold tabular-nums text-white mt-0.5">{frequencyLabel}</span>
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
