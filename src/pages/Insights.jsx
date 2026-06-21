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
      <div className="max-w-3xl mx-auto px-4 py-4 space-y-3 pb-[calc(var(--dock-total-height)+env(safe-area-inset-bottom)+40px)]">
        {/* Lead with the page's named content — the AI Daily Brief — so Analyze
            opens on its brief, not an unrelated nav shortcut. The full brief
            history is reachable from the Brief History sub-tab in the header, so
            this page no longer repeats a Recent Briefs list of its own. */}
        <div className="rise-in">
          <DailyBriefCard today={today} />
        </div>

        {/* Mind lives on its own route; keep it reachable on mobile (sidebar links
            it on desktop). Parked BELOW the brief so the page leads with its named
            brief content rather than an unrelated nav shortcut. Given its own
            "Explore" header + extra top spacing so it reads as a distinct nav
            destination. */}
        <section className="rise-in-2 space-y-2 pt-2">
          <p className="section-label px-1">Explore</p>
          <Link
            to="/mind"
            className="tile tile-interactive flex items-center gap-3 px-4 min-h-[44px] py-2.5"
          >
            <Brain className="w-4 h-4 text-teal shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-ink leading-tight">Mind &amp; Learning</p>
              <p className="text-[11.5px] font-semibold text-muted-2">Reading, study notes &amp; skills</p>
            </div>
            <ChevronRight className="w-4 h-4 text-faint shrink-0" aria-hidden="true" />
          </Link>
        </section>
      </div>
    </div>
  );
}
