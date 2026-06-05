import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useUserQueries";
import { queryKeys } from "@/lib/queryKeys";
import { getTodayString, getWeekStart, getWeekEnd } from "@/utils/dateUtils";
import { getRecoveryHeatmapData } from "@/utils/muscleVolumeUtils";

// Icon imports
import { Bot, BarChart3, Heart, Brain, Briefcase, Activity, Dumbbell } from "lucide-react";

// Components imports
import DailyBriefCard from "@/components/dashboard/DailyBriefCard";
import Mind from "./Mind";
import Career from "./Career";
import TrainingLoadTab from "@/components/dashboard/TrainingLoadTab";
import MuscleHeatMap from "@/components/MuscleHeatMap";
import AthleteState from "./AthleteState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Insights() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");

  const [activeTab, setActiveTab] = useState(() => {
    if (tabParam && ["coaching", "analytics", "state"].includes(tabParam)) {
      return tabParam;
    }
    return "coaching";
  });

  const [coachingSubTab, setCoachingSubTab] = useState("brief");

  // Keep search param in sync if active tab changes
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  useEffect(() => {
    if (tabParam && ["coaching", "analytics", "state"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const today = getTodayString(profile?.timezone);
  const weekStart = getWeekStart(today);
  const weekEnd = getWeekEnd(today);

  // Queries for training load and heatmap
  const { data: allCardioSessions = [] } = useQuery({
    queryKey: ['allCardioSessions', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('garmin_activities')
        .select('start_date:activity_date, moving_time_seconds:duration_seconds, average_heartrate:avg_hr')
        .eq('created_by', user.id)
        .order('activity_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: workoutLogs = [] } = useQuery({
    queryKey: queryKeys.workoutLogs(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('created_by', user.id)
        .order('log_date', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: weeklyLogsWithExercises = [] } = useQuery({
    queryKey: ["weeklyLogsExercises", weekStart, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_logs")
        .select("exercises, log_date, created_at")
        .eq("created_by", user.id)
        .gte("log_date", weekStart)
        .lte("log_date", weekEnd);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const weeklyBodyData = getRecoveryHeatmapData(weeklyLogsWithExercises);

  return (
    <div className="bg-[#09090e] min-h-screen text-white">
      {/* Sub-Tab Navigation Header */}
      <div className="border-b border-charcoal-border bg-charcoal-surface/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            <button
              onClick={() => handleTabChange("coaching")}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${
                activeTab === "coaching"
                  ? "border-brand text-brand"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5" /> Coaching
              </div>
            </button>
            <button
              onClick={() => handleTabChange("analytics")}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${
                activeTab === "analytics"
                  ? "border-brand text-brand"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5" /> Analytics
              </div>
            </button>
            <button
              onClick={() => handleTabChange("state")}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${
                activeTab === "state"
                  ? "border-brand text-brand"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Heart className="w-3.5 h-3.5" /> Athlete State
              </div>
            </button>
          </div>
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest hidden md:inline ml-4">
            Insights System
          </span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto py-2">
        {/* Coaching Sub-Tab */}
        {activeTab === "coaching" && (
          <div className="px-4 py-4 space-y-6">
            {/* Nested Sub-Tabs switcher */}
            <div className="flex justify-center">
              <div className="flex rounded-full overflow-hidden border border-charcoal-border text-xs font-semibold bg-charcoal-surface p-0.5">
                <button
                  onClick={() => setCoachingSubTab("brief")}
                  className={`px-4 py-1.5 rounded-full transition-all ${
                    coachingSubTab === "brief"
                      ? "bg-brand text-black font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <Bot className="w-3.5 h-3.5" /> Daily Brief
                  </div>
                </button>
                <button
                  onClick={() => setCoachingSubTab("mind")}
                  className={`px-4 py-1.5 rounded-full transition-all ${
                    coachingSubTab === "mind"
                      ? "bg-brand text-black font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <Brain className="w-3.5 h-3.5" /> Mind
                  </div>
                </button>
                <button
                  onClick={() => setCoachingSubTab("career")}
                  className={`px-4 py-1.5 rounded-full transition-all ${
                    coachingSubTab === "career"
                      ? "bg-brand text-black font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <Briefcase className="w-3.5 h-3.5" /> Career
                  </div>
                </button>
              </div>
            </div>

            <div className="max-w-3xl mx-auto mt-4">
              {coachingSubTab === "brief" && (
                <div className="space-y-4">
                  <DailyBriefCard today={today} />
                </div>
              )}
              {coachingSubTab === "mind" && <Mind hideHeader={true} />}
              {coachingSubTab === "career" && <Career hideHeader={true} />}
            </div>
          </div>
        )}

        {/* Analytics Sub-Tab */}
        {activeTab === "analytics" && (
          <div className="px-4 py-4 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Training Load */}
              <div className="lg:col-span-2 space-y-4">
                <TrainingLoadTab
                  cardioSessions={allCardioSessions}
                  workoutLogs={workoutLogs}
                  profile={profile}
                />
              </div>

              {/* Muscle Heatmap */}
              <div className="space-y-4">
                <Card className="shadow-dark-card border-charcoal-border overflow-hidden bg-charcoal-surface">
                  <CardHeader className="pb-0 pt-4 px-5">
                    <CardTitle className="text-[11px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                      <Dumbbell className="w-3.5 h-3.5" /> Muscle fatigue
                    </CardTitle>
                  </CardHeader>
                  <div className="p-5 flex justify-center">
                    {weeklyBodyData.length > 0 ? (
                      <MuscleHeatMap data={weeklyBodyData} className="w-full" maxWidth={160} />
                    ) : (
                      <div className="text-center py-12 text-sm text-slate-500 font-medium">
                        Log strength workouts this week to see muscle stress heatmap
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* Athlete State Sub-Tab */}
        {activeTab === "state" && (
          <div className="px-4 py-4">
            <AthleteState hideHeader={true} />
          </div>
        )}
      </div>
    </div>
  );
}
