import { useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { getProgramSchedule } from "@/utils/programSchedule";
import { useProfile } from "@/hooks/useUserQueries";
import { getTodayString } from "@/utils/dateUtils";
import WeeklySchedule from "./WeeklySchedule";
import Workouts from "./Workouts";
import { SubTabs } from "@/components/ui";
import { useEnrollments } from "@/hooks/useProgramQueries";
import { useActiveWorkoutSession, activeSessionPath } from "@/hooks/useActiveWorkoutSession";
import { CalendarDays, Dumbbell, BookOpen, Activity, PenLine, Play, ChevronRight } from "lucide-react";

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

  // Hierarchy: the session is the one primary action, then the program row,
  // then the library tabs. Read-only: an in-progress session resumes at its
  // own URL; otherwise Today owns the prescription and the start flow.
  const { activeSession } = useActiveWorkoutSession();
  const resumePath = activeSession?.isFresh ? activeSessionPath(activeSession) : null;

  // Rest day: an enrolled program with nothing scheduled today. The session
  // link stops being the primary (one primary per state) and becomes a quiet
  // row pointing at Today, where recovery is logged.
  const { profile } = useProfile();
  const isRestDay = useMemo(() => {
    if (resumePath || !activeEnrollment?.program?.workouts) return false;
    const today = getTodayString(profile?.timezone);
    return !getProgramSchedule(activeEnrollment, activeEnrollment.program.workouts, profile?.timezone).some((e) => e.date === today);
  }, [resumePath, activeEnrollment, profile?.timezone]);

  return (
    <div className="bg-charcoal min-h-full text-ink">
      {/* Layout owns the page title. */}
      <div className="max-w-5xl mx-auto px-gutter lg:px-0 pt-3">
        <Link
          to={resumePath || "/today"}
          className={`flex items-center gap-3 min-h-[56px] px-4 rounded-control transition-transform duration-fast ease-out active:scale-[0.98] ${
            isRestDay
              ? "border border-charcoal-border bg-charcoal-surface2 text-ink"
              : "bg-brand text-[var(--color-action-dark)]"
          }`}
        >
          <Play className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="flex-1 min-w-0">
            <span className="block text-emph truncate">{resumePath ? "Resume workout" : isRestDay ? "Rest day" : "Today's session"}</span>
            <span className="block text-caption opacity-70 truncate">
              {resumePath ? "Pick up where you left off." : isRestDay ? "Nothing scheduled. Log recovery on Today." : "Check in, then start."}
            </span>
          </span>
          <ChevronRight className="w-4 h-4 shrink-0" aria-hidden="true" />
        </Link>
      </div>
      {activeEnrollment?.program && (
        <div className="max-w-5xl mx-auto px-gutter lg:px-0 pt-2">
          <div className="flex items-center justify-between gap-3 py-row border-b border-charcoal-borderSoft">
            <div className="min-w-0">
              <span className="text-micro text-ink-muted block">Active program</span>
              <span className="text-emph text-ink truncate block">{activeEnrollment.program.title}</span>
            </div>
            <Link
              to={`/program-builder?edit=${activeEnrollment.program.id}`}
              className="shrink-0 flex items-center gap-1.5 min-h-tap px-3 rounded-control border border-charcoal-border bg-charcoal-surface2 text-body font-semibold text-ink transition-[transform,background-color] duration-fast ease-out active:scale-[0.97]"
            >
              <PenLine className="w-4 h-4" aria-hidden="true" />
              Edit
            </Link>
          </div>
        </div>
      )}
      <SubTabs tabs={TABS} active={activeTab} onChange={handleTabChange} />
      <div className="max-w-5xl mx-auto py-2 px-gutter lg:px-0">
        {activeTab === "schedule" && <WeeklySchedule />}
        {activeTab === "library" && <Workouts defaultTab="library" hideHeader={true} />}
        {activeTab === "programs" && <Workouts defaultTab="programs" hideHeader={true} />}
        {activeTab === "activity" && <Workouts defaultTab="activity-log" hideHeader={true} />}
      </div>
    </div>
  );
}
