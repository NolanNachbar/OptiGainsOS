import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Flame, Check } from "lucide-react";

// Manual deficit override (cut only). When the engine has EASED today's deficit on
// its own (a main lift looked like it was regressing, a recovery crash, etc.) it
// surfaces that as its primary call here — with the option to overrule it and hold
// the full "hard" deficit. Tapping it logs a per-day override the engine reads on
// its next run. Mirrors EaseTodayButton (the opposite valve). The 4-6 week duration
// cap is a health safety and is intentionally NOT overridable, so we never offer the
// override when that's the reason calories went up.
const OVERRIDABLE_EASE_GATES = ["strength_dropping", "manual_ease", "recovery_crash"];

export default function HoldDeficitButton() {
  const { user } = useAuth();
  const [isCut, setIsCut] = useState(false);
  const [rec, setRec] = useState(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data: prof } = await supabase.from("user_profiles")
      .select("diet_phase").eq("created_by", user.id).maybeSingle();
    setIsCut((prof?.diet_phase || "") === "cut");

    const { data: state } = await supabase.from("athlete_state")
      .select("nutrition").eq("created_by", user.id).eq("date", today).maybeSingle();
    setRec(state?.nutrition?.recommended_intake || null);

    const { data: ov } = await supabase.from("nutrition_overrides")
      .select("action").eq("created_by", user.id).eq("date", today).maybeSingle();
    if (ov?.action === "push") setDone(true);
  }, [user, today]);

  useEffect(() => { load(); }, [load]);

  const gates = rec?.gates || [];
  const eased = gates.some((g) => OVERRIDABLE_EASE_GATES.includes(g));
  // Only meaningful on a cut where the engine actually eased today's deficit.
  if (!isCut || !eased) return null;

  const hold = async () => {
    setBusy(true);
    const { error } = await supabase.from("nutrition_overrides")
      .upsert({ created_by: user.id, date: today, action: "push" },
              { onConflict: "created_by,date" });
    setBusy(false);
    if (!error) setDone(true);
  };

  if (done) {
    return (
      <div className="flex items-center gap-1.5 text-xs font-semibold text-leaf px-1">
        <Check className="w-3.5 h-3.5" /> Holding the hard deficit — recalcs on the next engine run.
      </div>
    );
  }

  return (
    <div className="text-xs text-ink-muted px-1 space-y-1.5">
      <p>
        The engine eased today's deficit to <span className="font-semibold text-ink">{rec?.calorie_target} kcal</span>
        {" "}(recovery cushion). That's its recommendation — but you can overrule it.
      </p>
      <Button variant="dim" size="sm" onClick={hold} disabled={busy}
        className="h-8 px-3 text-xs hover:text-warn">
        <Flame className="w-3.5 h-3.5 mr-1.5" /> Hold the hard deficit instead
      </Button>
    </div>
  );
}
