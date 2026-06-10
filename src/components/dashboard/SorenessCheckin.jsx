import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getTodayString } from "@/utils/dateUtils";
import { CheckCircle2 } from "lucide-react";

const MUSCLE_GROUPS = [
  "quads", "hamstrings", "glutes", "chest",
  "back", "shoulders", "biceps", "triceps", "calves", "abs",
  "neck", "traps",
];

const LEVEL_LABELS = ["None", "Mild", "Mod", "Severe"];
const LEVEL_COLORS = [
  "bg-white/[0.05] text-muted-2 border-white/10",
  "bg-fat/[0.12] text-fat border-fat/30",
  "bg-warn/[0.12] text-warn border-warn/30",
  "bg-bad/[0.12] text-bad border-bad/30",
];

export default function SorenessCheckin({ today }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const todayStr = today || getTodayString();

  // Check if already logged today
  const { data: existing, isLoading } = useQuery({
    queryKey: ["soreness-checkin", todayStr, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("soreness_logs")
        .select("*")
        .eq("created_by", user.id)
        .eq("date", todayStr);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const alreadyLogged = existing && existing.length > 0;

  const [levels, setLevels] = useState(() =>
    Object.fromEntries(MUSCLE_GROUPS.map(g => [g, 0]))
  );

  const cycleMuscle = (muscle) => {
    setLevels(prev => ({ ...prev, [muscle]: (prev[muscle] + 1) % 4 }));
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const rows = MUSCLE_GROUPS
          .filter(g => levels[g] > 0)
          .map(g => ({
            created_by: user.id,
            date: todayStr,
            muscle_group: g,
            level: levels[g],
          }));
      if (rows.length === 0) return;
      const { error } = await supabase
          .from("soreness_logs")
          .upsert(rows, { onConflict: "created_by,date,muscle_group" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["soreness-checkin", todayStr, user?.id] });
      toast.success("Soreness logged");
    },
    onError: () => toast.error("Failed to log soreness"),
  });

  if (isLoading) return null;

  if (alreadyLogged) {
    const sore = existing.filter(r => r.level > 0).sort((a, b) => b.level - a.level);
    return (
      <div className="glass px-4 pt-3.5 pb-3.5">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 className="w-4 h-4 text-leaf" />
          <span className="section-label !text-ink">Soreness Logged</span>
        </div>
        {sore.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {sore.map(r => (
              <span
                key={r.muscle_group}
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border-[0.5px] ${LEVEL_COLORS[r.level]}`}
              >
                {r.muscle_group.toUpperCase()} · {LEVEL_LABELS[r.level].toUpperCase()}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs font-semibold text-muted-2">No soreness reported today.</p>
        )}
      </div>
    );
  }

  return (
    <div className="glass p-4">
      <p className="text-sm font-extrabold text-ink mb-3">Soreness Check-in — tap to cycle</p>
      <div className="grid grid-cols-5 gap-1.5 mb-4">
        {MUSCLE_GROUPS.map(muscle => (
          <button
            key={muscle}
            onClick={() => cycleMuscle(muscle)}
            className={`text-xs font-bold py-1.5 px-1 rounded-lg border-[0.5px] transition-all ${LEVEL_COLORS[levels[muscle]]}`}
          >
            <span className="block truncate capitalize">{muscle}</span>
            <span className="block text-[10px] opacity-70 mt-0.5">{LEVEL_LABELS[levels[muscle]]}</span>
          </button>
        ))}
      </div>
      <Button
        variant="energy"
        size="sm"
        className="w-full"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? "Saving…" : "Log Soreness"}
      </Button>
    </div>
  );
}
