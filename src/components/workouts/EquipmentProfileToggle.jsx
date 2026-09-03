// EquipmentProfileToggle — set the location's equipment from inside a workout.
//
// The toggle already existed on the morning check-in, which covers the day the
// engine planned. It didn't cover a workout run from the library, so a Casper
// day started from the library listed lifts there's no rack or cable for.
//
// Writing goes through useSetEquipmentProfile, the same mutation the check-in
// uses, so the column has one writer and the background replan still fires for
// today's engine session. The substitution on screen is local and immediate:
// the replan doesn't touch a library workout, and waiting 60-90s to see a swap
// he can already read off the list would make the control feel broken.
import { Dumbbell, Loader2 } from "lucide-react";
import { useProfile, useSetEquipmentProfile } from "@/hooks/useUserQueries";

export default function EquipmentProfileToggle({ swaps = [] }) {
  const { profile } = useProfile();
  const setEquipmentProfile = useSetEquipmentProfile();
  const current = profile?.equipment_profile || "full_gym";
  const isCasper = current === "casper";

  const toggle = () => {
    if (setEquipmentProfile.isPending || !profile?.id) return;
    setEquipmentProfile.mutate({
      profile,
      equipmentProfile: isCasper ? "full_gym" : "casper",
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={isCasper}
        disabled={setEquipmentProfile.isPending || !profile?.id}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold border transition-colors disabled:opacity-60 ${
          isCasper
            ? "bg-brand/[0.16] border-brand/40 text-brand"
            : "border-charcoal-border text-ink-muted hover:border-brand/30 hover:text-ink"
        }`}
      >
        {setEquipmentProfile.isPending
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <Dumbbell className="w-3.5 h-3.5" />}
        {isCasper ? "Casper" : "Full gym"}
      </button>
      {isCasper && swaps.length > 0 && (
        <span className="text-[11px] font-semibold text-ink-muted">
          {swaps.length} swapped: {swaps.map((s) => `${s.from} → ${s.to}`).join(", ")}
        </span>
      )}
    </div>
  );
}
