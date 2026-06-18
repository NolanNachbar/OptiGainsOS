import { useMemo } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useProfile } from "@/hooks/useUserQueries";
import { getTodayString } from "@/utils/dateUtils";
import { Brain } from "lucide-react";
import DailyBriefCard from "@/components/dashboard/DailyBriefCard";
import { SectionLabel } from "@/components/ui/system";
import Mind from "./Mind";

// Analyze is one merged view: the AI daily brief up top, the Mind module
// (reading/study) beneath it. The old tab strip is gone — Athlete State was a
// verbatim duplicate of the Body page (it redirects there now), and Career was
// cut from the IA (the /career route still exists, just unlinked).
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

        <section className="space-y-2">
          <SectionLabel icon={Brain} className="px-0.5">Mind · reading &amp; study</SectionLabel>
          <Mind hideHeader={true} />
        </section>
      </div>
    </div>
  );
}
