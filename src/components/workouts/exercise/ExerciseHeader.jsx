import { useMemo } from "react";
import { createPortal } from "react-dom";
import { CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, MoreVertical, FileText, RefreshCw, X, TrendingUp, HelpCircle, Heart, GripVertical, Calculator } from "lucide-react";

// Extracted from ExerciseCard.jsx (no behavior change).
export default function ExerciseHeader({ dragHandleProps, editingName, exercise, exerciseIndex, hasPendingNotes, isProgramMode, liked, menuContentRef, menuRef, menuStyle, menuTriggerRef, onAddSet, onOpenCalculators, onRemoveExercise, onReplaceExercise, onRequestCancelWorkout, onToggleLike, onToggleReorderMode, onUpdateName, openMenu, progressionTargets, reorderMode, setEditingName, setEditingNotes, setOpenMenu, setShowCues, setShowReplaceDialog }) {
  return (
    <>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {editingName ? (
              <Input
                autoFocus
                value={exercise.name}
                onChange={(e) => onUpdateName(exerciseIndex, e.target.value)}
                onBlur={() => setEditingName(false)}
                onKeyDown={(e) => e.key === 'Enter' && setEditingName(false)}
                className="h-8 text-lg font-semibold"
              />
            ) : (
              // Ledger rebuild: the name is the only thing left in the header row
              // itself — one line, truncated, no stacked sub-blocks. Everything
              // that used to stack underneath it has a home elsewhere instead of
              // being deleted outright:
              //   - dbEntry type badge  -> dropped (decorative; program mode is
              //     already implied by the rest of the card).
              //   - Heart like/unlike   -> moved into the kebab menu below.
              //   - Program/Original targets -> fully duplicated by the vitals
              //     row's Target cell (see the `vitals` useMemo above, which
              //     already computes this exact primary/sub pair) — dropped here,
              //     not lost.
              //   - Last performance (weight x reps) -> already shown live on
              //     every set row via the Prev column and the +N up-delta badge;
              //     only the session DATE had no other home and is the one
              //     genuinely dropped field (minor — last-session recency, not a
              //     number the athlete logs against).
              // A page-level sticky name/meta/Finish row is Step 5 (this header
              // stays a plain in-card title until then).
              <CardTitle className="text-[17px] font-extrabold text-ink truncate">{exercise.name}</CardTitle>
            )}
          </div>
          <div className="flex items-center gap-1">
            {dragHandleProps && reorderMode && (
              <button
                type="button"
                {...dragHandleProps.attributes}
                {...dragHandleProps.listeners}
                aria-label="Drag to reorder exercise"
                className="h-11 w-11 -my-1 flex items-center justify-center text-ink-faint hover:text-ink touch-manipulation cursor-grab active:cursor-grabbing"
              >
                <GripVertical className="w-4 h-4" strokeWidth={2.5} />
              </button>
            )}
            <div className="relative" ref={menuRef}>
            <Button
              variant="ghost"
              size="icon"
              ref={menuTriggerRef}
              onClick={() => setOpenMenu(!openMenu)}
              className="relative"
              // Icon-only trigger had no accessible name at all (MoreVertical
              // carries no text) -- named to match the sibling drag handle's
              // own aria-label just above, and so the new r4f e2e specs have
              // a stable, semantic way to reach Cancel workout / Calculators.
              aria-label="Exercise options"
            >
              <MoreVertical className="w-5 h-5" />
              {/* Quiet signal that Notes & cues has something to say (a fresh
                  nudge, coaching chip, or an on-toggle shot note) without
                  putting any of that content in the main flow. */}
              {hasPendingNotes && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-brand" aria-hidden="true" />
              )}
            </Button>
            {openMenu && createPortal(
              <div
                ref={menuContentRef}
                style={menuStyle}
                className="fixed glass-elevated rounded-xl overflow-y-auto max-h-[min(60vh,320px)] overscroll-contain py-1 z-[10200] min-w-[160px] text-ink"
              >
                {/* Like/Unlike moved here from the header row (Ledger rebuild) —
                    it steers future programming, same behavior as before. */}
                {onToggleLike && (
                  <button
                    onClick={() => {
                      onToggleLike();
                      setOpenMenu(false);
                    }}
                    aria-pressed={liked}
                    className="w-full px-3 py-2 min-h-[44px] text-left text-sm font-semibold text-ink-secondary hover:bg-[var(--glass-edge)] flex items-center gap-2"
                  >
                    <Heart className={`w-4 h-4 ${liked ? "fill-brand text-brand" : ""}`} />
                    {liked ? "Unlike this exercise" : "Like — program this more often"}
                  </button>
                )}
                {/* Reorder toggle (Ledger rebuild): drag handles are hidden by
                    default on every row (focused card + compact .nx rows) —
                    they added visual weight (empty-looking grip icons) most
                    sessions never touch. Chosen here, WorkoutDetail flips
                    dragHandleProps on for every ExerciseCard until toggled off
                    again (or the athlete taps away — WorkoutDetail owns that). */}
                {onToggleReorderMode && (
                  <button
                    onClick={() => {
                      onToggleReorderMode();
                      setOpenMenu(false);
                    }}
                    className="w-full px-3 py-2 min-h-[44px] text-left text-sm font-semibold text-ink-secondary hover:bg-[var(--glass-edge)] flex items-center gap-2"
                  >
                    <GripVertical className="w-4 h-4" />
                    {reorderMode ? "Done reordering" : "Reorder exercises"}
                  </button>
                )}
                {/* Replace exercise leads the destructive/utility part of the menu:
                    a mid-session equipment swap (Casper day, machine taken) is a
                    routine workaround the athlete reaches for far more than
                    notes/cues, per the overnight audit's UX pass (wishes.json).
                    Destructive Remove stays anchored last regardless. */}
                {onReplaceExercise && (
                <button
                  onClick={() => {
                    setShowReplaceDialog(true);
                    setOpenMenu(false);
                  }}
                  className="w-full px-3 py-2 min-h-[44px] text-left text-sm font-semibold text-ink-secondary hover:bg-[var(--glass-edge)] flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Replace exercise
                </button>
                )}
                <button
                  onClick={() => {
                    setEditingNotes(true);
                    setOpenMenu(false);
                  }}
                  className="w-full px-3 py-2 min-h-[44px] text-left text-sm font-semibold text-ink-secondary hover:bg-[var(--glass-edge)] flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Add notes
                </button>
                <button
                  onClick={() => {
                    setShowCues(true);
                    setOpenMenu(false);
                  }}
                  className="w-full px-3 py-2 min-h-[44px] text-left text-sm font-semibold text-ink-secondary hover:bg-[var(--glass-edge)] flex items-center gap-2 relative"
                >
                  <HelpCircle className="w-4 h-4" />
                  Notes &amp; cues
                  {hasPendingNotes && (
                    <span className="absolute top-2 right-3 w-1.5 h-1.5 rounded-full bg-brand" aria-hidden="true" />
                  )}
                </button>
                {isProgramMode && (
                  <button
                    onClick={() => {
                      onAddSet(exerciseIndex, { set_type: 'daily_min', weight: progressionTargets?.dailyMin || 0 });
                      setOpenMenu(false);
                    }}
                    className="w-full px-3 py-2 min-h-[44px] text-left text-sm font-semibold text-ink-secondary hover:bg-[var(--glass-edge)] flex items-center gap-2"
                  >
                    <TrendingUp className="w-4 h-4" />
                    Add daily min set
                  </button>
                )}
                <button
                  onClick={() => {
                    onRemoveExercise(exerciseIndex);
                    setOpenMenu(false);
                  }}
                  className="w-full px-3 py-2 min-h-[44px] text-left text-sm font-semibold text-bad hover:bg-bad/10 flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Remove exercise
                </button>
                {onOpenCalculators && (
                  <button
                    onClick={() => {
                      onOpenCalculators();
                      setOpenMenu(false);
                    }}
                    className="w-full px-3 py-2 min-h-[44px] text-left text-sm font-semibold text-ink-secondary hover:bg-[var(--glass-edge)] flex items-center gap-2 border-t border-charcoal-border mt-1 pt-2"
                  >
                    <Calculator className="w-4 h-4" />
                    Calculators
                  </button>
                )}
                {onRequestCancelWorkout && (
                  <button
                    onClick={() => {
                      onRequestCancelWorkout();
                      setOpenMenu(false);
                    }}
                    className="w-full px-3 py-2 min-h-[44px] text-left text-sm font-semibold text-bad hover:bg-bad/10 flex items-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    Cancel workout
                  </button>
                )}
              </div>,
              document.body
            )}
            </div>
          </div>
        </div>
    </>
  );
}
