import { useMemo } from "react";
import { Navigate, useSearchParams, Link } from "react-router-dom";
import { Brain, ChevronRight, Bot, History } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useUserQueries";
import { getTodayString } from "@/utils/dateUtils";
import { format, parseISO } from "date-fns";
import DailyBriefCard from "@/components/dashboard/DailyBriefCard";

// Analyze owns the AI daily brief only. The old tab strip is gone — Athlete
// State was a verbatim duplicate of the Body page (it redirects there now), and
// Career was cut from the IA (the /career route still exists, just unlinked).
// Mind (reading/study) lives on its own route; it is no longer embedded here.
export default function Insights() {
  const { profile } = useProfile();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get("tab");

  // Compute all hooks unconditionally BEFORE any early return (Rules of Hooks).
  const today = useMemo(() => getTodayString(profile?.timezone), [profile?.timezone]);

  // A compact strip of the most recent PAST briefs, surfaced inline so the page
  // carries scannable substance within ~2 viewports instead of reading as a lone
  // card in a void. Excludes today's brief (DailyBriefCard already owns it) and
  // each row deep-links into the full history. Same query shape as BriefHistory.
  const { data: recentBriefs = [] } = useQuery({
    queryKey: ["daily-briefs-recent", user?.id, today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_briefs")
        .select("date, brief_json")
        .eq("created_by", user.id)
        .neq("date", today)
        .order("date", { ascending: false })
        .limit(3);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  // Legacy deep links from the old 4-tab layout.
  if (tab === "state") return <Navigate to="/athlete-state" replace />;
  if (tab === "career") return <Navigate to="/career" replace />;

  return (
    <div className="bg-charcoal min-h-screen text-ink">
      <div className="max-w-3xl mx-auto px-4 py-4 space-y-3 pb-[var(--dock-clearance)]">
        {/* Lead with the page's named content — the AI Daily Brief — so Analyze
            opens on its brief, not an unrelated nav shortcut. */}
        <div className="rise-in">
          <DailyBriefCard today={today} />
        </div>

        {/* Recent briefs: an inline preview of the last few days so the page has
            real, scannable substance above the fold. Each row taps through to the
            full history. Hidden entirely when there's nothing prior to show. */}
        {recentBriefs.length > 0 && (
          <section className="rise-in-2 space-y-2">
            <div className="flex items-center justify-between px-1">
              <p className="section-label flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-faint" aria-hidden="true" />
                Recent Briefs
              </p>
              <Link
                to="/brief-history"
                className="text-[11.5px] font-bold text-secondary hover:text-ink transition-colors duration-200 [transition-timing-function:var(--ease)] inline-flex items-center min-h-[44px] px-1 -mr-1"
              >
                All
                <ChevronRight className="w-3.5 h-3.5 ml-0.5" aria-hidden="true" />
              </Link>
            </div>
            <div className="space-y-2">
              {recentBriefs.map((brief) => {
                const json = brief.brief_json || {};
                const preview =
                  json.insight ||
                  json.performance ||
                  json.nutrition ||
                  "Tap to view coach notes.";
                return (
                  <Link
                    key={brief.date}
                    to="/brief-history"
                    className="tile tile-interactive flex items-center gap-3 px-4 min-h-[44px] py-2.5"
                  >
                    <Bot className="w-4 h-4 text-teal shrink-0" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-bold text-ink leading-tight font-technical tabular-nums">
                        {format(parseISO(brief.date), "EEE, MMM d")}
                      </p>
                      <p className="text-[11.5px] font-semibold text-muted-2 truncate mt-0.5">
                        {preview}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-faint shrink-0" aria-hidden="true" />
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Mind lives on its own route; keep it reachable on mobile (sidebar links
            it on desktop). Parked BELOW the brief so the page leads with its named
            brief content rather than an unrelated nav shortcut. Given its own
            "Explore" header + extra top spacing so it reads as a distinct nav
            destination, not a second row in the Recent Briefs group. */}
        <section className="rise-in-3 space-y-2 pt-2">
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
