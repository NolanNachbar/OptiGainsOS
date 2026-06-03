import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { getTodayString } from "@/utils/dateUtils";

const MUSCLE_GROUPS = [
  "Chest", "Back", "Shoulders", "Arms",
  "Core", "Quads", "Hamstrings", "Calves",
];

const SORENESS_LABELS = ["None", "Mild", "Moderate", "Severe"];
const SORENESS_COLORS = [
  "bg-[#2a2a2a] text-[#555555] border-[#333]",
  "bg-[rgba(234,179,8,0.12)] text-yellow-400 border-yellow-500/30",
  "bg-[rgba(249,115,22,0.12)] text-orange-400 border-orange-500/30",
  "bg-[rgba(239,68,68,0.12)] text-red-400 border-red-500/30",
];

function NumberPicker({ label, value, onChange, min = 1, max = 10 }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-[#555555] uppercase tracking-wider">{label}</span>
      <div className="flex flex-col items-center gap-0.5">
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          className="p-1 text-[#555555] hover:text-brand transition-colors"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <span className="text-3xl font-bold text-white w-12 text-center leading-none">{value}</span>
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          className="p-1 text-[#555555] hover:text-brand transition-colors"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
      <div className="flex gap-0.5 mt-1">
        {Array.from({ length: max }, (_, i) => (
          <div
            key={i}
            className={`h-0.5 w-2 rounded-full transition-colors ${
              i < value ? "bg-brand" : "bg-[#333]"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export default function MorningCheckin({ today, existingCheckin, onComplete }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [energy, setEnergy] = useState(existingCheckin?.energy ?? 7);
  const [mood, setMood] = useState(existingCheckin?.mood ?? 7);
  const [notes, setNotes] = useState(existingCheckin?.notes ?? "");
  const [soreness, setSoreness] = useState(() => {
    if (existingCheckin?.soreness_snapshot) return existingCheckin.soreness_snapshot;
    return Object.fromEntries(MUSCLE_GROUPS.map(g => [g, 0]));
  });

  const todayStr = today || getTodayString();

  const cycleSoreness = (group) => {
    setSoreness(prev => ({ ...prev, [group]: (prev[group] + 1) % 4 }));
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const uid = user.id;

      // Upsert the daily readiness row
      const { error: readinessError } = await supabase
        .from("daily_readiness")
        .upsert({
          created_by: uid,
          date: todayStr,
          checkin_date: todayStr,
          energy,
          mood,
          notes: notes || null,
          soreness_snapshot: soreness,
        }, { onConflict: "created_by,date" });
      if (readinessError) throw readinessError;

      // Upsert per-muscle soreness_logs
      const sorenessRows = MUSCLE_GROUPS
        .filter(g => soreness[g] > 0)
        .map(g => ({
          created_by: uid,
          date: todayStr,
          muscle_group: g,
          level: soreness[g],
        }));

      if (sorenessRows.length > 0) {
        const { error: sorenessError } = await supabase
          .from("soreness_logs")
          .upsert(sorenessRows, { onConflict: "created_by,date,muscle_group" });
        if (sorenessError) throw sorenessError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dailyReadiness", todayStr, user?.id] });
      queryClient.invalidateQueries({ queryKey: ["soreness", todayStr, user?.id] });
      toast.success("Morning check-in saved");
      onComplete?.();
    },
    onError: () => toast.error("Failed to save check-in"),
  });

  if (existingCheckin?.energy) {
    const soreGroups = Object.entries(existingCheckin.soreness_snapshot || {})
      .filter(([_, level]) => level > 0)
      .sort((a, b) => b[1] - a[1]);

    return (
      <div className="rounded-xl bg-charcoal-surface border-charcoal-border shadow-dark-card overflow-hidden">
        <div className="px-4 py-3 border-b border-[#2a2a2a] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-brand" />
            <span className="text-sm font-semibold text-white">Daily Readiness</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => queryClient.setQueryData(["dailyReadiness", todayStr, user?.id], null)}
            className="h-6 text-[10px] text-[#555555] uppercase tracking-wider hover:text-brand"
          >
            Update
          </Button>
        </div>
        <div className="p-4 flex flex-col md:flex-row gap-6">
          <div className="flex gap-8">
            <div className="text-center">
              <div className="text-[10px] text-[#555555] uppercase tracking-widest mb-1">Energy</div>
              <div className="text-2xl font-bold text-white leading-none">{existingCheckin.energy}<span className="text-xs text-[#555555]">/10</span></div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-[#555555] uppercase tracking-widest mb-1">Mood</div>
              <div className="text-2xl font-bold text-white leading-none">{existingCheckin.mood}<span className="text-xs text-[#555555]">/10</span></div>
            </div>
          </div>

          <div className="flex-1">
            <div className="text-[10px] text-[#555555] uppercase tracking-widest mb-2">Today's Soreness</div>
            {soreGroups.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {soreGroups.map(([group, level]) => (
                  <div
                    key={group}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${SORENESS_COLORS[level]}`}
                  >
                    {group.toUpperCase()} {SORENESS_LABELS[level].toUpperCase()}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#555555]">All systems fresh. Ready to push.</p>
            )}
          </div>
        </div>
        {existingCheckin.notes && (
          <div className="px-4 pb-4">
            <p className="text-xs text-[#a0a0a0] italic border-l-2 border-[#2a2a2a] pl-3">"{existingCheckin.notes}"</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-charcoal-surface border-charcoal-border shadow-dark-card p-4">
      <h3 className="text-sm font-semibold text-white mb-4">Morning Check-in</h3>

      {/* Energy + Mood */}
      <div className="flex justify-around mb-5">
        <NumberPicker label="Energy" value={energy} onChange={setEnergy} />
        <div className="w-px bg-[#2a2a2a]" />
        <NumberPicker label="Mood" value={mood} onChange={setMood} />
      </div>

      {/* Muscle soreness */}
      <div className="mb-4">
        <p className="text-xs text-[#555555] uppercase tracking-wider mb-2">Soreness — tap to cycle</p>
        <div className="grid grid-cols-4 gap-1.5">
          {MUSCLE_GROUPS.map(group => (
            <button
              key={group}
              onClick={() => cycleSoreness(group)}
              className={`text-xs font-medium py-1.5 px-1 rounded-lg border transition-all ${SORENESS_COLORS[soreness[group]]}`}
            >
              <span className="block truncate">{group}</span>
              <span className="block text-[10px] opacity-70 mt-0.5">{SORENESS_LABELS[soreness[group]]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Anything notable going into today?"
        rows={2}
        className="mb-3 text-sm resize-none"
      />

      <Button
        variant="volt"
        className="w-full"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? "Saving…" : "Check In"}
      </Button>
    </div>
  );
}
