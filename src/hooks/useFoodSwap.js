// Day-only food swap: "I already bought cottage cheese, put that in the plan
// instead of the milk." Writes the swap to nutrition_overrides.food_swaps for
// that ONE date, then re-solves the day so the replacement's grams are chosen by
// the optimizer rather than copied from whatever it replaced.
//
// Day-only by design (Nolan's call): the swap survives a week re-approve on that
// date and expires with it, so a one-off purchase never becomes a standing edit
// to the catalog.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { db, supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { invalidateFood } from "@/lib/queryKeys";
import { resolveDayPlan } from "@/utils/dayPlan";

export function useFoodSwap({
  date,
  dayContext,
  trainingDay,
  calTarget,
  proteinTarget,
  fatTarget,
  isCut,
  profile,
  aggressiveCut,
  customFoods,
  // Live eaten totals for `date` from the entries the caller already has. The
  // batched context query is up to a minute stale, and a swap made right after
  // checking food off would otherwise re-plan against a budget that has already
  // been spent.
  eatenOverride = null,
}) {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ original, replacement }) => {
      if (!user || !date || !original) throw new Error("Nothing to swap");

      const { data: existing, error: readErr } = await supabase
        .from("nutrition_overrides")
        .select("food_swaps")
        .eq("created_by", user.id).eq("date", date)
        .maybeSingle();
      if (readErr) throw readErr;

      // Keyed by the ORIGINAL plan food, so swapping the same row twice
      // (milk → cottage → yogurt) replaces the entry instead of chaining and
      // leaving the intermediate food stranded in the plan.
      const nextSwaps = { ...(existing?.food_swaps || {}) };
      if (!replacement || replacement === original) delete nextSwaps[original];
      else nextSwaps[original] = replacement;

      const { error: writeErr } = await supabase.from("nutrition_overrides")
        .upsert(
          { created_by: user.id, date, food_swaps: Object.keys(nextSwaps).length ? nextSwaps : null },
          { onConflict: "created_by,date" }
        );
      if (writeErr) throw writeErr;

      const ctx = {
        ...(dayContext || {}),
        foodSwaps: { ...(dayContext?.foodSwaps || {}), [date]: nextSwaps },
        ...(eatenOverride ? { eaten: { ...(dayContext?.eaten || {}), [date]: eatenOverride } } : {}),
      };
      const plan = resolveDayPlan({
        date, trainingDay, dayContext: ctx, calTarget, proteinTarget, fatTarget,
        isCut, profile, aggressiveCut, customFoods,
      });

      // Only the un-eaten plan rows are rebuilt. Anything already checked off is
      // a real logged meal (planned:false) and is never touched.
      const { error: delErr } = await supabase.from("food_entries")
        .delete()
        .eq("created_by", user.id).eq("date", date).eq("planned", true);
      if (delErr) throw delErr;

      await Promise.all(plan.rows.map((e) => db.entities.FoodEntry.create({
        food_name: e.food_name,
        meal_type: e.meal_type,
        serving_size: e.serving_size,
        serving_unit: e.serving_unit,
        calories: e.calories,
        protein_grams: e.protein_grams,
        carbs_grams: e.carbs_grams,
        fats_grams: e.fats_grams,
        date,
        planned: true,
        created_by: user.id,
        tag: e.timing && e.timing !== "anytime" ? e.timing : null,
        cost_usd: e.cost_usd ?? null,
      })));

      return { plan, swaps: nextSwaps, replacement };
    },
    onSuccess: () => {
      invalidateFood(qc);
      qc.invalidateQueries({ queryKey: ["day-plan-context"] });
    },
  });
}
