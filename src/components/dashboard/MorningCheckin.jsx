import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile, useSetEquipmentProfile } from "@/hooks/useUserQueries";
import { useLogWeight, useTodayBodyWeight } from "@/hooks/useWeighIn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronUp, ChevronDown } from "lucide-react";
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
  // Levels 1-3 ride the physiological spectrum (soreness is a biometric). Level
  // 1 ("Mild") is the benign low end, so it reads ok-green, NOT the fat data
  // hue (fat is a macro datum, never a soreness band) — the spectrum runs
  // ok → warn → bad as severity climbs (today-1).
  "bg-ok/[0.12] text-ok border-ok/30",
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
          className="h-11 w-11 flex items-center justify-center text-muted-2 hover:text-brand transition-colors duration-200 [transition-timing-function:var(--ease)]"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <span className="hero-metric text-3xl text-ink w-12 text-center">{value}</span>
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          className="h-11 w-11 flex items-center justify-center text-muted-2 hover:text-brand transition-colors duration-200 [transition-timing-function:var(--ease)]"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
      <div className="flex gap-0.5 mt-1">
        {Array.from({ length: max }, (_, i) => (
          <div
            key={i}
            // Filled ticks read as NEUTRAL ink, not brand teal: Energy/Mood are
            // subjective self-report data (not the page action and not a
            // biometric-spectrum readout), so the level meter must not spend the
            // single teal action color. Empty ticks stay on the shared track.
            className={`h-0.5 w-2 rounded-full transition-colors duration-200 [transition-timing-function:var(--ease)] ${
              i < value ? "bg-ink-secondary" : "bg-track"
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

  // When editing an existing check-in, drop the read-only summary and show the
  // form (already seeded from existingCheckin below). Previously "Update" nulled
  // the cache, so the reopened form fell back to defaults and overwrote the saved
  // energy/mood/soreness on the next save.
  const [editing, setEditing] = useState(false);

  const [energy, setEnergy] = useState(existingCheckin?.energy ?? 7);
  const [mood, setMood] = useState(existingCheckin?.mood ?? 7);
  const [notes, setNotes] = useState(existingCheckin?.notes ?? "");
  const [soreness, setSoreness] = useState(() => {
    if (existingCheckin?.soreness_snapshot) return existingCheckin.soreness_snapshot;
    return Object.fromEntries(MUSCLE_GROUPS.map(g => [g, 0]));
  });

  const todayStr = today || getTodayString();

  // Weigh-in rides the check-in: one pre-session stop collects readiness AND
  // bodyweight, so the engine's weight trend gets a reading on every training
  // day without a second modal. Optional — an empty field writes nothing and
  // never blocks starting the session.
  const { profile } = useProfile();
  const { todayWeight } = useTodayBodyWeight(todayStr);
  const logWeight = useLogWeight();
  const setEquipmentProfile = useSetEquipmentProfile();
  const equipmentProfile = profile?.equipment_profile || "full_gym";
  const toggleEquipmentProfile = () => {
    setEquipmentProfile.mutate({
      profile,
      equipmentProfile: equipmentProfile === "casper" ? "full_gym" : "casper",
    });
  };
  const weightUnit = profile?.weight_unit || "lbs";
  const [typedWeight, setTypedWeight] = useState(null);
  // Derived, not synced by effect: until the athlete types, the field mirrors
  // today's logged entry (arriving async), so re-opening the check-in shows the
  // weight already on record rather than an empty box that reads as "not done".
  const weight = typedWeight ?? (todayWeight?.weight != null ? String(todayWeight.weight) : "");

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

      // Weight goes last and swallows its own failure: readiness is already
      // committed by this point, so a weigh-in error must not report the
      // check-in as failed (or block the athlete from starting the session).
      const raw = String(weight).trim();
      if (raw !== "") {
        const parsed = parseFloat(raw);
        // Junk in the field reports back as a failed weigh-in rather than a
        // silent no-op that toasts plain success.
        if (!(parsed > 0)) return { weightFailed: true };
        // parseFloat both sides: numeric columns can come back as strings, and a
        // string/number compare would re-write an unchanged weight every save.
        if (parsed !== parseFloat(todayWeight?.weight)) {
          try {
            await logWeight.mutateAsync({ weight: parsed, date: todayStr });
          } catch {
            return { weightFailed: true };
          }
        }
      }
      return { weightFailed: false };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["dailyReadiness", todayStr, user?.id] });
      queryClient.invalidateQueries({ queryKey: ["soreness", todayStr, user?.id] });
      if (result?.weightFailed) toast.warning("Check-in saved, weight didn't log");
      else toast.success("Morning check-in saved");
      setEditing(false);
      onComplete?.();
    },
    onError: () => toast.error("Failed to save check-in"),
  });

  // Readiness already logged but no weigh-in yet — the completed card asks for
  // the weight on its own, so the pre-session gate can still collect it without
  // making him redo energy/mood/soreness.
  const saveWeightOnly = async () => {
    const parsed = parseFloat(String(weight).trim());
    if (!(parsed > 0)) {
      toast.error("Enter a valid weight");
      return;
    }
    try {
      await logWeight.mutateAsync({ weight: parsed, date: todayStr });
      toast.success("Weight logged");
      onComplete?.();
    } catch {
      toast.error("Failed to log weight");
    }
  };

  if (existingCheckin?.energy && !editing) {
    const soreGroups = Object.entries(existingCheckin.soreness_snapshot || {})
      .filter(([, level]) => level > 0)
      .sort((a, b) => b[1] - a[1]);

    return (
      <div className="glass overflow-hidden">
        <div className="px-4 py-3 border-b hairline flex items-center justify-between">
          {/* Completed confirmation lives in ink hierarchy, not a green check:
              the leaf/green check poached the biometric spectrum to decorate a
              chrome "done" state. The label leads (primary ink), a faint "Logged"
              caption carries the confirmation (today-4). */}
          <div className="flex items-baseline gap-2">
            {/* Retitled off 'Daily Readiness' so it never collides with the
                Today ring's 'READINESS' micro-label, this is the SUBJECTIVE
                self-report, distinct from the objective readiness score. */}
            <span className="section-label !text-ink">Subjective check-in</span>
            <span className="text-[10px] font-semibold text-faint uppercase tracking-wider">Logged</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Quiet, out-of-the-way equipment toggle — not a checkin field, just
                rides here so it's visible once a day without its own settings
                trip. Only shows when it differs from full_gym or is mid-toggle,
                so the common case (home, full gym) stays silent. */}
            {equipmentProfile === "casper" && (
              <button
                type="button"
                onClick={toggleEquipmentProfile}
                disabled={setEquipmentProfile.isPending}
                className="min-h-[44px] -my-2.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-warn hover:text-ink transition-colors duration-200 [transition-timing-function:var(--ease)]"
              >
                {setEquipmentProfile.isPending ? "Rebuilding…" : "Casper mode · tap for full gym"}
              </button>
            )}
            {/* 'Update' is a quiet re-entry affordance on a completed card, not a
                primary action: borderless quiet text (no ghost button chrome) so
                it reads as a tap-to-edit link, not a competing control (today-3). */}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="min-h-[44px] -my-2.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-secondary hover:text-ink transition-colors duration-200 [transition-timing-function:var(--ease)]"
            >
              Update
            </button>
          </div>
        </div>
        <div className="p-4 flex flex-col md:flex-row gap-6">
          <div className="flex gap-8">
            <div className="text-center">
              <div className="text-[9.5px] font-bold text-muted-2 uppercase tracking-[0.08em] mb-1">Energy</div>
              <div className="hero-metric text-2xl text-ink">{existingCheckin.energy}<span className="text-xs font-semibold text-muted-2">/10</span></div>
            </div>
            <div className="text-center">
              <div className="text-[9.5px] font-bold text-muted-2 uppercase tracking-[0.08em] mb-1">Mood</div>
              <div className="hero-metric text-2xl text-ink">{existingCheckin.mood}<span className="text-xs font-semibold text-muted-2">/10</span></div>
            </div>
            {todayWeight?.weight != null && (
              <div className="text-center">
                <div className="text-[9.5px] font-bold text-muted-2 uppercase tracking-[0.08em] mb-1">Weight</div>
                <div className="hero-metric text-2xl text-ink tabular-nums">
                  {todayWeight.weight}<span className="text-xs font-semibold text-muted-2"> {weightUnit}</span>
                </div>
              </div>
            )}
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
        {todayWeight?.weight == null && (
          <div className="px-4 pb-4">
            <p className="section-label mb-2">Weigh-in</p>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  type="text"
                  inputMode="decimal"
                  step="0.1"
                  enterKeyHint="done"
                  placeholder={profile?.current_weight != null ? String(profile.current_weight) : "--"}
                  value={weight}
                  onChange={(e) => setTypedWeight(e.target.value)}
                  className="type-display tabular-nums text-xl h-12 pr-11"
                  aria-label={`Bodyweight in ${weightUnit}`}
                />
                <span
                  className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] font-medium text-ink-faint"
                  aria-hidden="true"
                >
                  {weightUnit}
                </span>
              </div>
              <Button
                variant={coralCta ? "volt" : "ghost"}
                size="lg"
                onClick={saveWeightOnly}
                disabled={logWeight.isPending || !weight}
              >
                {logWeight.isPending ? "Saving…" : "Log"}
              </Button>
            </div>
          </div>
        )}
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

      {/* Weigh-in — quiet, optional, and inline. Not a NumberPicker: bodyweight
          is a measured decimal, not a 1-10 self-report. */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="section-label">Weigh-in</p>
          <p className="text-[10px] font-semibold text-faint mt-0.5">
            {todayWeight?.weight != null
              ? `Logged today: ${todayWeight.weight} ${weightUnit}`
              : profile?.current_weight != null
                ? `Last: ${profile.current_weight} ${weightUnit}`
                : "Optional"}
          </p>
        </div>
        <div className="relative w-32">
          <Input
            type="text"
            inputMode="decimal"
            step="0.1"
            enterKeyHint="done"
            placeholder="--"
            value={weight}
            onChange={(e) => setTypedWeight(e.target.value)}
            className="type-display tabular-nums text-xl h-12 pr-11 text-right"
            aria-label={`Bodyweight in ${weightUnit}`}
          />
          <span
            className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] font-medium text-ink-faint"
            aria-hidden="true"
          >
            {weightUnit}
          </span>
        </div>
      </div>

      {/* Muscle soreness */}
      <div className="mb-4">
        <p className="section-label mb-2">Soreness, tap to cycle</p>
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

      {/* Equipment — quiet, not a checkin field. No-gym mode (Casper etc.) swaps
          the engine's exercise pool for that day's equipment. Text link, same
          weight as "Update" above — this isn't a decision that needs a slot in
          the visual hierarchy every day. */}
      <button
        type="button"
        onClick={toggleEquipmentProfile}
        disabled={setEquipmentProfile.isPending}
        className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-faint hover:text-secondary transition-colors duration-200 [transition-timing-function:var(--ease)]"
      >
        {/* The tap now waits on a real engine run (~60-90s), not a column write,
            so say so — a control that sits dead for a minute otherwise reads as
            broken and gets tapped again. */}
        {setEquipmentProfile.isPending
          ? "Rebuilding today's session…"
          : equipmentProfile === "casper"
            ? "Casper mode (limited equipment) · tap for full gym"
            : "Full gym · tap for Casper mode"}
      </button>

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
