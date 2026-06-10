import { useSearchParams } from "react-router-dom";
import WeeklySchedule from "./WeeklySchedule";
import Workouts from "./Workouts";
import { SubTabs } from "@/components/ui/system";
import { CalendarDays, Dumbbell, BookOpen, Activity } from "lucide-react";

const TABS = [
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "library", label: "Library", icon: Dumbbell },
  { id: "programs", label: "Programs", icon: BookOpen },
  { id: "activity-log", label: "Activity", icon: Activity },
];
const TAB_IDS = TABS.map((t) => t.id);

export default function Train() {
  // The URL is the single source of truth for the active tab.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab = TAB_IDS.includes(tabParam) ? tabParam : "schedule";
  const handleTabChange = (tab) => setSearchParams({ tab });

  return (
    <div className="bg-charcoal min-h-screen text-ink">
      <SubTabs tabs={TABS} active={activeTab} onChange={handleTabChange} />
      <div className="max-w-5xl mx-auto py-2">
        {activeTab === "schedule" && <WeeklySchedule />}
        {activeTab === "library" && <Workouts defaultTab="library" hideHeader={true} />}
        {activeTab === "programs" && <Workouts defaultTab="programs" hideHeader={true} />}
        {activeTab === "activity-log" && <Workouts defaultTab="activity-log" hideHeader={true} />}
      </div>
    </div>
  );
}
