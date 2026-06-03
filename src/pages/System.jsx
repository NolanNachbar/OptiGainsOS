import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Brain, Briefcase, Settings, Cpu } from "lucide-react";
import Mind from "./Mind";
import Career from "./Career";
import Profile from "./Profile";

export default function System() {
  const [activeTab, setActiveTab] = useState("coach");

  return (
    <div className="min-h-screen bg-[#121212]">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="px-4 py-4 border-b border-[#2a2a2a] sticky top-0 z-[50] bg-[#121212]/90 backdrop-blur-md">
          <TabsList className="grid w-full grid-cols-4 max-w-2xl mx-auto bg-[#1a1a1a] border-[#2a2a2a]">
            <TabsTrigger value="coach" className="data-[state=active]:bg-brand data-[state=active]:text-black"><Cpu className="w-4 h-4 mr-2 hidden sm:inline" />Coach</TabsTrigger>
            <TabsTrigger value="mind" className="data-[state=active]:bg-brand data-[state=active]:text-black"><Brain className="w-4 h-4 mr-2 hidden sm:inline" />Mind</TabsTrigger>
            <TabsTrigger value="career" className="data-[state=active]:bg-brand data-[state=active]:text-black"><Briefcase className="w-4 h-4 mr-2 hidden sm:inline" />Career</TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-brand data-[state=active]:text-black"><Settings className="w-4 h-4 mr-2 hidden sm:inline" />Settings</TabsTrigger>
          </TabsList>
        </div>

        <div className="max-w-4xl mx-auto pb-12">
          <TabsContent value="coach" className="mt-0 focus-visible:ring-0">
            <CoachTab />
          </TabsContent>
          <TabsContent value="mind" className="mt-0 focus-visible:ring-0">
            <Mind hideHeader />
          </TabsContent>
          <TabsContent value="career" className="mt-0 focus-visible:ring-0">
            <Career hideHeader />
          </TabsContent>
          <TabsContent value="settings" className="mt-0 focus-visible:ring-0">
            <Profile hideHeader />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function CoachTab() {
  return (
    <div className="px-4 py-6 md:px-8 space-y-6">
      <header className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-lg bg-brand/10">
            <Cpu className="w-5 h-5 text-brand" />
          </div>
          <h1 className="text-2xl font-bold text-white">Metabolic Coach</h1>
        </div>
        <p className="text-[#a0a0a0] text-sm pl-12">Dynamic adjustments based on your expenditure engine.</p>
      </header>

      <div className="bg-brand/[5%] border border-brand/20 rounded-2xl p-6 text-center">
        <h2 className="text-lg font-bold text-white mb-2">Weekly Check-In</h2>
        <p className="text-sm text-[#a0a0a0] mb-4">Your metabolism rose by an estimated 85kcal this week. You are currently in a slight surplus.</p>
        <button className="w-full bg-brand text-black font-bold py-3 rounded-xl hover:bg-brand/90 transition-colors">
          Start Check-In
        </button>
      </div>

      <section className="space-y-4">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#555555]">System Status</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Algorithm", value: "Adaptive", color: "text-brand" },
            { label: "Compliance", value: "92%", color: "text-green-400" },
            { label: "Weight Trend", value: "-0.4 lbs/wk", color: "text-green-400" },
            { label: "Next Check-in", value: "Sunday", color: "text-white" },
          ].map(stat => (
            <div key={stat.label} className="p-4 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a]">
              <p className="text-[10px] text-[#555555] uppercase tracking-wider mb-1">{stat.label}</p>
              <p className={`text-sm font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
