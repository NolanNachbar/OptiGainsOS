import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import FoodTracker from "./FoodTracker";
import Supplements from "./Supplements";
import Progress from "./Progress";
import WeeklyPlanCard from "@/components/nutrition/WeeklyPlanCard";
import { Droplets, Utensils, CalendarRange, ChevronRight, LineChart } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import QuickCapture from "@/components/QuickCapture";
import { SubTabs } from "@/components/ui/system";

export default function Fuel() {
  const [searchParams, setSearchParams] = useSearchParams();
  // The URL is the single source of truth — sidebar/sub-tab links both work.
  // "wellness" kept as a legacy alias that lands on the Body tab.
  const tabParam = searchParams.get("tab");
  const activeTab = tabParam === "body" || tabParam === "wellness"
    ? "body"
    : tabParam === "hydration"
    ? "hydration"
    : "nutrition";
  const switchTab = (t) => setSearchParams(t === "nutrition" ? {} : { tab: t });
  const [showWeekPlan, setShowWeekPlan] = useState(false);
  return (
    <div className="bg-charcoal min-h-screen text-ink">
      <SubTabs
        tabs={[
          { id: "nutrition", label: "Nutrition & Meals", icon: Utensils },
          { id: "body", label: "Body", icon: LineChart },
          { id: "hydration", label: "Hydration", icon: Droplets },
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
                aria-haspopup="dialog"
                aria-expanded={showWeekPlan}
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
        ) : activeTab === "body" ? (
          <div className="px-4 py-6 max-w-2xl mx-auto space-y-6 pb-12">

            {/* Body & Progress — weight (logger + trend), measurements, photos.
                Merged in from the retired standalone /progress route. The Progress
                sub-tab strip is its own label, so no extra section heading here. */}
            <Progress embedded />

            {/* Quick Capture — secondary, kept behind a disclosure to save height */}
            <details className="group glass">
              <summary className="px-4 py-3 flex items-center justify-between cursor-pointer list-none section-label">
                Stream Note
                <ChevronRight className="w-4 h-4 text-ink-faint transition-transform group-open:rotate-90" />
              </summary>
              <div className="px-4 pb-4">
                <QuickCapture embedded domain="general" placeholder="Stream a note to Second Brain..." />
              </div>
            </details>
          </div>
        ) : (
          <div className="px-4 py-6 max-w-2xl mx-auto space-y-6 pb-12">

            {/* Water + supplements (full type management) — reused from Supplements */}
            <Supplements embedded />
          </div>
        )}
      </div>
    </div>
  );
}
