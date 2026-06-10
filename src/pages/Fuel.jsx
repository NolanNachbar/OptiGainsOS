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
import { Droplets, History, Utensils, TrendingUp, CalendarRange, ChevronRight } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import QuickCapture from "@/components/QuickCapture";
import { useBodyWeightEntries, useProfile } from "@/hooks/useUserQueries";
import { SubTabs } from "@/components/ui/system";

export default function Fuel() {
  const [searchParams, setSearchParams] = useSearchParams();
  // The URL is the single source of truth — sidebar/sub-tab links both work.
  const activeTab = searchParams.get("tab") === "wellness" ? "wellness" : "nutrition";
  const switchTab = (t) => setSearchParams(t === "nutrition" ? {} : { tab: t });
  const [showWeekPlan, setShowWeekPlan] = useState(false);
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
    <div className="bg-charcoal min-h-screen text-ink">
      <SubTabs
        tabs={[
          { id: "nutrition", label: "Nutrition & Meals", icon: Utensils },
          { id: "wellness", label: "Hydration & Wellness", icon: Droplets },
        ]}
        active={activeTab}
        onChange={switchTab}
      />

      <div className="max-w-5xl mx-auto">
        {activeTab === "nutrition" ? (
          <>
            {/* Today leads. The week plan (carb cycle, shopping list, approve)
                lives behind this row so it never crowds the daily log. */}
            <div className="px-4 pt-4 max-w-3xl mx-auto">
              <button
                onClick={() => setShowWeekPlan(true)}
                className="w-full glass glass-interactive px-4 py-3 flex items-center gap-3 text-left"
              >
                <CalendarRange className="w-4 h-4 text-gold shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-extrabold text-ink">Week plan</div>
                  <div className="text-[11px] font-semibold text-ink-muted truncate">
                    carb-cycled targets · shopping list · approve
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-ink-faint shrink-0" />
              </button>
            </div>
            <FoodTracker />

            <Dialog open={showWeekPlan} onOpenChange={setShowWeekPlan}>
              <DialogContent className="max-w-lg p-0 max-h-[85vh] overflow-y-auto">
                <WeeklyPlanCard bare />
              </DialogContent>
            </Dialog>
          </>
        ) : (
          <div className="px-4 py-6 max-w-2xl mx-auto space-y-6">

            {/* Body & Progress — weight (logger + trend), measurements, photos.
                Merged in from the retired standalone /progress route. */}
            <section className="space-y-2">
              <h2 className="section-label flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-info" /> Body & Progress
              </h2>
              <Progress embedded />
            </section>

            {/* Water + supplements (full type management) — reused from Supplements */}
            <Supplements embedded />

            {/* Quick Capture */}
            <section className="space-y-2">
              <h2 className="section-label">Stream Note</h2>
              <QuickCapture domain="general" placeholder="Stream a note to Second Brain..." />
            </section>
 
            {/* Recent History */}
            <section className="space-y-2 pt-2 pb-12">
              <h2 className="section-label flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-ink-muted" /> Recent Activity
              </h2>
              <div className="space-y-1">
                {todaySupps.slice(0, 3).map(s => (
                  <div key={s.id} className="flex items-center justify-between text-xs text-ink-secondary px-4 py-3 surface">
                    <span className="font-semibold">Took {s.supplement_name}</span>
                    <span className="font-technical text-[10px] text-ink-faint">{format(parseISO(s.taken_at), "h:mm a")}</span>
                  </div>
                ))}
                {todayWater.slice(-3).reverse().map(w => (
                  <div key={w.id} className="flex items-center justify-between text-xs text-ink-secondary px-4 py-3 surface">
                    <span className="font-semibold">Drank {w.amount_ml}ml water</span>
                    <span className="font-technical text-[10px] text-ink-faint">{format(parseISO(w.logged_at), "h:mm a")}</span>
                  </div>
                ))}
                {todayWeight && (
                  <div className="flex items-center justify-between text-xs text-ink-secondary px-4 py-3 surface">
                    <span className="font-semibold">Logged Weight: {todayWeight.weight} {profile?.weight_unit || "lbs"}</span>
                    <span className="font-technical text-[10px] text-ink-faint">{format(parseISO(todayWeight.recorded_date), "MMM d")}</span>
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
