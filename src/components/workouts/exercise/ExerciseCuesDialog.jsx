import { AlertTriangle, TrendingUp, X, Camera } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export default function ExerciseCuesDialog({ showCues, setShowCues, exercise, exerciseIndex, cuesInfo, nudgeMessage, setNudgeMessage, coachingChip, setCoachingChip, onApplyCoachingSuggestion, showShotList, shotNote }) {
  return (
    <>
    <Dialog open={showCues} onOpenChange={setShowCues}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{exercise.name}</DialogTitle>
          {cuesInfo && (cuesInfo.primaryMuscles?.length || cuesInfo.equipment) && (
            <DialogDescription className="capitalize">
              {[cuesInfo.primaryMuscles?.join(", "), cuesInfo.equipment].filter(Boolean).join(" · ")}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="mt-2 text-sm text-ink-secondary max-h-[60vh] overflow-y-auto space-y-3">
          {nudgeMessage && (
            <div className="px-3 py-2.5 rounded-control glass-inset flex items-start gap-2.5">
              <i className={`w-[26px] h-[26px] rounded-control flex items-center justify-center flex-shrink-0 not-italic ${
                nudgeMessage.type === 'success' ? 'bg-teal/[0.16] text-teal' :
                nudgeMessage.type === 'warning' ? 'bg-warn/[0.15] text-warn' :
                'bg-info/[0.15] text-info'
              }`}>
                {nudgeMessage.type === 'warning' ? (
                  <AlertTriangle className="w-3.5 h-3.5" />
                ) : (
                  <TrendingUp className="w-3.5 h-3.5" />
                )}
              </i>
              <span className="text-xs font-semibold text-ink-muted leading-relaxed pt-1">{nudgeMessage.message}</span>
              <button onClick={() => setNudgeMessage(null)} aria-label="Dismiss" className="ml-auto flex-shrink-0 flex items-center justify-center min-h-[44px] min-w-[44px] -my-2 -mr-2 text-ink-faint hover:text-ink-muted">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {coachingChip && (
            <div className="px-3 py-2.5 rounded-control glass-inset flex items-center gap-2.5">
              <i className="w-[26px] h-[26px] rounded-control bg-coral/15 text-coral flex items-center justify-center flex-shrink-0 not-italic">
                <TrendingUp className="w-3.5 h-3.5" />
              </i>
              <span className="text-xs font-semibold text-ink-muted leading-relaxed flex-1">{coachingChip.message}</span>
              {coachingChip.suggestedWeight && coachingChip.targetSetIndex != null && (
                <button
                  className="text-caption font-bold text-brand bg-brand/10 border border-brand/30 rounded-full px-2.5 py-1 hover:bg-brand/15"
                  onClick={() => {
                    onApplyCoachingSuggestion?.(exerciseIndex, coachingChip.targetSetIndex, coachingChip.suggestedWeight);
                    setCoachingChip(null);
                  }}
                >
                  Apply
                </button>
              )}
              <button onClick={() => setCoachingChip(null)} aria-label="Dismiss" className="flex items-center justify-center min-h-[44px] min-w-[44px] -my-2 -mr-2 text-ink-faint hover:text-ink-muted flex-shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {showShotList && shotNote && (
            <div className="px-3 py-2.5 rounded-control glass-inset flex items-start gap-2.5">
              <i className="w-[26px] h-[26px] rounded-control bg-brand/[0.16] text-brand flex items-center justify-center flex-shrink-0 not-italic">
                <Camera className="w-3.5 h-3.5" />
              </i>
              <span className="text-xs font-semibold text-ink-muted leading-relaxed pt-1">{shotNote}</span>
            </div>
          )}

          {cuesInfo === undefined ? (
            <p className="text-ink-muted">Loading…</p>
          ) : cuesInfo?.instructions?.length ? (
            <ol className="list-decimal pl-5 space-y-2">
              {cuesInfo.instructions.map((step, i) => <li key={i}>{step}</li>)}
            </ol>
          ) : (
            <p className="text-ink-muted">No how-to found for this exercise in the library.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
