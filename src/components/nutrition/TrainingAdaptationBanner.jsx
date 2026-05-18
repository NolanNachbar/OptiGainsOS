import { useTrainingAdaptation } from '@/hooks/useTrainingAdaptation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, Check, X } from 'lucide-react';

export default function TrainingAdaptationBanner() {
  const { hasSuggestion, completionRate, plannedCount, adaptation, changes, approve, dismiss } =
    useTrainingAdaptation();

  if (!hasSuggestion || !adaptation) return null;

  const actualCount = Math.round(completionRate * plannedCount);
  const isReduction = adaptation.scale < 1.0;
  const pct = Math.round(Math.abs(1 - adaptation.scale) * 100);

  return (
    <Card className="border-none ring-1 ring-blue-200">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-5 h-5 text-[#60a5fa]" />
          <h3 className="font-semibold text-white">Training Adaptation</h3>
        </div>

        {/* Message */}
        <div className="p-3 rounded-lg mb-4 text-sm bg-[rgba(59,130,246,0.08)] text-[#60a5fa]">
          {adaptation.message}
        </div>

        {/* Completion stats */}
        <div className="flex items-center gap-4 mb-4 text-sm text-[#a0a0a0] ">
          <span>
            Last week:{' '}
            <strong className="text-white">
              {actualCount} of {plannedCount}
            </strong>{' '}
            planned runs completed ({Math.round(completionRate * 100)}%)
          </span>
        </div>

        {/* Session diff */}
        {changes.length > 0 && (
          <div className="mb-4">
            <div className="text-sm font-medium text-[#a0a0a0]  mb-2">
              Proposed changes{' '}
              <span className={isReduction ? 'text-[#fbbf24]' : 'text-green-600'}>
                ({isReduction ? '−' : '+'}{pct}% load)
              </span>
            </div>
            <div className="space-y-1">
              {changes.map((c, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-3 py-1.5 bg-[#1a1a1a]  rounded-lg text-sm"
                >
                  <span className="text-[#a0a0a0]  truncate mr-4">{c.title}</span>
                  <span className="shrink-0 text-[#555555]">
                    <span className="line-through">{c.from} min</span>
                    {' → '}
                    <span className="font-semibold text-[#a0a0a0] ">{c.to} min</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            onClick={() => approve.mutate()}
            className="flex-1 bg-[rgba(59,130,246,0.08)] hover:bg-[rgba(59,130,246,0.08)] text-white"
            disabled={approve.isPending}
          >
            <Check className="w-4 h-4 mr-1.5" />
            {approve.isPending ? 'Applying…' : 'Apply Changes'}
          </Button>
          <Button variant="outline" onClick={dismiss}>
            <X className="w-4 h-4 mr-1.5" />
            Skip This Week
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
