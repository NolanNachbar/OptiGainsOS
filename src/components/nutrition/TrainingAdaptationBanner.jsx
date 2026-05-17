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
    <Card className="border-none shadow-lg ring-1 ring-blue-200 dark:ring-blue-800">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-slate-900 dark:text-white">Training Adaptation</h3>
        </div>

        {/* Message */}
        <div className="p-3 rounded-lg mb-4 text-sm bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300">
          {adaptation.message}
        </div>

        {/* Completion stats */}
        <div className="flex items-center gap-4 mb-4 text-sm text-slate-600 dark:text-slate-400">
          <span>
            Last week:{' '}
            <strong className="text-slate-900 dark:text-white">
              {actualCount} of {plannedCount}
            </strong>{' '}
            planned runs completed ({Math.round(completionRate * 100)}%)
          </span>
        </div>

        {/* Session diff */}
        {changes.length > 0 && (
          <div className="mb-4">
            <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Proposed changes{' '}
              <span className={isReduction ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}>
                ({isReduction ? '−' : '+'}{pct}% load)
              </span>
            </div>
            <div className="space-y-1">
              {changes.map((c, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-3 py-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm"
                >
                  <span className="text-slate-700 dark:text-slate-300 truncate mr-4">{c.title}</span>
                  <span className="shrink-0 text-slate-400">
                    <span className="line-through">{c.from} min</span>
                    {' → '}
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{c.to} min</span>
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
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
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
