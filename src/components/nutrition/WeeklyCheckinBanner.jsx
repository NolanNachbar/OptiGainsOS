import { useWeeklyCheckin } from "@/hooks/useWeeklyCheckin";
import { useDietPhase } from "@/hooks/useDietPhase";
import { useProfile } from "@/hooks/useUserQueries";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CalendarCheck,
  TrendingDown,
  TrendingUp,
  Minus,
  Check,
  X,
} from "lucide-react";

export default function WeeklyCheckinBanner() {
  const { pendingCheckin, acceptCheckin, dismissCheckin, hasPendingCheckin } =
    useWeeklyCheckin();
  const { activePhase } = useDietPhase();
  const { profile } = useProfile();

  if (!hasPendingCheckin || !pendingCheckin) return null;

  const weightUnit = profile?.weight_unit || "lbs";
  const isOnTrack = pendingCheckin.calorie_adjustment === 0;
  const phaseLabel = activePhase?.phase_type
    ? activePhase.phase_type.charAt(0).toUpperCase() +
      activePhase.phase_type.slice(1)
    : "";

  const getRateIcon = () => {
    if (pendingCheckin.actual_weekly_rate < -0.1)
      return <TrendingDown className="w-4 h-4 text-green-600" />;
    if (pendingCheckin.actual_weekly_rate > 0.1)
      return <TrendingUp className="w-4 h-4 text-orange-600" />;
    return <Minus className="w-4 h-4 text-slate-500" />;
  };

  return (
    <Card
      className={`border-none shadow-lg ${
        isOnTrack ? "ring-1 ring-green-200" : "ring-1 ring-amber-200"
      }`}
    >
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2 mb-3">
          <CalendarCheck className="w-5 h-5 text-primary-600" />
          <h3 className="font-semibold text-slate-900 dark:text-white">Weekly Check-in</h3>
          {activePhase && (
            <span className="text-sm text-slate-500">
              Week {pendingCheckin.week_number} of your {phaseLabel}
            </span>
          )}
        </div>

        {/* Weight summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="p-2.5 bg-slate-50 dark:bg-slate-700 rounded-lg">
            <div className="text-xs text-slate-500">Trend Weight</div>
            <div className="font-semibold dark:text-white">
              {pendingCheckin.trend_weight} {weightUnit}
            </div>
          </div>
          <div className="p-2.5 bg-slate-50 dark:bg-slate-700 rounded-lg">
            <div className="text-xs text-slate-500">Weekly Change</div>
            <div className="flex items-center gap-1 font-semibold dark:text-white">
              {getRateIcon()}
              {pendingCheckin.weight_change_trend > 0 ? "+" : ""}
              {pendingCheckin.weight_change_trend} {weightUnit}
            </div>
          </div>
          <div className="p-2.5 bg-slate-50 dark:bg-slate-700 rounded-lg">
            <div className="text-xs text-slate-500">Actual Rate</div>
            <div className="font-semibold dark:text-white">
              {pendingCheckin.actual_weekly_rate > 0 ? "+" : ""}
              {pendingCheckin.actual_weekly_rate} {weightUnit}/wk
            </div>
          </div>
          <div className="p-2.5 bg-slate-50 dark:bg-slate-700 rounded-lg">
            <div className="text-xs text-slate-500">Goal Rate</div>
            <div className="font-semibold dark:text-white">
              {pendingCheckin.goal_weekly_rate > 0 ? "+" : ""}
              {pendingCheckin.goal_weekly_rate} {weightUnit}/wk
            </div>
          </div>
        </div>

        {/* Reasoning */}
        <div
          className={`p-3 rounded-lg mb-4 text-sm ${
            isOnTrack
              ? "bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300"
              : "bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300"
          }`}
        >
          {pendingCheckin.reasoning}
        </div>

        {/* Macro adjustment preview */}
        {pendingCheckin.calorie_adjustment !== 0 && (
          <div className="mb-4">
            <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Proposed Adjustment
            </div>
            <div className="grid grid-cols-4 gap-2 text-center text-sm">
              {[
                {
                  label: "Calories",
                  prev: pendingCheckin.previous_calories,
                  next: pendingCheckin.new_calories,
                },
                {
                  label: "Protein",
                  prev: pendingCheckin.previous_protein,
                  next: pendingCheckin.new_protein,
                  unit: "g",
                },
                {
                  label: "Carbs",
                  prev: pendingCheckin.previous_carbs,
                  next: pendingCheckin.new_carbs,
                  unit: "g",
                },
                {
                  label: "Fats",
                  prev: pendingCheckin.previous_fats,
                  next: pendingCheckin.new_fats,
                  unit: "g",
                },
              ].map((macro) => (
                <div key={macro.label} className="p-2 bg-slate-50 dark:bg-slate-700 rounded-lg">
                  <div className="text-xs text-slate-500">{macro.label}</div>
                  <div className="text-slate-400 line-through text-xs">
                    {macro.prev}
                    {macro.unit || ""}
                  </div>
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {macro.next}
                    {macro.unit || ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            onClick={() => acceptCheckin.mutate(pendingCheckin)}
            className="flex-1 bg-primary-600 hover:bg-primary-700"
            disabled={acceptCheckin.isPending}
          >
            <Check className="w-4 h-4 mr-1.5" />
            {pendingCheckin.calorie_adjustment === 0
              ? "Confirm — No Changes"
              : "Accept & Update Macros"}
          </Button>
          <Button
            variant="outline"
            onClick={() => dismissCheckin.mutate(pendingCheckin)}
            disabled={dismissCheckin.isPending}
          >
            <X className="w-4 h-4 mr-1.5" />
            Dismiss
          </Button>
        </div>

        {/* Logging consistency note */}
        {pendingCheckin.logging_consistency < 70 && (
          <p className="text-xs text-slate-400 mt-2">
            Note: You only logged {pendingCheckin.logging_consistency}% of days
            this week. More consistent logging improves check-in accuracy.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
