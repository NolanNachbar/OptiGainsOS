import { useMemo } from "react";
import { Navigate, useSearchParams, Link } from "react-router-dom";
import { Brain, ChevronRight } from "lucide-react";
import { useProfile } from "@/hooks/useUserQueries";
import { getTodayString } from "@/utils/dateUtils";
import DailyBriefCard from "@/components/dashboard/DailyBriefCard";

// Analyze owns the AI daily brief only. The old tab strip is gone — Athlete
// State was a verbatim duplicate of the Body page (it redirects there now), and
// Career was cut from the IA (the /career route still exists, just unlinked).
// Mind (reading/study) lives on its own route; it is no longer embedded here.
export default function Insights() {
  const { profile } = useProfile();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get("tab");

  // Compute all hooks unconditionally BEFORE any early return (Rules of Hooks).
  const today = useMemo(() => getTodayString(profile?.timezone), [profile?.timezone]);

  // Legacy deep links from the old 4-tab layout.
  if (tab === "state") return <Navigate to="/athlete-state" replace />;
  if (tab === "career") return <Navigate to="/career" replace />;

  return (
    <div className="bg-charcoal min-h-screen text-ink">
      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        <DailyBriefCard today={today} />
        {/* Mind lives in the Analyze section — keep it reachable on mobile (sidebar links it on desktop) */}
        <Link to="/mind" className="glass glass-interactive flex items-center gap-3 px-4 py-3.5">
          <div className="p-2 rounded-full bg-teal/10 shrink-0">
            <Brain className="w-4 h-4 text-teal" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink">Mind &amp; Learning</p>
            <p className="text-[11.5px] font-semibold text-muted-2">Reading, study notes & skills</p>
          </div>
          <ChevronRight className="w-4 h-4 text-faint shrink-0" />
        </Link>
      </div>
    </div>
  );
}
