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
    <Card className="">
      <CardHeader className="pb-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full"
        >
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="w-4 h-4 text-[#555555]" />
            Check-in History ({sortedCheckins.length})
          </CardTitle>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-[#555555]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#555555]" />
          )}
        </button>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          <div className="space-y-2">
            {sortedCheckins.map((checkin) => (
              <div
                key={checkin.id}
                className="flex items-center gap-3 p-3 bg-[#1a1a1a]  rounded-lg text-sm"
              >
                {/* Status icon */}
                {checkin.status === "accepted" ? (
                  <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                ) : (
                  <X className="w-4 h-4 text-[#555555] flex-shrink-0" />
                )}

                {/* Date + week */}
                <div className="min-w-[100px]">
                  <div className="font-medium">
                    {format(parseISO(checkin.checkin_date), "MMM d, yyyy")}
                  </div>
                  <div className="text-xs text-[#555555] ">
                    Week {checkin.week_number}
                  </div>
                </div>

                {/* Trend weight */}
                <div className="min-w-[70px]">
                  <div className="text-[#555555]  text-xs">Trend</div>
                  <div className="font-medium">
                    {checkin.trend_weight} {weightUnit}
                  </div>
                </div>

                {/* Rate */}
                <div className="min-w-[80px]">
                  <div className="text-[#555555]  text-xs">Rate</div>
                  <div className="font-medium">
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
                          ? "bg-[rgba(34,197,94,0.1)] text-[#4ade80]"
                          : "bg-[#2a2a2a]  text-[#555555] "
                      }`}
                    >
                      {checkin.calorie_adjustment > 0 ? "+" : ""}
                      {checkin.calorie_adjustment} cal
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#202020]  text-[#555555] ">
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
