// Hooks for reading the adaptive engine's daily outputs.
//
// The engine (scripts/engine/*) runs server-side via GitHub Actions
// (daily-engine.yml) and writes two rows per day:
//   - training_prescription : MPC output — session_type, mpc_intensity, rationale,
//                             banister_state {fitness,fatigue,tsb_banister,confidence},
//                             interference {interference_level, anabolic_window},
//                             overreach {overreaching, fatigue_state, hrv_z_3d, rhr_z_3d},
//                             acwr
//   - engine_params         : persistent state — kalman_state, rls_params {theta,
//                             update_count}, cellular_state, vdot_state {vdot,...}
//
// The frontend historically never read these tables; these hooks surface the
// engine's own intelligence instead of re-deriving weaker versions client-side.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { getTodayString } from "@/utils/dateUtils";

const STALE = 5 * 60 * 1000;

/**
 * Today's MPC training prescription (the engine's daily recommendation).
 * Returns null when the engine hasn't computed today's row yet.
 */
export function useTodayPrescription(date) {
  const { user } = useAuth();
  const day = date || getTodayString();

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.todayPrescription(day, user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_prescription")
        .select("*")
        .eq("created_by", user.id)
        .eq("date", day)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: STALE,
  });

  return { prescription: data, isLoading, error };
}

/**
 * Persistent engine parameters (Kalman / RLS / cellular / VDOT state).
 * Falls back to the most recent row on or before `date` so the UI still shows
 * the latest known personalization even if today's compute hasn't run.
 */
export function useEngineParams(date) {
  const { user } = useAuth();
  const day = date || getTodayString();

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.engineParams(day, user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("engine_params")
        .select("*")
        .eq("created_by", user.id)
        .lte("date", day)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: STALE,
  });

  return { engineParams: data, isLoading, error };
}

/**
 * Convenience selector: the Banister fitness/fatigue/form snapshot the engine
 * computed for today, or null. Shape:
 *   { fitness, fatigue, tsb_banister, confidence, performance }
 */
export function selectBanister(prescription) {
  return prescription?.banister_state || null;
}
