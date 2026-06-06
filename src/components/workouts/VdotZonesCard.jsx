import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Footprints, Target } from "lucide-react";

// Surfaces the engine's pre-computed VDOT pace zones (athlete_state.vdot_zones)
// on run/cardio session views. The engine writes min/mile paces per zone plus
// the polarized weekly split and the VDOT gap to the goal (BUD/S PST).
const ZONES = [
  { key: "recovery_pace", label: "Recovery", hint: "Z1 — run by HR, let pace fall where it must", color: "text-sky-400" },
  { key: "easy_pace", label: "Easy", hint: "Z2 — 80% of weekly volume", color: "text-emerald-400" },
  { key: "threshold_pace", label: "Threshold", hint: "Z3 — comfortably hard / tempo", color: "text-amber-400" },
  { key: "interval_pace", label: "Interval", hint: "Z4 — VO₂max repeats", color: "text-rose-400" },
];

export default function VdotZonesCard({ className = "" }) {
  const { user } = useAuth();

  const { data: zones } = useQuery({
    queryKey: ["vdot-zones", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("athlete_state")
        .select("vdot_zones, date")
        .eq("created_by", user.id)
        .not("vdot_zones", "is", null)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.vdot_zones || null;
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
  });

  if (!zones) return null;

  return (
    <Card className={`glass glass-interactive ${className}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Footprints className="w-4 h-4 text-brand" />
          <span className="text-sm font-semibold text-white">Run Pace Zones</span>
          <span className="ml-auto text-[10px] text-slate-500 uppercase tracking-wider font-bold">
            {zones.weekly_split || "VDOT zones"}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {ZONES.map((z) => (
            <div key={z.key} title={z.hint} className="text-center">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">{z.label}</div>
              <div className={`text-lg font-technical ${z.color}`}>{zones[z.key] || "—"}</div>
              <div className="text-[9px] text-slate-600">/mi</div>
            </div>
          ))}
        </div>

        {(zones.current_vdot != null || zones.target_vdot != null) && (
          <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-white/5 text-[11px] text-slate-400">
            <Target className="w-3.5 h-3.5 text-brand" />
            VDOT <span className="font-technical text-white">{zones.current_vdot}</span>
            {zones.target_vdot != null && (
              <>
                <span className="text-slate-600">→</span>
                <span className="font-technical text-brand">{zones.target_vdot}</span>
                <span className="text-slate-600">target</span>
                {zones.vdot_gap != null && <span className="text-slate-600">({zones.vdot_gap} to go)</span>}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
