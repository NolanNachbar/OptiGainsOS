// Everything resolveDayPlan() needs that lives in the database: per-date engine
// targets, what has already been eaten, manual overrides, forced foods, and
// day-only food swaps — plus which dates are training days.
//
// Shared by the week plan (7 dates at once) and the food log (the one date the
// user is looking at), so a day rebuilt after a swap is solved from exactly the
// same inputs the week view used.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useUserQueries";
import { useEnrollments, useProgram } from "@/hooks/useProgramQueries";
import { getProgramSchedule } from "@/utils/programSchedule";

export const dayPlanContextKey = (userId, dates) => ["day-plan-context", userId, dates.join(",")];

export function useDayPlanContext(dates, { enabled = true } = {}) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { enrollments } = useEnrollments();
  const activeEnrollment = (enrollments || []).find((e) => e.status === "active");
  const { program } = useProgram(activeEnrollment?.program_id);

  const { data: dayContext, isLoading } = useQuery({
    queryKey: dayPlanContextKey(user?.id, dates),
    queryFn: async () => {
      const [statesRes, eatenRes, overridesRes] = await Promise.all([
        supabase.from("athlete_state").select("date, nutrition")
          .eq("created_by", user.id).in("date", dates),
        supabase.from("food_entries").select("date, calories, protein_grams, fats_grams")
          .eq("created_by", user.id).in("date", dates).eq("planned", false),
        supabase.from("nutrition_overrides").select("date, action, manual_calorie_target, manual_protein_g, food_mins, food_swaps")
          .eq("created_by", user.id).in("date", dates),
      ]);
      if (statesRes.error) throw statesRes.error;
      if (eatenRes.error) throw eatenRes.error;
      if (overridesRes.error) throw overridesRes.error;
      const targets = {};
      for (const s of statesRes.data || []) {
        const cal = s.nutrition?.recommended_intake?.calorie_target;
        const pro = s.nutrition?.recommended_intake?.protein_g ?? s.nutrition?.protein_target;
        if (cal) targets[s.date] = { calories: Math.round(cal), protein: pro ? Math.round(pro) : null };
      }
      const overrides = {};
      const foodMins = {};
      const foodSwaps = {};
      // A manual override beats whatever the engine wrote for that day — same
      // priority order as useDailyTargets, just applied across the whole week.
      for (const o of overridesRes.data || []) {
        // food_mins / food_swaps are independent of `action` — a forced or
        // swapped food can sit on an otherwise engine-set or ease/push day,
        // not just a manual-target day.
        if (o.food_mins && Object.keys(o.food_mins).length) foodMins[o.date] = o.food_mins;
        if (o.food_swaps && Object.keys(o.food_swaps).length) foodSwaps[o.date] = o.food_swaps;
        if (o.action !== "manual" || !o.manual_calorie_target) continue;
        overrides[o.date] = true;
        targets[o.date] = {
          calories: Math.round(o.manual_calorie_target),
          protein: o.manual_protein_g ? Math.round(o.manual_protein_g) : (targets[o.date]?.protein ?? null),
        };
      }
      const eaten = {};
      for (const e of eatenRes.data || []) {
        const d = (eaten[e.date] ||= { calories: 0, protein: 0, fats: 0 });
        d.calories += e.calories || 0;
        d.protein += e.protein_grams || 0;
        d.fats += e.fats_grams || 0;
      }
      return { targets, eaten, overrides, foodMins, foodSwaps };
    },
    enabled: !!user && enabled && dates.length > 0,
    staleTime: 60 * 1000,
  });

  // Without a program we can't know rest days; default to training (full fuel).
  const isTrainingDay = useMemo(() => {
    const sched = activeEnrollment && program
      ? getProgramSchedule(activeEnrollment, program.workouts || [], profile?.timezone)
      : [];
    const trainSet = new Set(sched.filter((e) => (e.exercises || []).length > 0).map((e) => e.date));
    const haveSched = trainSet.size > 0;
    return (date) => (haveSched ? trainSet.has(date) : true);
  }, [activeEnrollment, program, profile]);

  return { dayContext, isTrainingDay, isLoading };
}
