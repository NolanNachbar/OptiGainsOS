import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db, supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { format, subDays } from "date-fns";
import { getTodayString } from "@/utils/dateUtils";

// One shared empty array, so "no rows" keeps a stable identity across renders
// and doesn't retrigger every memo downstream of it.
const NO_ROWS = [];

export function useProfile() {
  const { user } = useAuth();

  const { data: profile, isLoading, error } = useQuery({
    queryKey: queryKeys.userProfile(user?.id),
    queryFn: async () => {
      const profiles = await db.entities.UserProfile.filter({ created_by: user.id });
      return profiles[0] || null;
    },
    enabled: !!user,
  });

  return { profile, isLoading, error };
}

// Is this exercise "liked" (in exercise_preferences.preferred)? Case-insensitive.
export function isExerciseLiked(profile, exerciseName) {
  const preferred = profile?.exercise_preferences?.preferred || [];
  const target = String(exerciseName || "").toLowerCase();
  return preferred.some((n) => String(n || "").toLowerCase() === target);
}

// Toggle an exercise's "like" — writes user_profiles.exercise_preferences.preferred.
// The engine's session generator reads `preferred` and weights a liked movement to
// win its muscle slot (PREFER_SELECT_WEIGHT), so liking steers future programming.
export function useToggleExerciseLike() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ profile, exerciseName }) => {
      if (!profile?.id || !exerciseName) return null;
      const prefs = profile.exercise_preferences || { preferred: [], blocked: [] };
      const preferred = Array.isArray(prefs.preferred) ? [...prefs.preferred] : [];
      const target = String(exerciseName).toLowerCase();
      const idx = preferred.findIndex((n) => String(n || "").toLowerCase() === target);
      if (idx >= 0) preferred.splice(idx, 1);
      else preferred.push(exerciseName);
      const next = { ...prefs, preferred };
      await db.entities.UserProfile.update(profile.id, { exercise_preferences: next });
      return next;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userProfile(user?.id) });
    },
  });
}

// Sets user_profiles.equipment_profile ('full_gym' | 'casper'). Read by both
// the weekly (Sunday MILP) and daily (MPC) generators, which union its
// exercise whitelist (scripts/engine/equipment_profiles.py) on top of the
// manual exercise_preferences blocked/preferred sets — never overriding them.
// Writing the column is only half the job: both generators are Python on a cron,
// so until one of them runs again the athlete keeps looking at a session built for
// the gym he isn't in. This dispatches the Replan Day workflow and waits for the
// rewritten training_prescription row before settling, so `isPending` covers the
// whole round trip and the card changes when it resolves. The write itself is
// never blocked on the recompute — a failed dispatch still leaves the setting
// saved and tomorrow's cron correct.
export function useSetEquipmentProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ profile, equipmentProfile }) => {
      if (!profile?.id) return null;
      await db.entities.UserProfile.update(profile.id, { equipment_profile: equipmentProfile });

      // Everything from here is best-effort. Whatever happens, the column is set.
      const dispatchedAt = new Date().toISOString();
      try {
        const { error } = await supabase.functions.invoke("replan-day", {
          body: { reason: `equipment_profile → ${equipmentProfile}` },
        });
        if (error) throw error;
        await waitForFreshPrescription(user?.id, dispatchedAt);
      } catch (e) {
        console.error("replan dispatch failed; today's session stays as computed", e);
      }
      return equipmentProfile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userProfile(user?.id) });
      queryClient.invalidateQueries({ queryKey: ['todayPrescription'] });
    },
  });
}

// Poll today's prescription until its computed_at passes the moment we dispatched.
// A GitHub Actions run is queue + checkout + pip install + prescribe, so ~60-90s
// is normal and the ceiling is generous. Giving up just means the card updates on
// the next natural refetch instead of now; it does not mean the recompute failed.
async function waitForFreshPrescription(userId, dispatchedAt, timeoutMs = 180000) {
  if (!userId) return false;
  const deadline = Date.now() + timeoutMs;
  const today = getTodayString();
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const { data } = await supabase
      .from("training_prescription")
      .select("computed_at")
      .eq("created_by", userId)
      .eq("date", today)
      .maybeSingle();
    if (data?.computed_at && new Date(data.computed_at) > new Date(dispatchedAt)) return true;
  }
  console.warn("replan did not land within the wait window; card will update on next refetch");
  return false;
}

// Active exercise_shot_notes for the user, as a lowercased-name -> shot_note
// lookup. Hand-populated (Nolan sets which exercises are "content-worthy"),
// so this just reads what exists — no inference.
export function useExerciseShotNotes() {
  const { user } = useAuth();

  const { data: notes = [], isLoading, error } = useQuery({
    queryKey: queryKeys.exerciseShotNotes(user?.id),
    queryFn: async () => {
      const rows = await db.entities.ExerciseShotNote.filter({ created_by: user.id, active: true });
      return rows || [];
    },
    enabled: !!user,
  });

  // Strip trailing "(Top Set)" / "(Back-off Vol)" / "(3-count)" style annotations
  // so one seeded row (e.g. "Bench Press") covers every logged variant of that
  // lift (e.g. "Bench Press (Back-off Vol)") instead of needing a row per variant.
  const normalize = (name) => String(name || "").toLowerCase().replace(/\s*\([^)]*\)\s*$/, "").trim();

  const byName = new Map(notes.map((n) => [normalize(n.exercise_name), n.shot_note]));

  if (error) console.error("exercise_shot_notes fetch failed:", error.message || error);

  return {
    shotNoteFor: (exerciseName) => byName.get(normalize(exerciseName)) || null,
    noteCount: notes.length,
    isLoading,
    error,
  };
}

export function useAllFoodEntries() {
  const { user } = useAuth();

  const { data: allFoodEntries = [], isLoading, error } = useQuery({
    queryKey: queryKeys.allFoodEntries(user?.id),
    queryFn: async () => {
      const since = format(subDays(new Date(), 90), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('food_entries')
        .select('*')
        .eq('created_by', user.id)
        .gte('date', since)
        .order('date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  return { allFoodEntries, isLoading, error };
}

export function useCustomFoods() {
  const { user } = useAuth();

  const { data: customFoods = [], isLoading, error } = useQuery({
    queryKey: queryKeys.customFoods(user?.id),
    queryFn: () => db.entities.CustomFood.filter({ created_by: user.id }),
    enabled: !!user,
  });

  return { customFoods, isLoading, error };
}

/**
 * Every portion the user has defined, grouped by custom food id.
 *
 * One query rather than one per food: this is a single-user vault app, the whole
 * table is a few dozen rows, and the logging modal needs a food's portions the
 * instant it's picked with no loading state in between.
 */
export function useFoodPortions() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.foodPortions(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('food_portions')
        .select('*')
        .eq('created_by', user.id)
        .order('sort_order', { ascending: true });
      // A missing table (migration not yet applied) degrades to "no portions"
      // rather than taking the whole food log down with it. `failed` keeps that
      // empty list distinguishable from a genuinely portion-less account —
      // writers must never reconcile-delete against an empty list they only got
      // because the read broke.
      if (error) {
        console.warn('food_portions unavailable:', error.message);
        return { rows: [], failed: true };
      }
      return { rows: data || [], failed: false };
    },
    enabled: !!user,
  });

  const portions = data?.rows || NO_ROWS;
  // Unresolved counts as unavailable too: a query still in flight has the same
  // empty-list-that-means-nothing problem as one that errored.
  const portionsUnavailable = !data || data.failed;

  const portionsByFood = useMemo(() => {
    const map = {};
    for (const p of portions) {
      if (!map[p.custom_food_id]) map[p.custom_food_id] = [];
      map[p.custom_food_id].push(p);
    }
    return map;
  }, [portions]);

  return { portions, portionsByFood, portionsUnavailable, isLoading };
}

export function useBodyWeightEntries() {
  const { user } = useAuth();

  const { data: weightEntries = [], isLoading, error } = useQuery({
    queryKey: queryKeys.bodyWeightEntries(user?.id),
    queryFn: async () => {
      const since = format(subDays(new Date(), 365), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('body_weight_entries')
        .select('*')
        .eq('created_by', user.id)
        .gte('recorded_date', since)
        .order('recorded_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  return { weightEntries, isLoading, error };
}

export function useRecoveryMetrics(days = 30) {
  const { user } = useAuth();

  const { data: recoveryMetrics = [], isLoading, error } = useQuery({
    queryKey: ["recoveryMetrics", user?.id, days],
    queryFn: async () => {
      const since = format(subDays(new Date(), days), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('recovery_metrics')
        .select('*')
        .eq('created_by', user.id)
        .gte('date', since)
        .order('date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  return { recoveryMetrics, isLoading, error };
}
