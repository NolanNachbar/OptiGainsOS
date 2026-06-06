import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronRight, TrendingUp, RotateCcw, Info } from "lucide-react";

// How much weight to add per week by default (lbs), per goal
const DEFAULT_INCREMENTS = {
  muscle_gain:     { compound: 5,   isolation: 2.5 },
  weight_loss:     { compound: 2.5, isolation: 2.5 },
  endurance:       { compound: 2.5, isolation: 2.5 },
  general_fitness: { compound: 5,   isolation: 2.5 },
  flexibility:     { compound: 2.5, isolation: 2.5 },
};

// Preset program lengths
const DURATION_PRESETS = [
  { weeks: 4,  label: "4 Weeks",  description: "Short burst — test the split" },
  { weeks: 8,  label: "8 Weeks",  description: "Standard block — solid progress" },
  { weeks: 12, label: "12 Weeks", description: "Full cycle — serious gains" },
  { weeks: 16, label: "16 Weeks", description: "Extended — peak development" },
];

export default function ProgramDurationModal({ split, goal, onConfirm, onCancel }) {
  const [totalWeeks, setTotalWeeks] = useState(8);
  const [customWeeks, setCustomWeeks] = useState("");
  const [weeklyIncrement, setWeeklyIncrement] = useState(
    DEFAULT_INCREMENTS[goal]?.compound ?? 5
  );
  const [deloadMode, setDeloadMode] = useState("match_intro");
  const [deloadReduction, setDeloadReduction] = useState(10);

  const activeWeeks = customWeeks ? parseInt(customWeeks) || totalWeeks : totalWeeks;
  const progressionWeeks = Math.max(1, activeWeeks - 2);

  // Week-by-week schedule preview — colors use explicit dark variants
  const weekSchedule = Array.from({ length: activeWeeks }, (_, i) => {
    const week = i + 1;
    if (week === 1) {
      return {
        week,
        type: "intro",
        label: "Intro Week",
        description: "Learn the movements — lighter loads, focus on form",
        chipClass: "bg-brand/[12%] text-brand border-brand/30 text-brand",
      };
    }
    if (week === activeWeeks) {
      return {
        week,
        type: "deload",
        label: "Deload Week",
        description:
          deloadMode === "match_intro"
            ? "Same weight as Week 1 — full recovery"
            : `${deloadReduction} lbs under previous week — active recovery`,
        chipClass: "bg-[rgba(245,158,11,0.1)] text-[#fbbf24] border-amber-200",
      };
    }
    return {
      week,
      type: "progression",
      label: `Week ${week}`,
      description: `+${weeklyIncrement} lbs from previous week`,
      chipClass: "bg-[rgba(34,197,94,0.1)] text-[#4ade80] border-emerald-200",
    };
  });

  function handleConfirm() {
    onConfirm({
      totalWeeks: activeWeeks,
      introWeeks: 1,
      progressionWeeks,
      deloadWeeks: 1,
      weeklyIncrement: parseFloat(weeklyIncrement) || 5,
      deloadReduction: parseFloat(deloadReduction) || 10,
      deloadMode,
      weekSchedule,
      split,
    });
  }

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-2xl p-0 flex flex-col overflow-hidden bg-charcoal">

        {/* Header */}
        <DialogHeader className="shrink-0 border-b border-charcoal-border p-6 pb-4">
          <DialogTitle className="text-xl text-white">
            Program Settings
          </DialogTitle>
          <p className="text-sm text-slate-500 mt-1">
            Configure how long and how progressively your program runs
          </p>
        </DialogHeader>

        {/* Scrollable body */}
        <div
          className="space-y-6 overflow-y-auto overscroll-contain flex-1 p-6"
          style={{ WebkitOverflowScrolling: "touch" }}
        >

          {/* Split summary chips */}
          <div className="flex flex-wrap gap-2 p-3 bg-charcoal-elevated bg-charcoal-surface rounded-xl border border-charcoal-border">
            {split.map((day, i) => (
              <Badge
                key={i}
                variant="outline"
                className="text-xs text-slate-400 text-slate-400 border-charcoal-border border-charcoal-border bg-charcoal-surface bg-charcoal-elevated"
              >
                Day {i + 1}: {day}
              </Badge>
            ))}
          </div>

          {/* Duration selector */}
          <div>
            <Label className="text-base font-semibold block mb-3 text-white">
              Program Duration
            </Label>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              {DURATION_PRESETS.map((preset) => {
                const isActive = activeWeeks === preset.weeks && !customWeeks;
                return (
                  <button
                    key={preset.weeks}
                    onClick={() => { setTotalWeeks(preset.weeks); setCustomWeeks(""); }}
                    className={[
                      "p-3 rounded-xl border-2 text-left transition-all",
                      isActive
                        ? "border-brand/30 bg-brand/[8%]"
                        : "border-charcoal-border bg-charcoal-surface hover:border-brand/30",
                    ].join(" ")}
                  >
                    <div className={`font-bold text-sm ${isActive ? "text-brand text-brand" : "text-white "}`}>
                      {preset.label}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 leading-snug">
                      {preset.description}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="Custom weeks..."
                value={customWeeks}
                min={3}
                max={52}
                onChange={(e) => setCustomWeeks(e.target.value)}
                className="w-40 glass glass-interactive text-white placeholder:text-slate-400"
              />
              <span className="text-sm text-slate-500">weeks (min 3)</span>
            </div>
          </div>

          {/* Progression + Deload settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Weekly increment */}
            <div>
              <Label className="text-base font-semibold block mb-1 text-white">
                Weekly Weight Increase
              </Label>
              <p className="text-xs text-slate-500 mb-2">
                Lbs added to compound lifts each progression week
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={weeklyIncrement}
                  min={0}
                  step={2.5}
                  onChange={(e) => setWeeklyIncrement(e.target.value)}
                  className="w-28 glass glass-interactive text-white"
                />
                <span className="text-sm text-slate-500">lbs / week</span>
              </div>

              {/* Quick-pick buttons */}
              <div className="flex gap-2 mt-2">
                {[2.5, 5, 7.5, 10].map((v) => {
                  const isActive = parseFloat(weeklyIncrement) === v;
                  return (
                    <button
                      key={v}
                      onClick={() => setWeeklyIncrement(v)}
                      className={[
                        "text-xs px-2.5 py-1 rounded-full border-2 font-medium transition-all",
                        isActive
                          ? "border-brand/30 bg-brand/[8%] text-brand text-brand"
                          : "border-charcoal-border text-slate-400 hover:border-brand/30 bg-charcoal-surface",
                      ].join(" ")}
                    >
                      +{v}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Deload mode */}
            <div>
              <Label className="text-base font-semibold block mb-1 text-white">
                Deload Week Weight
              </Label>
              <p className="text-xs text-slate-500 mb-2">
                How much to reduce weight on the final recovery week
              </p>

              <div className="space-y-2">
                {/* Match Intro */}
                <button
                  onClick={() => setDeloadMode("match_intro")}
                  className={[
                    "w-full text-left p-3 rounded-xl border-2 transition-all",
                    deloadMode === "match_intro"
                      ? "border-amber-400 bg-[rgba(245,158,11,0.08)]"
                      : "border-charcoal-border bg-charcoal-surface hover:border-[rgba(245,158,11,0.4)]",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-[#fbbf24]" />
                    <span className="text-sm font-medium text-white ">
                      Match Intro Week
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 ml-6">
                    Use the same weight as Week 1
                  </p>
                </button>

                {/* Reduce */}
                <button
                  onClick={() => setDeloadMode("reduce")}
                  className={[
                    "w-full text-left p-3 rounded-xl border-2 transition-all",
                    deloadMode === "reduce"
                      ? "border-amber-400 bg-[rgba(245,158,11,0.08)]"
                      : "border-charcoal-border bg-charcoal-surface hover:border-[rgba(245,158,11,0.4)]",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-[#fbbf24] rotate-180" />
                    <span className="text-sm font-medium text-white ">
                      Reduce from Previous
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 ml-6">
                    Drop a set amount from the last progression week
                  </p>
                </button>

                {deloadMode === "reduce" && (
                  <div className="flex items-center gap-2 pl-2">
                    <span className="text-sm text-slate-400">Drop by</span>
                    <Input
                      type="number"
                      value={deloadReduction}
                      min={0}
                      step={2.5}
                      onChange={(e) => setDeloadReduction(e.target.value)}
                      className="w-24 glass glass-interactive text-white"
                    />
                    <span className="text-sm text-slate-500">lbs</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Week-by-week preview */}
          <div>
            <Label className="text-base font-semibold block mb-3 text-white">
              Program Preview — {activeWeeks} weeks
            </Label>
            <div className="flex gap-1.5 flex-wrap">
              {weekSchedule.map((w) => (
                <div
                  key={w.week}
                  title={w.description}
                  className={`px-3 py-2 rounded-lg border text-xs font-medium ${w.chipClass}`}
                >
                  {w.type === "intro" ? "Intro" : w.type === "deload" ? "Deload" : `Wk ${w.week}`}
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-500">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-brand" />
                1 intro week
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-[rgba(34,197,94,0.4)]" />
                {progressionWeeks} progression week{progressionWeeks !== 1 ? "s" : ""}
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-[rgba(245,158,11,0.4)]" />
                1 deload week
              </div>
            </div>
          </div>

          {/* Info box */}
          <div className="flex gap-3 p-3 bg-brand/[8%] border border-brand/30 rounded-xl text-sm text-brand text-brand">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p>
              Each week's workout will be generated with adjusted sets, reps, and rest
              based on the phase. The app will remind you which phase you're in when
              you start each workout.
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-charcoal-border px-6 py-4 flex gap-3 bg-charcoal">
          <Button variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={activeWeeks < 3}
            variant="primary"
            className="flex-1 bg-brand hover:bg-brand text-black font-bold"
          >
            <ChevronRight className="w-4 h-4 mr-2" />
            Generate Program
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
