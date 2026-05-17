import { History } from "lucide-react";

export default function ExerciseCardPreview() {
  return (
    <div className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-lg max-w-sm mx-auto">
      {/* Exercise header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white font-bold text-sm">
          1
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-slate-900 dark:text-white">Barbell Bench Press</h4>
          {/* Last performance indicator */}
          <div className="flex items-center gap-1.5 mt-1">
            <History className="w-3 h-3 text-slate-500 dark:text-slate-400" />
            <span className="text-xs text-slate-600 dark:text-slate-400">
              Last: <span className="font-semibold text-primary-600 dark:text-primary-400">185 lbs × 5</span>
              <span className="text-slate-500 ml-1">(Mar 12)</span>
            </span>
          </div>
        </div>
      </div>

      {/* Sets table preview */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 pb-2 border-b border-slate-200 dark:border-slate-700">
          <span className="w-10">Set</span>
          <span className="w-20">Weight</span>
          <span className="w-16">Reps</span>
        </div>
        {[1, 2, 3].map((set) => (
          <div key={set} className="flex items-center gap-2">
            <span className="w-10 font-medium text-slate-700 dark:text-slate-300 text-sm">{set}</span>
            <div className="w-20 h-9 bg-primary-50 dark:bg-primary-900/20 border-2 border-primary-600 rounded-lg flex items-center justify-center">
              <span className="text-sm font-medium text-primary-700 dark:text-primary-400">185</span>
            </div>
            <div className="w-16 h-9 bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-600 rounded-lg flex items-center justify-center">
              <span className="text-sm text-slate-700 dark:text-slate-300">5</span>
            </div>
          </div>
        ))}
      </div>

      {/* Annotation arrow */}
      <div className="mt-3 flex items-center gap-2 text-xs text-primary-600 dark:text-primary-400 font-medium">
        <span>←</span>
        <span>Auto-filled from last workout!</span>
      </div>
    </div>
  );
}
