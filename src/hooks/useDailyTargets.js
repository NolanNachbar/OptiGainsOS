/**
 * useDailyTargets — the ONE source of truth for "what should I eat today".
 *
 * Priority: the adaptive engine's recovery-gated targets (athlete_state.nutrition)
 * → the profile's saved goals → sane defaults. Both the weekly plan card and the
 * daily log rings consume this, so the plan you approve and the targets you log
 * against can never disagree.
 *
 * Macro shape is MacroFactor-style when the engine sets calories: protein is
 * anchored (engine protein target), fat keeps the profile's floor, and carbs
 * absorb the remainder so P/C/F always sum to the calorie target.
 *
 * CUT RULES (Nolan's, enforced whenever a cut phase is active and weight is known):
 *  - Protein target 1.3–1.5 g/lb (matches the engine's CUT_PROTEIN_G_PER_LB
 *    = 1.3). Protein is the LAST macro to drop — but the calorie wall wins:
 *    on a day where 1.3 g/lb doesn't fit the deficit, protein may ease down
 *    to a hard floor of 1.2 g/lb before calories are allowed to overshoot.
 *  - Fat floor: max(50 g, ⅓ g/lb), err high — sustained low fat wrecks
 *    hormones and sleep.
 *  - Carbs absorb whatever calories remain (and in an AGGRESSIVE cut the
 *    optimizer only allows them pre-workout on training days).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useUserQueries";
import { useDietPhase } from "@/hooks/useDietPhase";

const DEFAULTS = { calories: 2000, protein: 150, carbs: 200, fats: 65 };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ── Shared cut-rule constants/helpers ──────────────────────────────────────────
// Exported so every meal-plan generation path (WeeklyPlanCard's per-day engine
// targets, the diet optimizer) enforces the SAME protein rule as the daily
// rings — no duplicated constants. Mirrors scripts/engine/nutrition_modulator.py
// (CUT_PROTEIN_G_PER_LB = 1.3).
export const CUT_PROTEIN_MIN_PER_LB = 1.3;
export const CUT_PROTEIN_MAX_PER_LB = 1.5;
// The calorie wall outranks the upper protein band: when a deep-deficit day
// can't fit 1.3 g/lb, protein eases down — last macro to drop — but never
// below this hard floor.
export const CUT_PROTEIN_HARD_FLOOR_PER_LB = 1.2;

export const profileWeightLb = (profile) =>
  profile?.current_weight
    ? (profile.weight_unit === "kg" ? profile.current_weight * 2.205 : profile.current_weight)
    : null;

// Clamp a cut-day protein target to 1.3–1.5 g/lb. No-op without a known weight.
export const clampCutProtein = (protein, weightLb) =>
  weightLb
    ? Math.round(clamp(protein || 0, CUT_PROTEIN_MIN_PER_LB * weightLb, CUT_PROTEIN_MAX_PER_LB * weightLb))
    : protein;

export function useDailyTargets(date) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { activePhase } = useDietPhase();

  const { data: stateRow } = useQuery({
    // Same key WeeklyPlanCard used historically — shares the cache.
    queryKey: ["athlete-state-nutrition", date, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("athlete_state")
        .select("nutrition")
        .eq("created_by", user.id)
        .eq("date", date)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!date,
    staleTime: 5 * 60 * 1000,
  });

  const nutrition = stateRow?.nutrition || null;
  const recommended = nutrition?.recommended_intake || null;

  const engineCal = recommended?.calorie_target ?? nutrition?.calorie_target ?? null;
  // The engine writes its real recommendation as recommended_intake.protein_g;
  // the top-level protein_target is just the profile goal echoed back, so it
  // comes last.
  const engineProtein =
    recommended?.protein_g ?? recommended?.protein_target ?? nutrition?.protein_target ?? null;

  const profCal = profile?.daily_calorie_goal || null;
  const profProtein = profile?.daily_protein_goal || null;
  const profCarbs = profile?.daily_carbs_goal || null;
  const profFats = profile?.daily_fats_goal || null;

  const calories = Math.round(engineCal || profCal || DEFAULTS.calories);
  let protein = Math.round(engineProtein || profProtein || DEFAULTS.protein);

  let carbs, fats;
  if (engineCal) {
    // Protein anchored, fat floor, carbs = remainder (never negative).
    fats = Math.round(profFats || (calories * 0.25) / 9);
    carbs = Math.max(0, Math.round((calories - protein * 4 - fats * 9) / 4));
  } else {
    carbs = profCarbs || DEFAULTS.carbs;
    fats = profFats || DEFAULTS.fats;
  }

  // ── Cut rules ──────────────────────────────────────────────────────────────
  const phaseType = (activePhase?.phase_type || "").toLowerCase();
  const isCut = phaseType.includes("cut") || phaseType.includes("deficit");
  const weightLb = profileWeightLb(profile);
  if (isCut && weightLb) {
    protein = clampCutProtein(protein, weightLb);
    fats = Math.round(Math.max(fats, 50, weightLb / 3));
    carbs = Math.max(0, Math.round((calories - protein * 4 - fats * 9) / 4));
  }
  // An aggressive cut (engine deficit ≥20% or a ≥1.5 lb/wk phase) additionally
  // restricts carbs to pre-workout on training days — enforced by the optimizer.
  const aggressiveCut =
    isCut &&
    ((recommended?.deficit_ratio || 0) >= 0.2 || Math.abs(activePhase?.weekly_rate || 0) >= 1.5);

  return {
    calories,
    protein,
    carbs,
    fats,
    isCut,
    aggressiveCut,
    // Hard cut floor (1.2 g/lb). Consumers that rescale already-written rows
    // (usePlannedDayRebalance) or fit plans to a calorie wall (optimizeDay)
    // must never push the day's protein below it.
    proteinFloor: isCut && weightLb ? Math.round(CUT_PROTEIN_HARD_FLOOR_PER_LB * weightLb) : null,
    // True only for the recovery-gated recommendation; the engine's top-level
    // calorie_target is just the profile goal echoed back, which doesn't earn
    // the "engine-set" badge.
    engineSet: !!recommended?.calorie_target,
    nutrition,                // raw athlete_state.nutrition (rationale, gates…)
    recommended,              // raw recommended_intake (deficit_ratio, gates…)
  };
}
