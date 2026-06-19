import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { BatteryLow, Check } from "lucide-react";

// Manual recovery escape valve (cut only). Tapping it logs a per-day override the
// engine reads on its next run, easing the deficit ~35% and adding carbs back for
// the day. Coarse and deliberate — for a genuinely rough day, not daily use.
export default function EaseTodayButton() {
  const { user } = useAuth();
  const [isCut, setIsCut] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data: prof } = await supabase.from("user_profiles")
      .select("diet_phase").eq("created_by", user.id).maybeSingle();
    setIsCut((prof?.diet_phase || "") === "cut");
    const { data: ov } = await supabase.from("nutrition_overrides")
      .select("action").eq("created_by", user.id).eq("date", today).maybeSingle();
    if (ov?.action === "ease") setDone(true);
  }, [user, today]);

  useEffect(() => { load(); }, [load]);

  if (!isCut) return null;

  const ease = async () => {
    setBusy(true);
    const { error } = await supabase.from("nutrition_overrides")
      .upsert({ created_by: user.id, date: today, action: "ease" },
              { onConflict: "created_by,date" });
    setBusy(false);
    if (!error) setDone(true);
  };

  if (done) {
    return (
      <div className="flex items-center gap-1.5 text-xs font-semibold text-leaf px-1">
        <Check className="w-3.5 h-3.5" /> Easing today's deficit — carbs added back. Recalcs on the next engine run.
      </div>
    );
  }

  return (
    <Button variant="dim" size="sm" onClick={ease} disabled={busy}
      className="min-h-[44px] px-3 text-xs hover:text-warn">
      <BatteryLow className="w-3.5 h-3.5 mr-1.5" /> I'm wrecked — ease today's deficit
    </Button>
  );
}
