import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useUserQueries";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronUp, History, Check, X } from "lucide-react";
import { format, parseISO } from "date-fns";

export default function CheckinHistory() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [expanded, setExpanded] = useState(false);

  const weightUnit = profile?.weight_unit || "lbs";

  const { data: checkins = [] } = useQuery({
    queryKey: queryKeys.weeklyCheckins(user?.id),
    queryFn: () =>
      db.entities.WeeklyCheckin.filter({ created_by: user.id }),
    enabled: !!user,
  });

  // Sort by date descending (filter only accepts eq, so sort client-side)
  const sortedCheckins = [...checkins].sort(
    (a, b) => new Date(b.checkin_date) - new Date(a.checkin_date)
  );

  if (sortedCheckins.length === 0) return null;

  return (
    <Card className="border-none shadow-lg">
      <CardHeader className="pb-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full"
        >
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="w-4 h-4 text-slate-500" />
            Check-in History ({sortedCheckins.length})
          </CardTitle>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          <div className="space-y-2">
            {sortedCheckins.map((checkin) => (
              <div
                key={checkin.id}
                className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700 rounded-lg text-sm"
              >
                {/* Status icon */}
                {checkin.status === "accepted" ? (
                  <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                ) : (
                  <X className="w-4 h-4 text-slate-400 flex-shrink-0" />
                )}

                {/* Date + week */}
                <div className="min-w-[100px]">
                  <div className="font-medium dark:text-white">
                    {format(parseISO(checkin.checkin_date), "MMM d, yyyy")}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Week {checkin.week_number}
                  </div>
                </div>

                {/* Trend weight */}
                <div className="min-w-[70px]">
                  <div className="text-slate-500 dark:text-slate-400 text-xs">Trend</div>
                  <div className="font-medium dark:text-white">
                    {checkin.trend_weight} {weightUnit}
                  </div>
                </div>

                {/* Rate */}
                <div className="min-w-[80px]">
                  <div className="text-slate-500 dark:text-slate-400 text-xs">Rate</div>
                  <div className="font-medium dark:text-white">
                    {checkin.actual_weekly_rate > 0 ? "+" : ""}
                    {checkin.actual_weekly_rate} /wk
                  </div>
                </div>

                {/* Adjustment */}
                <div className="flex-1 text-right">
                  {checkin.calorie_adjustment !== 0 ? (
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        checkin.status === "accepted"
                          ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400"
                          : "bg-slate-200 dark:bg-slate-600 text-slate-500 dark:text-slate-300"
                      }`}
                    >
                      {checkin.calorie_adjustment > 0 ? "+" : ""}
                      {checkin.calorie_adjustment} cal
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-600 text-slate-500 dark:text-slate-300">
                      No change
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
