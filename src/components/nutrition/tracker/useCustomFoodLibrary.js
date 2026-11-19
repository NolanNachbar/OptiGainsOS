import { useCustomFoods, useFoodPortions } from "@/hooks/useUserQueries";
import { useEffect, useMemo, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { db } from "@/api/supabaseClient";
import { invalidateCustomFoods, invalidateFoodPortions } from "@/lib/queryKeys";
import { toast } from "sonner";
import { planCustomFoodSave, isMissingColumnError } from "@/utils/foodLog";
import { scaleFromBase, baseQuantityForUnit } from "@/utils/nutritionUtils";

// Extracted from FoodTracker.jsx (no behavior change).
export function useCustomFoodLibrary({ activeFoodId, activePortions, baseMacros, baseUnit, foodServingSizeGrams, foodSource, newFood, portionsDirty, queryClient, searchQuery, setActiveFoodId, setActivePortions, user }) {
  const { customFoods } = useCustomFoods();
  const { portionsByFood, portionsUnavailable } = useFoodPortions();

  // The portion query resolves after a food can already be picked. A food chosen
  // in that window would sit on an empty list: its named units missing from the
  // picker, and an empty list is exactly what a save would reconcile-delete
  // against. Adopt the server's list the moment it lands, unless the form is
  // holding edits that haven't been written yet.
  useEffect(() => {
    if (!activeFoodId || portionsDirty || portionsUnavailable) return;
    const server = portionsByFood[activeFoodId];
    if (server) setActivePortions((prev) => (prev === server ? prev : server));
  }, [activeFoodId, portionsByFood, portionsDirty, portionsUnavailable]);
  // Favorites first, then alphabetical. A starred food stops sinking out of
  // reach the moment it hasn't been eaten in a week.
  const sortedCustomFoods = useMemo(() => {
    return [...customFoods].sort((a, b) => {
      if (!!a.is_favorite !== !!b.is_favorite) return a.is_favorite ? -1 : 1;
      return (a.food_name || "").localeCompare(b.food_name || "");
    });
  }, [customFoods]);
  const matchingCustomFoods = searchQuery.length >= 2
    ? sortedCustomFoods.filter((f) =>
        f.food_name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const toggleFavoriteFoodMutation = useMutation({
    mutationFn: ({ id, is_favorite }) => db.entities.CustomFood.update(id, { is_favorite }),
    onSuccess: () => invalidateCustomFoods(queryClient),
    onError: () => toast.error("Couldn't update favorite"),
  });

  // Save custom food mutation (fire-and-forget)
  // A same-name food is never silently overwritten: see planCustomFoodSave.
  // `source` needs the custom_foods.source column; until that migration is
  // applied the write retries without it so logging never breaks on it. The
  // "missing" verdict expires, so applying the migration needs no reload.
  const SOURCE_RECHECK_MS = 5 * 60 * 1000;
  const sourceMissingAtRef = useRef(0);
  const saveCustomFoodMutation = useMutation({
    mutationFn: async ({ food, activeFoodId: editingFoodId = null }) => {
      const existing = await db.entities.CustomFood.filter({ created_by: user.id });
      const plan = planCustomFoodSave(existing, food, { activeFoodId: editingFoodId });
      // Nothing written, so nothing for onSuccess to hang portions off.
      if (plan.action === "keep") return null;
      // Only a real macro edit reaches "update", and it writes just the macros
      // (in the row's own unit) plus the manual tag; serving fields stay as saved.
      const row = plan.action === "update" ? { ...plan.patch, source: "manual" } : food;
      const write = (payload) =>
        plan.action === "update"
          ? db.entities.CustomFood.update(plan.id, payload)
          : db.entities.CustomFood.create({ ...payload, created_by: user.id });
      const { source, ...withoutSource } = row;
      const sourceKnownMissing = Date.now() - sourceMissingAtRef.current < SOURCE_RECHECK_MS;
      if (sourceKnownMissing || !source) return write(withoutSource);
      try {
        return await write(row);
      } catch (err) {
        if (!isMissingColumnError(err, "source")) throw err;
        sourceMissingAtRef.current = Date.now();
        return write(withoutSource);
      }
    },
    onSuccess: (saved) => {
      invalidateCustomFoods(queryClient);
      // A food's portions are part of the food. Flush whatever the form is
      // holding now that there's a row to hang them off.
      if (saved?.id) {
        setActiveFoodId(saved.id);
        // Only when he edited them here. An untouched form's list is a copy of
        // the server's at best and empty at worst, and syncing it would delete
        // portions he never asked to lose.
        if (portionsDirty) {
          syncPortions(saved.id, activePortions)
            .catch((e) =>
              toast.error(`Saved the food, but its portions didn't stick: ${e.message}`)
            );
        }
      }
    },
  });

  // Build the custom-food payload from the current form. Stored macros are per
  // 100 g/ml or per 1 of any other unit, so convert from whatever unit the
  // current baseMacros are in. serving_grams rides along so the food knows what
  // one serving of it weighs the next time it's logged.
  const buildCustomFoodPayload = () => {
    const unit = newFood.serving_unit;
    const scale = scaleFromBase({
      amount: baseQuantityForUnit(unit),
      unit,
      baseUnit,
      servingGrams: foodServingSizeGrams,
      portions: activePortions,
    });
    return {
      food_name: newFood.food_name,
      serving_size: baseQuantityForUnit(unit),
      serving_unit: unit,
      serving_grams: foodServingSizeGrams ?? null,
      // Null (unknown) is dropped before the write, so a form that never learned
      // its origin doesn't stamp a source it can't back up.
      source: foodSource,
      calories: Math.round(baseMacros.calories * scale),
      protein_grams: Math.round(baseMacros.protein_grams * scale * 10) / 10,
      carbs_grams: Math.round(baseMacros.carbs_grams * scale * 10) / 10,
      fats_grams: Math.round(baseMacros.fats_grams * scale * 10) / 10,
      fiber_grams: baseMacros.fiber_grams == null
        ? null
        : Math.round(baseMacros.fiber_grams * scale * 10) / 10,
    };
  };

  /**
   * Write the form's portion list to food_portions for a saved food.
   *
   * Portions can be typed before the food exists, so this runs after the custom
   * food is saved and reconciles: rows that vanished from the form are deleted,
   * new ones are inserted, and changed weights are updated. Labels are the
   * identity, matching the unique index on (custom_food_id, lower(label)).
   */
  const syncPortions = async (foodId, portions) => {
    if (!foodId || !user) return;
    const existing = await db.entities.FoodPortion.filter({ custom_food_id: foodId });
    const wanted = (portions || []).filter((p) => p.label && Number(p.grams) > 0);
    const wantedByLabel = new Map(wanted.map((p) => [p.label.toLowerCase().trim(), p]));

    for (const row of existing) {
      const label = String(row.label || "").toLowerCase().trim();
      const match = wantedByLabel.get(label);
      if (!match) {
        await db.entities.FoodPortion.delete(row.id);
      } else if (Number(row.grams) !== Number(match.grams)) {
        await db.entities.FoodPortion.update(row.id, { grams: Number(match.grams) });
      }
      wantedByLabel.delete(label);
    }

    let order = existing.length;
    for (const p of wantedByLabel.values()) {
      await db.entities.FoodPortion.create({
        created_by: user.id,
        custom_food_id: foodId,
        label: p.label.toLowerCase().trim(),
        grams: Number(p.grams),
        sort_order: order++,
      });
    }
    invalidateFoodPortions(queryClient);
  };

  const handleImportFoodsCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const lines = evt.target.result.trim().split("\n").filter(Boolean);
        if (lines.length < 2) { toast.error("CSV must have a header row and at least one food."); return; }
        const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
        const nameIdx = header.indexOf("food_name");
        const calIdx = header.indexOf("calories");
        const protIdx = header.indexOf("protein_grams");
        const carbIdx = header.indexOf("carbs_grams");
        const fatIdx = header.indexOf("fats_grams");
        const unitIdx = header.indexOf("serving_unit");
        if (nameIdx === -1 || calIdx === -1) {
          toast.error("CSV must have food_name and calories columns.");
          return;
        }
        let imported = 0;
        let skipped = 0;
        for (const line of lines.slice(1)) {
          const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
          const food_name = cols[nameIdx];
          if (!food_name) continue;
          const saved = await saveCustomFoodMutation.mutateAsync({
            food: {
              food_name,
              calories: parseFloat(cols[calIdx]) || 0,
              protein_grams: protIdx >= 0 ? parseFloat(cols[protIdx]) || 0 : 0,
              carbs_grams: carbIdx >= 0 ? parseFloat(cols[carbIdx]) || 0 : 0,
              fats_grams: fatIdx >= 0 ? parseFloat(cols[fatIdx]) || 0 : 0,
              serving_size: 1,
              serving_unit: unitIdx >= 0 ? cols[unitIdx] || "serving" : "serving",
              source: "manual",
            },
          });
          // null = a same-name food already exists and was left untouched.
          if (saved) imported++; else skipped++;
        }
        toast.success(
          `${imported} food${imported !== 1 ? "s" : ""} imported to My Foods.` +
          (skipped ? ` ${skipped} already existed and were left as they are.` : "")
        );
      } catch {
        toast.error("Could not read CSV file.");
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  };

  return { buildCustomFoodPayload, customFoods, handleImportFoodsCSV, matchingCustomFoods, portionsByFood, portionsUnavailable, saveCustomFoodMutation, sortedCustomFoods, syncPortions, toggleFavoriteFoodMutation };
}
