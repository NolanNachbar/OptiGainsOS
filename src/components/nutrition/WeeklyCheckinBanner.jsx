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
    return <Minus className="w-4 h-4 text-[#555555]" />;
  };

  return (
    <Card
      className={isOnTrack ? "border-[rgba(34,197,94,0.3)]" : "border-[rgba(245,158,11,0.3)]"}
    >
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2 mb-3">
          <CalendarCheck className="w-5 h-5 text-brand" />
          <h3 className="font-semibold text-white">Weekly Check-in</h3>
          {activePhase && (
            <span className="text-sm text-[#555555]">
              Week {pendingCheckin.week_number} of your {phaseLabel}
            </span>
          )}
        </div>

        {/* Weight summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <div className="p-2.5 bg-[#1a1a1a]  rounded-lg">
            <div className="text-xs text-[#555555]">Trend Weight</div>
            <div className="font-semibold">
              {pendingCheckin.trend_weight} {weightUnit}
            </div>
          </div>
          <div className="p-2.5 bg-[#1a1a1a]  rounded-lg">
            <div className="text-xs text-[#555555]">Weekly Change</div>
            <div className="flex items-center gap-1 font-semibold">
              {getRateIcon()}
              {pendingCheckin.weight_change_trend > 0 ? "+" : ""}
              {pendingCheckin.weight_change_trend} {weightUnit}
            </div>
          </div>
          <div className="p-2.5 bg-[#1a1a1a]  rounded-lg">
            <div className="text-xs text-[#555555]">Actual Rate</div>
            <div className="font-semibold">
              {pendingCheckin.actual_weekly_rate > 0 ? "+" : ""}
              {pendingCheckin.actual_weekly_rate} {weightUnit}/wk
            </div>
          </div>
          <div className="p-2.5 bg-[#1a1a1a]  rounded-lg">
            <div className="text-xs text-[#555555]">Goal Rate</div>
            <div className="font-semibold">
              {pendingCheckin.goal_weekly_rate > 0 ? "+" : ""}
              {pendingCheckin.goal_weekly_rate} {weightUnit}/wk
            </div>
          </div>
        </div>

        {/* TDEE estimate */}
        {pendingCheckin.tdee_used && (
          <div className="flex items-center justify-between px-2.5 py-2 bg-[#1a1a1a] rounded-lg mb-4 text-sm">
            <span className="text-[#555555]">Est. TDEE</span>
            <span className="font-semibold text-white">
              {pendingCheckin.tdee_used.toLocaleString()} cal
              <span className="text-xs text-[#555555] ml-1.5 font-normal">
                ({pendingCheckin.tdee_method === "adaptive" ? "derived from your data" : "formula estimate"})
              </span>
            </span>
          </div>
        )}

        {/* Reasoning */}
        <div
          className={`p-3 rounded-lg mb-4 text-sm ${
            isOnTrack
              ? "bg-green-50 text-green-800"
              : "bg-[rgba(245,158,11,0.08)] text-amber-800"
          }`}
        >
          {pendingCheckin.reasoning}
        </div>

        {/* Macro adjustment preview */}
        {pendingCheckin.calorie_adjustment !== 0 && (
          <div className="mb-4">
            <div className="text-sm font-medium text-[#a0a0a0]  mb-2">
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
                <div key={macro.label} className="p-2 bg-[#1a1a1a]  rounded-lg">
                  <div className="text-xs text-[#555555]">{macro.label}</div>
                  <div className="text-[#555555] line-through text-xs">
                    {macro.prev}
                    {macro.unit || ""}
                  </div>
                  <div className="font-semibold text-white">
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
            className="flex-1 bg-brand hover:bg-brand"
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
          <p className="text-xs text-[#555555] mt-2">
            Note: You only logged {pendingCheckin.logging_consistency}% of days
            this week. More consistent logging improves check-in accuracy.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
