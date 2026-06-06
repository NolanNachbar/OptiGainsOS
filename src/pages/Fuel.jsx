import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import FoodTracker from "./FoodTracker";
import Supplements from "./Supplements";
import Progress from "./Progress";
import WeeklyPlanCard from "@/components/nutrition/WeeklyPlanCard";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { getTodayString } from "@/utils/dateUtils";
import { format, parseISO } from "date-fns";
import { Droplets, History, Utensils, TrendingUp } from "lucide-react";
import QuickCapture from "@/components/QuickCapture";
import { useBodyWeightEntries, useProfile } from "@/hooks/useUserQueries";

export default function Fuel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") === "wellness" ? "wellness" : "nutrition");
  const switchTab = (t) => {
    setActiveTab(t);
    setSearchParams(t === "nutrition" ? {} : { tab: t });
  };
  const { user } = useAuth();
  const { profile } = useProfile();
  const today = getTodayString(profile?.timezone);

  const { weightEntries } = useBodyWeightEntries();
  const todayWeight = weightEntries.find(e => e.recorded_date === today);

  const { data: todayWater = [] } = useQuery({
    queryKey: ["water-logs", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("water_logs")
        .select("*")
        .eq("created_by", user.id)
        .gte("logged_at", today + "T00:00:00")
        .lte("logged_at", today + "T23:59:59");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });
  const { data: todaySupps = [] } = useQuery({
    queryKey: ["supplement-logs", today, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplement_logs")
        .select("*")
        .eq("created_by", user.id)
        .gte("taken_at", today + "T00:00:00")
        .lte("taken_at", today + "T23:59:59");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });
  return (
    <div className="bg-charcoal min-h-screen text-white">
      {/* Tab Switcher */}
      <div className="border-b border-charcoal-border bg-charcoal-surface/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex gap-1">
            <button
              onClick={() => switchTab("nutrition")}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-widest border-b-2 transition-all ${
                activeTab === "nutrition"
                  ? "border-brand text-brand"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Utensils className="w-3.5 h-3.5" /> Nutrition & Meals
              </div>
            </button>
            <button
              onClick={() => switchTab("wellness")}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-widest border-b-2 transition-all ${
                activeTab === "wellness"
                  ? "border-brand text-brand"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Droplets className="w-3.5 h-3.5" /> Hydration & Wellness
              </div>
            </button>
          </div>
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest hidden sm:inline">
            Fuel System
          </span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto">
        {activeTab === "nutrition" ? (
          <>
            <div className="px-4 pt-4 max-w-2xl mx-auto">
              <WeeklyPlanCard />
            </div>
            <FoodTracker />
          </>
        ) : (
          <div className="px-4 py-6 max-w-2xl mx-auto space-y-6">

            {/* Body & Progress — weight (logger + trend), measurements, photos.
                Merged in from the retired standalone /progress route. */}
            <section className="space-y-2">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-sky-400" /> Body & Progress
              </h2>
              <Progress embedded />
            </section>

            {/* Water + supplements (full type management) — reused from Supplements */}
            <Supplements embedded />

            {/* Quick Capture */}
            <section className="space-y-2">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Stream Note</h2>
              <QuickCapture domain="general" placeholder="Stream a note to Second Brain..." />
            </section>
 
            {/* Recent History */}
            <section className="space-y-2 pt-2 pb-12">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-slate-500" /> Recent Activity
              </h2>
              <div className="space-y-1">
                {todaySupps.slice(0, 3).map(s => (
                  <div key={s.id} className="flex items-center justify-between text-xs text-slate-400 px-4 py-3 bg-charcoal-surface/60 rounded-xl border border-charcoal-border/50">
                    <span className="font-semibold">Took {s.supplement_name}</span>
                    <span className="font-technical text-[10px] text-slate-500">{format(parseISO(s.taken_at), "h:mm a")}</span>
                  </div>
                ))}
                {todayWater.slice(-3).reverse().map(w => (
                  <div key={w.id} className="flex items-center justify-between text-xs text-slate-400 px-4 py-3 bg-charcoal-surface/60 rounded-xl border border-charcoal-border/50">
                    <span className="font-semibold">Drank {w.amount_ml}ml water</span>
                    <span className="font-technical text-[10px] text-slate-500">{format(parseISO(w.logged_at), "h:mm a")}</span>
                  </div>
                ))}
                {todayWeight && (
                  <div className="flex items-center justify-between text-xs text-slate-400 px-4 py-3 bg-charcoal-surface/60 rounded-xl border border-charcoal-border/50">
                    <span className="font-semibold">Logged Weight: {todayWeight.weight} {profile?.weight_unit || "lbs"}</span>
                    <span className="font-technical text-[10px] text-slate-500">{format(parseISO(todayWeight.recorded_date), "MMM d")}</span>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
