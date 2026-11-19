import { Check, GripVertical } from "lucide-react";

// Extracted from ExerciseCard.jsx (no behavior change).
export default function ExerciseCollapsedRow({ doneCount, dragHandleProps, exercise, exerciseIndex, isDone, isLastRow, lastTimeText, onFocus, reorderMode, targetText, totalCount }) {
  return (
    <>
      <button
        type="button"
        onClick={() => onFocus?.()}
        data-testid={`exercise-row-${exerciseIndex}`}
        className={`w-full min-h-[48px] flex items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-charcoal-borderSoft/30 ${
          isLastRow ? "" : "border-b border-charcoal-border"
        }`}
      >
        {dragHandleProps && reorderMode && (
          <span
            role="button"
            tabIndex={-1}
            aria-hidden="true"
            className="touch-none text-ink-faint flex-shrink-0 -ml-1"
            {...dragHandleProps.attributes}
            {...dragHandleProps.listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-4 h-4" strokeWidth={2.5} />
          </span>
        )}
        {isDone && (
          <Check className="w-3.5 h-3.5 text-up flex-shrink-0" strokeWidth={3} />
        )}
        <span className={`flex-1 min-w-0 truncate text-body font-semibold ${isDone ? "text-ink-muted" : "text-ink"}`}>
          {exercise.name}
        </span>
        {/* Two right-side columns on one line: target (muted) and last time
            (full contrast, "–" when there's none). Previously "last time"
            was hidden below the `sm:` breakpoint, so on the 428px logging
            viewport the Next list only ever showed the target column and
            read as if it were showing last-time values (coordinator, r4f). */}
        {isDone ? (
          <span className="flex-shrink-0 font-technical text-caption text-ink-faint tabular-nums">
            {doneCount}/{targetText || totalCount}
          </span>
        ) : (
          targetText && (
            <span className="flex-shrink-0 font-technical text-caption text-ink-faint tabular-nums">
              {targetText}
            </span>
          )
        )}
        <span className="flex-shrink-0 font-technical text-caption text-ink-secondary tabular-nums">
          {lastTimeText || "–"}
        </span>
      </button>
    </>
  );
}
