import { useDroppable } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, PlayCircle, Activity } from "lucide-react";
import { addDays, format, parseISO } from "date-fns";

/**
 * Cycle-based day grid for v2 programs.
 *
 * Edit mode: single row of day slots as droppable targets (ProgramBuilder).
 * View mode: numCycles rows × cycleLength columns with progress tracking (ProgramDetail).
 */
export default function CycleDayGrid({
  workouts = [],
  cycleLength,
  numCycles = 1,
  enrollment,
  compact = false,
  onCellClick,
  mode = "view", // "view" | "edit"
  onClearDay,
}) {
  // Build lookup: day_index → workout
  const workoutMap = {};
  for (const w of workouts) {
    if (w.day_index != null) workoutMap[w.day_index] = w;
  }

  // Completed set keyed by "cycle-dayIndex" so each cycle's instances are independent.
  // Falls back to program_workout_id for legacy entries that lack cycle info.
  const completedSet = new Set();
  if (enrollment?.completed_workouts) {
    for (const cw of enrollment.completed_workouts) {
      if (cw?.skipped) continue;
      if (cw?.cycle && cw?.day_index) {
        completedSet.add(`${cw.cycle}-${cw.day_index}`);
      } else if (cw?.program_workout_id) {
        completedSet.add(cw.program_workout_id);
      } else if (typeof cw === 'string') {
        completedSet.add(cw);
      }
    }
  }

  const currentCycle = enrollment?.current_cycle || 0;
  const currentDayIndex = enrollment?.current_day_index || 0;
  const startDateRaw = enrollment?.started_at || enrollment?.start_date;
  const startDate = startDateRaw ? parseISO(String(startDateRaw).slice(0, 10)) : null;

  // View mode: cap at 4 columns so each day cell stays legible at 390px
  // (a full 7-wide row crushes cells to ~40px). 7-day = 4+3, 8-day = 4+4, etc.
  const colsPerRow = Math.min(4, cycleLength);
  // Edit mode: max 4 columns so cards stay readable; 8-day = 4+4, 7-day = 4+3, etc.
  const editColsPerRow = Math.min(4, cycleLength);

  if (mode === "edit") {
    return <EditGrid workouts={workoutMap} cycleLength={cycleLength} colsPerRow={editColsPerRow} onCellClick={onCellClick} onClearDay={onClearDay} />;
  }

  // View mode: show all cycles
  return (
    <div className="space-y-4">
      {Array.from({ length: numCycles }, (_, cycleIdx) => {
        const cycle = cycleIdx + 1;
        const daySlots = Array.from({ length: cycleLength }, (_, i) => i + 1);
        const rows = [];
        for (let i = 0; i < daySlots.length; i += colsPerRow) {
          rows.push(daySlots.slice(i, i + colsPerRow));
        }

        return (
          <div key={cycle}>
            {!compact && (
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    cycle === currentCycle
                      ? "bg-brand/15 text-brandTint"
                      : "bg-white/[0.06] text-ink-muted border border-white/10"
                  }`}
                >
                  Cycle {cycle}
                </span>
              </div>
            )}

            {rows.map((row, rowIdx) => (
              <div
                key={rowIdx}
                className="grid gap-2 mb-2"
                style={{ gridTemplateColumns: `repeat(${row.length}, 1fr)` }}
              >
                {row.map((dayIndex) => {
                  const workout = workoutMap[dayIndex];
                  const isCompleted = workout && (
                    completedSet.has(`${cycle}-${dayIndex}`) ||
                    completedSet.has(workout.id)
                  );
                  const isCurrent = cycle === currentCycle && dayIndex === currentDayIndex && enrollment?.status === "active";
                  const isPast = enrollment && (cycle < currentCycle || (cycle === currentCycle && dayIndex < currentDayIndex));

                  const calendarDate = startDate
                    ? addDays(startDate, (cycleIdx * cycleLength) + dayIndex - 1)
                    : null;

                  let cellClasses = "rounded-lg border-[0.5px] p-2 text-left transition-all duration-200 min-h-[60px] min-w-0 overflow-hidden ";
                  if (isCompleted) {
                    cellClasses += " border-leaf/20 bg-leaf/[0.08]";
                  } else if (isCurrent) {
                    cellClasses += " border-brand ring-2 ring-brand/30 bg-brand/[5%]";
                  } else if (isPast) {
                    cellClasses += " border-white/[0.06] bg-white/[0.02] opacity-60";
                  } else {
                    cellClasses += " glass-inset border-white/[0.06] hover:bg-white/[0.06]";
                  }
                  if (onCellClick) cellClasses += " cursor-pointer ";

                  const labelClass = isCompleted
                    ? "text-xs font-medium line-clamp-2 leading-tight text-leaf"
                    : isCurrent
                    ? "text-xs font-medium line-clamp-2 leading-tight text-brand"
                    : "text-xs font-medium line-clamp-2 leading-tight text-ink-muted";

                  const hasCardio = workout?.cardio_sessions?.length > 0;

                  const cellStatus = isCompleted
                    ? "completed"
                    : isCurrent
                    ? "current"
                    : isPast
                    ? "past"
                    : "upcoming";

                  return (
                    <button
                      key={dayIndex}
                      onClick={() => onCellClick?.(workout, cycle, dayIndex)}
                      disabled={!onCellClick}
                      aria-label={`Cycle ${cycle}, Day ${dayIndex}: ${workout?.title || "Rest"} — ${cellStatus}`}
                      className={cellClasses}
                    >
                      {calendarDate && !compact && (
                        <p className="hidden sm:block text-xs text-ink-muted mb-0.5">
                          {format(calendarDate, "MMM d")}
                        </p>
                      )}
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-ink-muted">Day {dayIndex}</p>
                          <span className={labelClass}>
                            {workout?.title || "Rest"}
                          </span>
                        </div>
                        {isCompleted ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-leaf flex-shrink-0" />
                        ) : isCurrent ? (
                          <PlayCircle className="w-3.5 h-3.5 text-brand flex-shrink-0 animate-pulse" />
                        ) : workout ? (
                          <Circle className="w-3.5 h-3.5 text-ink-muted flex-shrink-0" />
                        ) : null}
                      </div>
                      {!compact && (workout?.focus || workout?.type) && (
                        <p className="sm:hidden text-xs text-ink-muted mt-1 capitalize line-clamp-1">
                          {workout.focus || workout.type}
                        </p>
                      )}
                      {!compact && workout?.exercises?.length > 0 && (
                        <p className="hidden sm:block text-xs text-ink-muted mt-1">
                          {workout.exercises.length} exercises
                        </p>
                      )}
                      {!compact && hasCardio && (
                        <div className="flex flex-wrap gap-0.5 mt-1">
                          {workout.cardio_sessions.map((c, i) => (
                            <span key={i} className="inline-flex items-center gap-0.5 text-xs bg-carb/[0.14] text-carb px-1.5 py-0.5 rounded-full font-medium">
                              <Activity className="w-2.5 h-2.5" />
                              {c.title}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Edit mode grid — each cell is a droppable target */
function EditGrid({ workouts, cycleLength, colsPerRow, onCellClick, onClearDay }) {
  const daySlots = Array.from({ length: cycleLength }, (_, i) => i + 1);
  const rows = [];
  for (let i = 0; i < daySlots.length; i += colsPerRow) {
    rows.push(daySlots.slice(i, i + colsPerRow));
  }

  return (
    <div className="space-y-2">
      {rows.map((row, rowIdx) => (
        <div
          key={rowIdx}
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${row.length}, 1fr)` }}
        >
          {row.map((dayIndex) => (
            <DroppableDaySlot
              key={dayIndex}
              dayIndex={dayIndex}
              workout={workouts[dayIndex]}
              onCellClick={onCellClick}
              onClearDay={onClearDay}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function DroppableDaySlot({ dayIndex, workout, onCellClick, onClearDay }) {
  const { isOver, setNodeRef } = useDroppable({ id: `day-${dayIndex}` });

  const hasExercises = workout?.exercises?.length > 0;
  const hasCardio = workout?.cardio_sessions?.length > 0;
  const hasWorkout = hasExercises || hasCardio;
  const isHighLoad = hasExercises && hasCardio;

  return (
    <div
      ref={setNodeRef}
      onClick={() => onCellClick?.(workout, 1, dayIndex)}
      className={`rounded-xl border-2 border-dashed p-3 min-h-[100px] min-w-0 overflow-hidden transition-all duration-200 cursor-pointer ${
        isOver
          ? "border-brand bg-brand/[5%] scale-[1.02]"
          : hasWorkout
          ? "border-solid border-white/10 bg-white/[0.04] hover:border-brand/30"
          : "border-white/10 bg-white/[0.02] hover:border-brand/30 hover:bg-white/[0.04]"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-ink-muted flex items-center gap-1">
          Day {dayIndex}
          {isHighLoad && <span className="w-1.5 h-1.5 rounded-full bg-brand inline-block" title="High-load day" />}
        </span>
        {hasWorkout && onClearDay && (
          <button
            onClick={(e) => { e.stopPropagation(); onClearDay(dayIndex); }}
            className="text-xs text-ink-muted hover:text-bad transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {hasWorkout ? (
        <div>
          <p className="text-sm font-medium text-ink leading-snug line-clamp-2 mb-1">{workout.title}</p>
          {hasExercises && (
            <p className="text-xs text-ink-muted">{workout.exercises.length} exercises</p>
          )}
          {workout.focus && (
            <Badge variant="outline" className="text-xs mt-1 capitalize">{workout.focus}</Badge>
          )}
          {hasCardio && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {workout.cardio_sessions.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-0.5 text-xs bg-carb/[0.14] text-carb px-1.5 py-0.5 rounded-full font-medium leading-tight">
                  <Activity className="w-2.5 h-2.5 shrink-0" />
                  <span className="line-clamp-1">{c.title}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-12 text-ink-muted">
          {isOver ? (
            <p className="text-xs font-medium text-brand">Drop here</p>
          ) : (
            <>
              <p className="text-sm font-medium text-ink-muted">Rest</p>
              <p className="text-xs mt-0.5">Click or drop to add</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
