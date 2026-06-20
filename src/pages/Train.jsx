import { useSearchParams } from "react-router-dom";
import WeeklySchedule from "./WeeklySchedule";
import Workouts from "./Workouts";
import { SubTabs } from "@/components/ui/system";
import { CalendarDays, Dumbbell, BookOpen, Activity } from "lucide-react";

const TABS = [
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "library", label: "Library", icon: Dumbbell },
  { id: "programs", label: "Programs", icon: BookOpen },
  { id: "activity", label: "Activity", icon: Activity },
];
const TAB_IDS = TABS.map((t) => t.id);
// Aliases for URL params that don't match a canonical tab id, so deep links keep
// resolving to the right tab instead of silently falling back to Schedule.
// "activity-log" is the legacy param the nav still emits.
const TAB_ALIASES = { "activity-log": "activity" };

export default function Train() {
  // The URL is the single source of truth for the active tab. The tab id IS the
  // URL param (label, lowercased) so /train?tab=activity resolves correctly;
  // legacy params are normalized through TAB_ALIASES on read.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const normalizedParam = TAB_ALIASES[tabParam] || tabParam;
  const activeTab = TAB_IDS.includes(normalizedParam) ? normalizedParam : "schedule";
  const handleTabChange = (tab) => setSearchParams({ tab });

  return (
    <div className="bg-charcoal min-h-screen text-ink">
      <SubTabs tabs={TABS} active={activeTab} onChange={handleTabChange} />
      <div className="max-w-5xl mx-auto py-2 px-4 lg:px-0">
        {activeTab === "schedule" && <WeeklySchedule />}
        {activeTab === "library" && <Workouts defaultTab="library" hideHeader={true} />}
        {activeTab === "programs" && <Workouts defaultTab="programs" hideHeader={true} />}
        {activeTab === "activity" && <Workouts defaultTab="activity-log" hideHeader={true} />}
      </div>
    </div>
  );
}
