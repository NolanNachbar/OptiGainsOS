import { useSearchParams } from "react-router-dom";
import { useProfile } from "@/hooks/useUserQueries";
import { getTodayString } from "@/utils/dateUtils";

import { Bot, Brain, Briefcase, Heart } from "lucide-react";

import DailyBriefCard from "@/components/dashboard/DailyBriefCard";
import Mind from "./Mind";
import Career from "./Career";
import AthleteState from "./AthleteState";

// Flat top-level tabs. Training Load + Muscle Heatmap used to live in an
// "Analytics" tab here but duplicated the Dashboard verbatim, so they were
// removed (Dashboard is their single home). Mind/Career were promoted out of a
// nested "Coaching" pill into first-class tabs to kill the tab→pill→page nesting.
const TABS = [
  { id: "brief",  label: "Daily Brief",  icon: Bot },
  { id: "mind",   label: "Mind",         icon: Brain },
  { id: "career", label: "Career",       icon: Briefcase },
  { id: "state",  label: "Athlete State", icon: Heart },
];

// Map legacy ?tab= values (coaching/analytics) onto the flattened tabs.
const LEGACY = { coaching: "brief", analytics: "brief" };
const normalizeTab = (t) => (TABS.some((x) => x.id === t) ? t : LEGACY[t] || "brief");

export default function Insights() {
  const { profile } = useProfile();
  const [searchParams, setSearchParams] = useSearchParams();

  // Active tab is derived straight from the URL — the URL is the single source
  // of truth, so no local state/effect sync is needed.
  const activeTab = normalizeTab(searchParams.get("tab"));
  const handleTabChange = (tab) => setSearchParams({ tab });

  const today = getTodayString(profile?.timezone);

  return (
    <div className="bg-charcoal min-h-screen text-white">
      {/* Tab Navigation Header */}
      <div className="border-b border-charcoal-border bg-charcoal-surface/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => handleTabChange(id)}
                className={`px-4 py-2 text-xs font-bold uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${
                  activeTab === id
                    ? "border-brand text-brand"
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5" /> {label}
                </div>
              </button>
            ))}
          </div>
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest hidden md:inline ml-4">
            Insights System
          </span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto py-2">
        {activeTab === "brief" && (
          <div className="px-4 py-4">
            <div className="max-w-3xl mx-auto space-y-4">
              <DailyBriefCard today={today} />
            </div>
          </div>
        )}
        {activeTab === "mind" && (
          <div className="px-4 py-4"><Mind hideHeader={true} /></div>
        )}
        {activeTab === "career" && (
          <div className="px-4 py-4"><Career hideHeader={true} /></div>
        )}
        {activeTab === "state" && (
          <div className="px-4 py-4"><AthleteState hideHeader={true} /></div>
        )}
      </div>
    </div>
  );
}
