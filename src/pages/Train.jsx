import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import WeeklySchedule from "./WeeklySchedule";
import Workouts from "./Workouts";
import { CalendarDays, Dumbbell, BookOpen, Activity } from "lucide-react";

export default function Train() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  
  const [activeTab, setActiveTab] = useState(() => {
    if (tabParam && ["schedule", "library", "programs", "activity-log"].includes(tabParam)) {
      return tabParam;
    }
    return "schedule";
  });

  // Keep search param in sync if active tab changes
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  useEffect(() => {
    if (tabParam && ["schedule", "library", "programs", "activity-log"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  return (
    <div className="bg-charcoal min-h-screen text-white">
      {/* Sub-Tab Navigation Header */}
      <div className="border-b border-charcoal-border bg-charcoal-surface/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            <button
              onClick={() => handleTabChange("schedule")}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${
                activeTab === "schedule"
                  ? "border-brand text-brand"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" /> Schedule
              </div>
            </button>
            <button
              onClick={() => handleTabChange("library")}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${
                activeTab === "library"
                  ? "border-brand text-brand"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Dumbbell className="w-3.5 h-3.5" /> Library
              </div>
            </button>
            <button
              onClick={() => handleTabChange("programs")}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${
                activeTab === "programs"
                  ? "border-brand text-brand"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" /> Programs
              </div>
            </button>
            <button
              onClick={() => handleTabChange("activity-log")}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${
                activeTab === "activity-log"
                  ? "border-brand text-brand"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" /> Activity Log
              </div>
            </button>
          </div>
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest hidden md:inline ml-4">
            Train System
          </span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto py-2">
        {activeTab === "schedule" && <WeeklySchedule />}
        {activeTab === "library" && <Workouts defaultTab="library" hideHeader={true} />}
        {activeTab === "programs" && <Workouts defaultTab="programs" hideHeader={true} />}
        {activeTab === "activity-log" && <Workouts defaultTab="activity-log" hideHeader={true} />}
      </div>
    </div>
  );
}
