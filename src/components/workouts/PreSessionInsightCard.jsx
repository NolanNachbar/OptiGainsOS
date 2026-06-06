import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Brain, X, ChevronUp, TrendingUp, TrendingDown } from "lucide-react";

/**
 * Shows one pre-session coaching insight (Phase 2+).
 * @param {Object} insight - from getPreSessionInsight()
 * @param {Function} onAccept - called with suggested weight so caller can pre-fill
 * @param {Function} onDismiss
 */
export default function PreSessionInsightCard({ insight, onAccept, onDismiss }) {
  const [dismissed, setDismissed] = useState(false);
  if (!insight || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  const handleAccept = () => {
    setDismissed(true);
    onAccept?.(insight);
  };

  const Icon = insight.action === 'deload' ? TrendingDown : TrendingUp;
  const iconColor = insight.action === 'deload' ? 'text-yellow-400' : 'text-brand';

  return (
    <Card className="bg-charcoal border-brand/20 mb-4 p-4">
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 rounded-full bg-brand/10 flex items-center justify-center shrink-0 mt-0.5">
          <Brain className="w-4 h-4 text-brand" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] text-brand uppercase tracking-widest font-semibold">Coach</span>
            <Icon className={`w-3 h-3 ${iconColor}`} />
          </div>
          <p className="text-sm text-slate-300 leading-snug">{insight.message}</p>
          {insight.suggestedWeight && (
            <div className="flex items-center gap-2 mt-3">
              <Button
                size="sm"
                className="bg-brand text-black hover:bg-brand/80 text-xs h-7 px-3"
                onClick={handleAccept}
              >
                Use {insight.suggestedWeight} lbs
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-slate-500 hover:text-slate-400 text-xs h-7 px-2"
                onClick={handleDismiss}
              >
                Keep my plan
              </Button>
            </div>
          )}
          {!insight.suggestedWeight && (
            <Button
              size="sm"
              variant="ghost"
              className="text-slate-500 hover:text-slate-400 text-xs h-7 px-0 mt-2"
              onClick={handleDismiss}
            >
              Got it
            </Button>
          )}
        </div>
        <button onClick={handleDismiss} className="text-slate-700 hover:text-slate-500 mt-0.5">
          <X className="w-4 h-4" />
        </button>
      </div>
    </Card>
  );
}
