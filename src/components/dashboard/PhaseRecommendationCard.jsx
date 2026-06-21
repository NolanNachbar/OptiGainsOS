import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Check, X, Brain, Camera } from "lucide-react";
import { Link } from "react-router-dom";

// The engine's coaching call on cut / maintain / bulk. Advisory — accept applies
// it to your diet phase, reject dismisses. Reads athlete_state.nutrition.phase_recommendation.
export default function PhaseRecommendationCard() {
  const { user } = useAuth();
  const [rec, setRec] = useState(null);
  const [currentPhase, setCurrentPhase] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [applied, setApplied] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("athlete_state").select("nutrition")
      .eq("created_by", user.id).eq("date", today).limit(1).maybeSingle();
    const r = data?.nutrition?.phase_recommendation;
    if (r) { setRec(r); setCurrentPhase(r.current_phase); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  if (!rec || dismissed) return null;

  const accept = async () => {
    setBusy(true);
    // Write to diet_phase (cut/maintain/bulk) — NOT training_phase, which holds
    // the tactical/training focus. The engine reads diet_phase for the diet math.
    const { error } = await supabase.from("user_profiles")
      .update({ diet_phase: rec.phase }).eq("created_by", user.id);
    setBusy(false);
    if (!error) { setApplied(true); setCurrentPhase(rec.phase); }
  };

  const samePhase = currentPhase && currentPhase === rec.phase;
  const confColor = rec.confidence === "high" ? "text-teal"
    : rec.confidence === "low" ? "text-warn" : "text-muted-2";

  return (
    <div className="glass p-4">
      <div className="flex items-center gap-2 mb-1">
        <Brain className="w-3.5 h-3.5 text-gold" />
        <span className="section-label">Coach: diet phase</span>
        <span className={`font-technical text-[10px] font-bold ml-auto ${confColor}`}>{rec.confidence} confidence</span>
      </div>

      <div className="type-display text-lg">
        {applied || samePhase ? "Phase: " : "Recommended: "}
        <span className="text-gold uppercase">{rec.phase}</span>
        {currentPhase && currentPhase !== rec.phase && !applied && (
          <span className="text-xs font-semibold text-muted-2"> (now: {currentPhase})</span>
        )}
      </div>
      {rec.reverse_diet && (
        <div className="mt-1 inline-block px-2 py-0.5 rounded-full bg-warn/10 text-warn text-[10px] font-bold uppercase tracking-wide">
          End the cut · reverse diet
        </div>
      )}
      <p className="mt-1 text-sm font-semibold text-secondary">{rec.rationale}</p>

      {rec.needs_photo && (
        <Link to="/physique" className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-brand">
          <Camera className="w-3.5 h-3.5" /> Upload a physique photo to refine this
        </Link>
      )}

      {!applied && !samePhase && (
        <div className="mt-3 flex gap-2">
          <Button variant="volt" size="sm" className="min-h-[44px] px-3 text-xs" onClick={accept} disabled={busy}>
            <Check className="w-3.5 h-3.5 mr-1" /> Accept ({rec.phase})
          </Button>
          <Button variant="dim" size="sm" className="min-h-[44px] px-3 text-xs" onClick={() => setDismissed(true)}>
            <X className="w-3.5 h-3.5 mr-1" /> Keep {currentPhase || "current"}
          </Button>
        </div>
      )}
      {applied && (
        <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-leaf">
          <Check className="w-3.5 h-3.5" /> Applied, diet now targets a {rec.phase}
        </div>
      )}
      {samePhase && !applied && (
        <div className="mt-2 text-xs font-semibold text-muted-2">Already on this phase.</div>
      )}
    </div>
  );
}
