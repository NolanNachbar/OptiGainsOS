import { useSearchParams, Link } from "react-router-dom";
import WeeklySchedule from "./WeeklySchedule";
import Workouts from "./Workouts";
import { SubTabs } from "@/components/ui/system";
import { useEnrollments } from "@/hooks/useProgramQueries";
import { CalendarDays, Dumbbell, BookOpen, Activity, PenLine } from "lucide-react";

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

  // Active-program chip: program edit was 4 taps deep (Train → Programs →
  // program detail → Edit). This surfaces the enrolled program + a direct Edit
  // action at the top of the whole Train hub (every tab), so it's 2 taps from
  // Today (Train nav, then Edit) — straight to /program-builder?edit=<id>,
  // the same route ProgramDetail's own Edit button uses.
  const { enrollments } = useEnrollments();
  const activeEnrollment = enrollments.find((e) => e.status === "active");

  return (
    <div className="bg-charcoal min-h-full text-ink">
      {activeEnrollment?.program && (
        <div className="max-w-5xl mx-auto px-4 lg:px-0 pt-2">
          <div className="surface flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <span className="text-[11px] font-semibold text-muted-2 block">Active program</span>
              <span className="text-sm font-semibold text-ink truncate block">{activeEnrollment.program.title}</span>
            </div>
            <Link
              to={`/program-builder?edit=${activeEnrollment.program.id}`}
              className="shrink-0 flex items-center gap-1.5 min-h-[44px] px-3 text-[13px] font-semibold text-ink"
            >
              <PenLine className="w-4 h-4" />
              Edit
            </Link>
          </div>
        </div>
      )}
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
