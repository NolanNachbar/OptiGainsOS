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
  "Neck", "Traps",
];

const SORENESS_LABELS = ["None", "Mild", "Moderate", "Severe"];
const SORENESS_COLORS = [
  // "None" — neutral, but with a faint surface fill + visible border so an empty
  // pill reads as a tappable cycler with a value, not an inert unselected tag.
  "bg-track/60 text-muted-2 border-charcoal-border",
  // Levels 1-3 ride the physiological spectrum (soreness is a biometric).
  "bg-fat/[0.12] text-fat border-fat/30",
  "bg-warn/[0.12] text-warn border-warn/30",
  "bg-bad/[0.12] text-bad border-bad/30",
];

function NumberPicker({ label, value, onChange, min = 1, max = 10 }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[9.5px] font-bold text-muted-2 uppercase tracking-[0.08em]">{label}</span>
      <div className="flex flex-col items-center">
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          className="h-11 w-11 flex items-center justify-center text-muted-2 hover:text-brand transition-colors"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <span className="font-technical text-3xl font-extrabold text-ink w-12 text-center leading-none">{value}</span>
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          className="h-11 w-11 flex items-center justify-center text-muted-2 hover:text-brand transition-colors"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
      <div className="flex gap-0.5 mt-1">
        {Array.from({ length: max }, (_, i) => (
          <div
            key={i}
            className={`h-0.5 w-2 rounded-full transition-colors ${
              i < value ? "bg-teal" : "bg-track"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export default function MorningCheckin({ today, existingCheckin, onComplete, coralCta = true }) {
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

      // Upsert per-muscle soreness_logs. The daily prescriber matches these
      // rows (lowercased) against exercise primary muscles — "Arms"/"Core"
      // would never match, so expand check-in regions to the engine's muscle
      // vocabulary (same expansion the weekly program applies to the snapshot).
      const REGION_TO_MUSCLES = {
        Chest: ["chest"], Back: ["back"], Shoulders: ["shoulders"],
        Arms: ["biceps", "triceps"], Core: ["abs"],
        Quads: ["quads"], Hamstrings: ["hamstrings"], Calves: ["calves"],
        Neck: ["neck"], Traps: ["traps"],
      };
      const sorenessRows = MUSCLE_GROUPS
        .filter(g => soreness[g] > 0)
        .flatMap(g => (REGION_TO_MUSCLES[g] || [g.toLowerCase()]).map(muscle => ({
          created_by: uid,
          date: todayStr,
          muscle_group: muscle,
          level: soreness[g],
        })));

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
      .filter(([, level]) => level > 0)
      .sort((a, b) => b[1] - a[1]);

    return (
      <div className="glass overflow-hidden">
        <div className="px-4 py-3 border-b hairline flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-leaf" />
            {/* Retitled off 'Daily Readiness' so it never collides with the
                Today ring's 'READINESS' micro-label — this is the SUBJECTIVE
                self-report, distinct from the objective readiness score. */}
            <span className="section-label !text-ink">Subjective check-in</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => queryClient.setQueryData(["dailyReadiness", todayStr, user?.id], null)}
            className="min-h-[44px] -my-2.5 text-[10px] uppercase tracking-wider"
          >
            Update
          </Button>
        </div>
        <div className="p-4 flex flex-col md:flex-row gap-6">
          <div className="flex gap-8">
            <div className="text-center">
              <div className="text-[9.5px] font-bold text-muted-2 uppercase tracking-[0.08em] mb-1">Energy</div>
              <div className="font-technical text-2xl font-extrabold text-ink leading-none">{existingCheckin.energy}<span className="text-xs font-semibold text-muted-2">/10</span></div>
            </div>
            <div className="text-center">
              <div className="text-[9.5px] font-bold text-muted-2 uppercase tracking-[0.08em] mb-1">Mood</div>
              <div className="font-technical text-2xl font-extrabold text-ink leading-none">{existingCheckin.mood}<span className="text-xs font-semibold text-muted-2">/10</span></div>
            </div>
          </div>

          <div className="flex-1">
            <div className="text-[9.5px] font-bold text-muted-2 uppercase tracking-[0.08em] mb-2">Today's Soreness</div>
            {soreGroups.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {soreGroups.map(([group, level]) => (
                  <div
                    key={group}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border-[0.5px] ${SORENESS_COLORS[level]}`}
                  >
                    {group.toUpperCase()} {SORENESS_LABELS[level].toUpperCase()}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs font-semibold text-muted-2">All systems fresh. Ready to push.</p>
            )}
          </div>
        </div>
        {existingCheckin.notes && (
          <div className="px-4 pb-4">
            <p className="text-xs font-semibold text-muted-2 italic border-l-2 hairline pl-3">"{existingCheckin.notes}"</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="glass p-4">
      {/* Energy + Mood */}
      <div className="flex justify-around mb-5">
        <NumberPicker label="Energy" value={energy} onChange={setEnergy} />
        <div className="w-px border-l hairline" />
        <NumberPicker label="Mood" value={mood} onChange={setMood} />
      </div>

      {/* Muscle soreness */}
      <div className="mb-4">
        <p className="section-label mb-2">Soreness — tap to cycle</p>
        <div className="grid grid-cols-3 gap-1.5">
          {MUSCLE_GROUPS.map(group => (
            <button
              key={group}
              onClick={() => cycleSoreness(group)}
              style={{ transition: "background-color .2s var(--ease), border-color .2s var(--ease), color .2s var(--ease)" }}
              className={`text-xs font-bold min-h-[44px] flex flex-col items-center justify-center px-1 rounded-lg border-[0.5px] ${SORENESS_COLORS[soreness[group]]}`}
            >
              <span className="block truncate">{group}</span>
              <span className="block text-[10.5px] font-semibold opacity-100 mt-0.5">{SORENESS_LABELS[soreness[group]]}</span>
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

      {/* CORAL DISCIPLINE — standalone the check-in owns the coral primary, but
          when embedded under Today's coral "Begin Session" the host passes
          coralCta={false} so this renders neutral (ghost) and coral stays single. */}
      {/* mt-1 + scroll-mb give the primary action a small gap so it never sits
          flush against the bottom dock blur when this form is embedded on Today
          (the page scroll container clears the dock; the form carries its own
          breathing room for a premium feel). */}
      <Button
        variant={coralCta ? "volt" : "ghost"}
        size="lg"
        className="w-full mt-1 scroll-mb-4"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? "Saving…" : "Check In"}
      </Button>
    </div>
  );
}
