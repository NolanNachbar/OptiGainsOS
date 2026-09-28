import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useUserQueries";
import { useDietPhase } from "@/hooks/useDietPhase";
import { invalidateDietPhases, invalidateProfile } from "@/lib/queryKeys";

// The diet phase picker (Nolan's call, 2026-09-27): Cut / Maintain / Bulk, with
// the engine computing the numbers for each. The phase lives in two places and
// both have to move together:
//   - user_profiles.diet_phase is what compute_athlete_state.py reads for the
//     calorie math (cut / maintain / bulk).
//   - diet_phases (the open row) is what useDailyTargets reads for the cut macro
//     rules and what the engine reads for the cut's age (the 4-6 week cap).
// Re-picking the phase he is already in changes nothing, so it can't reset the
// cut clock. Picking a phase also drops any hand-typed ("Custom") target from
// today on, otherwise the manual number keeps winning over the phase he chose.
export const PHASE_TO_ENGINE = { cut: "cut", maintain: "maintenance", bulk: "bulk" };
export const ENGINE_TO_PHASE = { cut: "cut", maintenance: "maintain", maintain: "maintain", bulk: "bulk" };

export function useSetDietPhase(today) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { activePhase } = useDietPhase();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (phase) => {
      if (!PHASE_TO_ENGINE[phase]) throw new Error(`Unknown phase ${phase}`);

      // Release manual targets from today on. Only the manual fields: the same
      // row can carry forced foods and swaps, which stay.
      const { error: ovErr } = await supabase.from("nutrition_overrides")
        .update({ action: "none", manual_calorie_target: null, manual_protein_g: null })
        .eq("created_by", user.id).eq("action", "manual").gte("date", today);
      if (ovErr) throw ovErr;

      if (profile?.diet_phase !== phase) {
        const { error } = await supabase.from("user_profiles")
          .update({ diet_phase: phase }).eq("created_by", user.id);
        if (error) throw error;
      }

      if ((activePhase?.phase_type || "") !== phase) {
        if (activePhase) {
          const { error } = await supabase.from("diet_phases")
            .update({ end_date: today }).eq("id", activePhase.id);
          if (error) throw error;
        }
        const { error } = await supabase.from("diet_phases").insert({
          created_by: user.id, phase_type: phase, start_date: today,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidateProfile(qc);
      invalidateDietPhases(qc);
      qc.invalidateQueries({ queryKey: ["day-plan-context"] });
      qc.invalidateQueries({ queryKey: ["nutrition-override"] });
      qc.invalidateQueries({ queryKey: ["athlete-state-nutrition"] });
    },
  });
}

// The engine's intake for the phase he has picked. athlete_state is computed
// overnight, so right after a pick the stored recommended_intake still reflects
// the old phase; phase_options carries the engine's number for every phase, so
// the pick shows up immediately. Before the first engine run that writes
// phase_options there is nothing to switch to, so it returns the stored rec with
// pending: true and the caller says the new numbers land after tonight's run.
export function intakeForPhase(nutrition, phase) {
  const rec = nutrition?.recommended_intake || null;
  const want = PHASE_TO_ENGINE[phase];
  if (!nutrition || !want || nutrition.phase === want) return { rec, pending: false };
  const opt = nutrition.phase_options?.[want];
  if (!opt) return { rec, pending: true };
  // The chosen phase's numbers and explanation; the live phase's gates don't
  // describe it.
  return { rec: { ...rec, ...opt, gates: [] }, pending: false };
}
