import { useState } from "react";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Activity, Moon, Zap, Brain, Plus } from "lucide-react";
import { toast } from "sonner";

const SCORES = [1, 2, 3, 4, 5];

const SLEEP_LABELS = { 1: "Poor", 2: "Light", 3: "OK", 4: "Good", 5: "Great" };
const SORENESS_LABELS = { 1: "Very sore", 2: "Sore", 3: "Moderate", 4: "Minimal", 5: "Fresh" };
const STRESS_LABELS = { 1: "Very stressed", 2: "Stressed", 3: "Moderate", 4: "Low", 5: "Calm" };

function ScorePicker({ value, onChange, labels }) {
  return (
    <div className="flex gap-1.5">
      {SCORES.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-all ${
            value === n
              ? "border-brand/30 bg-brand/[8%] text-brand text-brand"
              : "border-[#2a2a2a] text-[#555555] hover:border-brand/30"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function ReadinessScore({ sleep, soreness, stress }) {
  // Soreness and stress are inverted (1 = bad, 5 = good for sleep; but 1 = very sore/stressed = bad for the athlete)
  // We want high sleep to be good, low soreness to be bad, low stress to be good
  // Normalize all to 1-5 where 5 = best for recovery
  const normalizedSoreness = 6 - soreness; // invert: 1 (very sore) → 5 penalty, 5 (fresh) → 1 penalty
  const normalizedStress = 6 - stress;     // invert: 1 (very stressed) → 5 penalty

  // Overall: average of sleep (good high), inverted soreness (fresh = good), inverted stress (calm = good)
  const overall = (sleep + normalizedSoreness + normalizedStress) / 3;
  const pct = ((overall - 1) / 4) * 100;

  let color, label;
  if (overall >= 4) { color = "text-green-600"; label = "Ready"; }
  else if (overall >= 3) { color = "text-[#fbbf24]"; label = "Moderate"; }
  else { color = "text-[#f87171]"; label = "Take it easy"; }

  return { pct, color, label, overall };
}

function ReadinessBar({ pct, color }) {
  const barColor = color.includes("green") ? "bg-green-500" : color.includes("amber") ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="h-1.5 bg-[#202020] bg-[#202020] rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function DailyReadinessCard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");
  const [open, setOpen] = useState(false);
  const [sleep, setSleep] = useState(3);
  const [soreness, setSoreness] = useState(3);
  const [stress, setStress] = useState(3);
  const [notes, setNotes] = useState("");

  const { data: todayEntry, isLoading } = useQuery({
    queryKey: ["dailyReadiness", today, user?.id],
    queryFn: async () => {
      const rows = await db.entities.DailyReadiness.filter({ created_by: user.id, checkin_date: today });
      return rows[0] || null;
    },
    enabled: !!user,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (todayEntry) {
        return db.entities.DailyReadiness.update(todayEntry.id, {
          sleep_score: sleep, soreness_score: soreness, stress_score: stress, notes,
        });
      }
      return db.entities.DailyReadiness.create({
        created_by: user.id, checkin_date: today,
        sleep_score: sleep, soreness_score: soreness, stress_score: stress, notes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dailyReadiness", today, user?.id] });
      toast.success("Readiness logged!");
      setOpen(false);
    },
    onError: () => toast.error("Failed to save readiness"),
  });

  const handleOpen = () => {
    if (todayEntry) {
      setSleep(todayEntry.sleep_score);
      setSoreness(todayEntry.soreness_score);
      setStress(todayEntry.stress_score);
      setNotes(todayEntry.notes || "");
    } else {
      setSleep(3); setSoreness(3); setStress(3); setNotes("");
    }
    setOpen(true);
  };

  if (isLoading) return null;

  const scored = todayEntry
    ? ReadinessScore({ sleep: todayEntry.sleep_score, soreness: todayEntry.soreness_score, stress: todayEntry.stress_score })
    : null;

  return (
    <>
      <Card className="border border-[#2a2a2a] bg-[#1a1a1a]">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-500" />
              Today's Readiness
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-brand" onClick={handleOpen}>
              {todayEntry ? "Update" : <><Plus className="w-3 h-3 mr-1" />Log</>}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          {todayEntry ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className={`text-sm font-semibold ${scored.color}`}>{scored.label}</span>
                <span className="text-xs text-[#a0a0a0]">{scored.overall.toFixed(1)} / 5</span>
              </div>
              <ReadinessBar pct={scored.pct} color={scored.color} />
              <div className="grid grid-cols-3 gap-2 pt-1">
                {[
                  { icon: Moon, label: "Sleep", value: todayEntry.sleep_score, labelMap: SLEEP_LABELS },
                  { icon: Zap, label: "Soreness", value: todayEntry.soreness_score, labelMap: SORENESS_LABELS },
                  { icon: Brain, label: "Stress", value: todayEntry.stress_score, labelMap: STRESS_LABELS },
                ].map(({ icon: Icon, label, value, labelMap }) => (
                  <div key={label} className="text-center">
                    <Icon className="w-3.5 h-3.5 mx-auto mb-0.5 text-[#a0a0a0]" />
                    <div className="text-base font-bold text-white">{value}<span className="text-xs text-[#a0a0a0]">/5</span></div>
                    <div className="text-xs text-[#a0a0a0]">{labelMap[value]}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-3">
              <Activity className="w-8 h-8 text-white mx-auto mb-2" />
              <p className="text-sm text-[#555555] mb-3">How are you feeling today?</p>
              <Button size="sm" className="bg-brand hover:bg-brand text-black font-bold text-xs h-8" onClick={handleOpen}>
                <Plus className="w-3 h-3 mr-1" />Log Readiness
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-500" />
              Daily Readiness Check-in
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 mt-1">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-[#a0a0a0] text-[#a0a0a0] flex items-center gap-1.5">
                  <Moon className="w-3.5 h-3.5 text-[#818cf8]" /> Sleep Quality
                </label>
                <span className="text-xs text-[#a0a0a0]">{SLEEP_LABELS[sleep]}</span>
              </div>
              <ScorePicker value={sleep} onChange={setSleep} labels={SLEEP_LABELS} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-[#a0a0a0] text-[#a0a0a0] flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-[#fbbf24]" /> Muscle Soreness
                </label>
                <span className="text-xs text-[#a0a0a0]">{SORENESS_LABELS[soreness]}</span>
              </div>
              <ScorePicker value={soreness} onChange={setSoreness} labels={SORENESS_LABELS} />
              <p className="text-xs text-[#a0a0a0] mt-1">1 = very sore, 5 = completely fresh</p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-[#a0a0a0] text-[#a0a0a0] flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5 text-rose-400" /> Stress Level
                </label>
                <span className="text-xs text-[#a0a0a0]">{STRESS_LABELS[stress]}</span>
              </div>
              <ScorePicker value={stress} onChange={setStress} labels={STRESS_LABELS} />
              <p className="text-xs text-[#a0a0a0] mt-1">1 = very stressed, 5 = completely calm</p>
            </div>
            <div>
              <label className="text-sm font-medium text-[#a0a0a0] text-[#a0a0a0] mb-1 block">Notes (optional)</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., legs still sore from Tuesday..."
                rows={2}
                className="text-sm"
              />
            </div>
            <Button
              className="w-full bg-brand hover:bg-brand text-black font-bold"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving..." : "Save Check-in"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
