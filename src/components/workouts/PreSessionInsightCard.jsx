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
  const iconColor = insight.action === 'deload' ? 'text-warn' : 'text-brand';

  return (
    <Card className="mb-4 p-4">
      <div className="flex items-start gap-3">
        <div className="w-[26px] h-[26px] rounded-md bg-brand/15 flex items-center justify-center shrink-0 mt-0.5">
          <Brain className="w-3.5 h-3.5 text-brand" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] text-brand uppercase tracking-[0.08em] font-bold">Coach</span>
            <Icon className={`w-3 h-3 ${iconColor}`} />
          </div>
          <p className="text-[12.5px] font-semibold text-ink-muted leading-relaxed">{insight.message}</p>
          {Number(insight.suggestedWeight) > 0 && (
            <div className="flex items-center gap-2 mt-3">
              <Button
                size="sm"
                variant="volt"
                className="text-xs h-11 md:h-7 px-3"
                onClick={handleAccept}
              >
                Use {insight.suggestedWeight} lbs
              </Button>
              <Button
                size="sm"
                variant="dim"
                className="text-xs h-11 md:h-7 px-2"
                onClick={handleDismiss}
              >
                Keep my plan
              </Button>
            </div>
          )}
          {!(Number(insight.suggestedWeight) > 0) && (
            <Button
              size="sm"
              variant="dim"
              className="text-xs h-11 md:h-7 px-3 mt-2"
              onClick={handleDismiss}
            >
              Got it
            </Button>
          )}
        </div>
        <button onClick={handleDismiss} className="text-ink-faint hover:text-ink-muted mt-0.5">
          <X className="w-4 h-4" />
        </button>
      </div>
    </Card>
  );
}
