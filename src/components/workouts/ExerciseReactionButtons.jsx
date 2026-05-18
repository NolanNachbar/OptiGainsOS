import { useState } from "react";
import { ThumbsUp, ThumbsDown, ChevronRight, Pencil, Check, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getExerciseReplacements } from "@/ml/mlRecommender";
import { useExerciseReactions } from "@/hooks/useExerciseReactions";

export default function ExerciseReactionButtons({
  exerciseName,
  onReactionChange,
  onReplaceExercise,
  exercise,
  dayFocus,
  goal,
  level,
  equipment = [],
  currentWeekExerciseNames = [],
  size = "sm",
}) {
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [alternatives, setAlternatives] = useState(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualExercise, setManualExercise] = useState("");

  const { getReaction, toggleReaction } = useExerciseReactions();
  const currentReaction = getReaction(exerciseName);

  const isLiked    = currentReaction === "like";
  const isDisliked = currentReaction === "dislike";

  function handleLike() {
    toggleReaction({ exerciseName, reaction: "like" });
    onReactionChange?.(exerciseName, "like");
  }

  function handleDislike() {
    // Already disliked → toggle off
    if (isDisliked) {
      toggleReaction({ exerciseName, reaction: "dislike" });
      onReactionChange?.(exerciseName, "dislike");
      return;
    }
    // Use ML recommender — automatically falls back to rule-based if model not ready
    const alts = getExerciseReplacements({
      dislikedName: exerciseName,
      userProfile: { goal, level, equipment },
      dayFocus,
      currentWeekExerciseNames,
      // Legacy params passed through for fallback compatibility
      goal,
      level,
      equipment,
    });
    setAlternatives(alts);
    setManualMode(false);
    setManualExercise("");
    setShowAlternatives(true);
  }

  function handlePickAlternative(newExercise) {
    if (onReplaceExercise && newExercise) {
      onReplaceExercise(exerciseName, newExercise);
    }
    setShowAlternatives(false);
    setManualMode(false);
  }

  function handleManualReplace() {
    if (!manualExercise.trim()) return;
    handlePickAlternative({
      name: manualExercise.trim(),
      sets: exercise?.sets || 3,
      reps: exercise?.reps || "10",
      rest: exercise?.rest || 60,
      pattern: "",
      primaryMuscle: [],
      difficulty: 2,
    });
  }

  function difficultyLabel(diff) {
    if (diff <= 1) return { label: "Beginner",     color: "bg-[rgba(34,197,94,0.1)] text-[#4ade80]" };
    if (diff === 2) return { label: "Intermediate", color: "bg-[rgba(245,158,11,0.1)] text-[#fbbf24]" };
    return            { label: "Advanced",     color: "bg-[rgba(239,68,68,0.1)] text-[#f87171]" };
  }

  const hasAlternatives = alternatives && (alternatives.easier || alternatives.same || alternatives.harder);

  // Sizing — sm = 28px, default = 36px
  const btnCls = size === "sm"
    ? "h-7 w-7 rounded-md text-sm"
    : "h-9 w-9 rounded-md text-base";

  return (
    <>
      <div className="flex gap-1">
        {/*
         * Use plain <button> instead of shadcn <Button variant="ghost"> so that
         * our bg-green / bg-red classes win without needing !important overrides.
         * shadcn Button's ghost variant injects its own hover/focus bg that has
         * higher specificity and overrides our conditional classes.
         */}

        {/* Like */}
        <button
          type="button"
          onClick={handleLike}
          aria-label="Like"
          aria-pressed={isLiked}
          className={[
            "inline-flex items-center justify-center shrink-0 transition-all duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(204,255,0,0.3)] focus-visible:ring-offset-1",
            btnCls,
            isLiked
              ? "bg-green-500 text-white hover:bg-green-600"
              : "bg-transparent text-[#555555] hover:bg-[rgba(34,197,94,0.08)] hover:text-[#4ade80]",
          ].join(" ")}
        >
          <ThumbsUp className="w-4 h-4" />
        </button>

        {/* Dislike */}
        <button
          type="button"
          onClick={handleDislike}
          aria-label="Dislike"
          aria-pressed={isDisliked}
          className={[
            "inline-flex items-center justify-center shrink-0 transition-all duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1",
            btnCls,
            isDisliked
              ? "bg-red-500 text-white hover:bg-red-600"
              : "bg-transparent text-[#555555] hover:bg-[rgba(239,68,68,0.08)] hover:text-[#f87171]",
          ].join(" ")}
        >
          <ThumbsDown className="w-4 h-4" />
        </button>
      </div>

      {/* ── Replace Exercise Dialog ── */}
      <Dialog
        open={showAlternatives}
        onOpenChange={(open) => {
          if (!open) { setShowAlternatives(false); setManualMode(false); setManualExercise(""); }
        }}
      >
        <DialogContent className="max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Replace Exercise</DialogTitle>
            <DialogDescription>
              Swap out{" "}
              <span className="font-semibold text-white ">{exerciseName}</span>
              {" "}with a similar alternative, or type your own.
            </DialogDescription>
          </DialogHeader>

          {/* Manual entry row */}
          <div className="mt-1 mb-3">
            {manualMode ? (
              <div className="flex gap-2 items-center p-3 rounded-xl border-2 border-[#ccff00] bg-[rgba(204,255,0,0.05)]">
                <Input
                  autoFocus
                  placeholder="e.g., Incline Dumbbell Press"
                  value={manualExercise}
                  onChange={(e) => setManualExercise(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleManualReplace()}
                  className="flex-1 h-8 text-sm"
                />
                <Button size="sm" className="h-8 bg-[#ccff00] hover:bg-[#ccff00] text-black font-bold shrink-0"
                  onClick={handleManualReplace} disabled={!manualExercise.trim()}>
                  <Check className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" className="h-8 shrink-0"
                  onClick={() => { setManualMode(false); setManualExercise(""); }}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setManualMode(true)}
                className="w-full flex items-center gap-2 p-3 rounded-xl border-2 border-dashed border-[#2a2a2a]  hover:border-[#ccff00] hover:bg-[rgba(204,255,0,0.05)] transition-all text-[#555555]  hover:text-[#ccff00] text-sm"
              >
                <Pencil className="w-4 h-4" />
                Enter my own exercise
              </button>
            )}
          </div>

          {/* AI Suggestions */}
          {hasAlternatives && (
            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-[#555555]  uppercase tracking-wide">
                Suggested Replacements
              </p>
              {[
                { key: "easier", icon: "↓", label: "Easier"  },
                { key: "same",   icon: "→", label: "Similar" },
                { key: "harder", icon: "↑", label: "Harder"  },
              ].map(({ key, icon, label }) => {
                const alt = alternatives[key];
                if (!alt) return null;
                const diff = difficultyLabel(alt.difficulty);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handlePickAlternative(alt)}
                    className="w-full text-left p-3.5 rounded-xl border border-[#2a2a2a] hover:border-[#ccff00] hover:bg-[rgba(204,255,0,0.05)] transition-all group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-base font-bold text-[#555555] group-hover:text-[#ccff00]">{icon}</span>
                          <span className="text-xs font-semibold text-[#555555]  uppercase tracking-wide">{label}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${diff.color}`}>{diff.label}</span>
                        </div>
                        <p className="font-semibold text-white  group-hover:text-[#ccff00] text-sm truncate">
                          {alt.name}
                        </p>
                        {alt.primaryMuscle?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {alt.primaryMuscle.slice(0, 3).map((m) => (
                              <span key={m} className="text-xs bg-[#202020]  text-[#a0a0a0]  px-1.5 py-0.5 rounded-full">{m}</span>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-[#555555]  mt-1">
                          {alt.sets} sets × {alt.reps} reps · {alt.rest}s rest
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#a0a0a0] group-hover:text-[#ccff00] mt-1 flex-shrink-0 ml-2" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {!hasAlternatives && (
            <p className="text-sm text-[#555555]  text-center py-2">
              No automatic suggestions found — use the manual entry above!
            </p>
          )}

          {/* Footer */}
          <div className="flex gap-2 mt-1 pt-3 border-t border-[#2a2a2a] ">
            <Button variant="ghost" className="flex-1 text-[#555555]" onClick={() => setShowAlternatives(false)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              className="flex-1 text-[#f87171] border-[rgba(239,68,68,0.2)] hover:bg-[rgba(239,68,68,0.08)]"
              onClick={() => {
                toggleReaction({ exerciseName, reaction: "dislike" });
                onReactionChange?.(exerciseName, "dislike");
                setShowAlternatives(false);
              }}
            >
              <ThumbsDown className="w-3.5 h-3.5 mr-1.5" />
              Keep &amp; dislike
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
