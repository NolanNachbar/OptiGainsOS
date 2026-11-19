import { eatenOnly, calculateMacros } from "@/utils/nutritionUtils";
import { usePlannedDayRebalance } from "@/hooks/usePlannedDayRebalance";
import { useMemo, useState } from "react";
import { useDayPlanContext } from "@/hooks/useDayPlanContext";
import { useFoodSwap } from "@/hooks/useFoodSwap";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { db } from "@/api/supabaseClient";
import { getEatenAt } from "@/components/nutrition/tracker/shared";
import { invalidateFood } from "@/lib/queryKeys";
import { format, subDays, parseISO } from "date-fns";
import { LoadingScreen } from "@/components/ui/loading-spinner";
import { getTodayString } from "@/utils/dateUtils";

// Extracted from FoodTracker.jsx (no behavior change).
export function useDaySummary({ allFoodEntries, copyFromDate, customFoods, foodEntries, profile, queryClient, selectedDate, setCopySelection, setSelectedDate, setShowCopyDayDialog, statsWindow, targets, user }) {
  const eatenEntries = eatenOnly(foodEntries);
  const totals = calculateMacros(eatenEntries);

  // Keep this day's planned portions pinned to the day's CURRENT budget. The
  // engine's target moves daily and off-plan foods get logged, so the un-eaten
  // plan rows are rescaled until eaten + planned = target — checking everything
  // off can then never blow the budget.
  const planFit = usePlannedDayRebalance(selectedDate, foodEntries, targets.calories, targets.proteinFloor);
  const plannedCount = planFit.plannedCount;

  // ── Swap a planned food ────────────────────────────────────────────────────
  // A plan row is a suggestion, not an order: swapping one out re-solves THIS
  // day (today only) through the same optimizer the week plan uses, so the
  // replacement's grams — and every other row's — are recomputed around it.
  const swapDates = useMemo(() => [selectedDate], [selectedDate]);
  const { dayContext, isTrainingDay } = useDayPlanContext(swapDates, { enabled: !!targets.calories });
  const [swapEntry, setSwapEntry] = useState(null);
  // Phone rows: swap/edit/delete open as a strip under the row on tap instead of
  // three permanent 44px buttons that squeezed the food name to nothing.
  const [openActionsId, setOpenActionsId] = useState(null);
  const eatenTotals = useMemo(() => ({
    calories: eatenEntries.reduce((s, e) => s + (e.calories || 0), 0),
    protein: eatenEntries.reduce((s, e) => s + (e.protein_grams || 0), 0),
    fats: eatenEntries.reduce((s, e) => s + (e.fats_grams || 0), 0),
  }), [eatenEntries]);

  const foodSwap = useFoodSwap({
    date: selectedDate,
    dayContext,
    trainingDay: isTrainingDay(selectedDate),
    calTarget: targets.calories,
    proteinTarget: targets.protein,
    fatTarget: targets.fats,
    isCut: targets.isCut,
    profile,
    aggressiveCut: targets.aggressiveCut,
    customFoods,
    eatenOverride: eatenTotals,
  });

  const revertSwap = (displaced) => {
    foodSwap.mutate({ original: displaced, replacement: null }, {
      onSuccess: () => { setSwapEntry(null); toast.success(`${displaced} is back on today's plan`); },
      onError: (e) => toast.error(e.message || "Could not revert the swap. Try again."),
    });
  };

  const runSwap = (replacement) => {
    const original = swapEntry?.food_name;
    foodSwap.mutate({ original, replacement }, {
      onSuccess: ({ plan }) => {
        setSwapEntry(null);
        const row = plan.rows.find((r) => r.food_name === replacement);
        // No gram number here on purpose: a fresh solve lands a little over
        // budget by design (floor buffer + minServe rounding), so
        // usePlannedDayRebalance may rescale these rows moments later. The
        // row itself always shows the current grams; a toast can't.
        toast.success(row
          ? `Swapped in ${replacement}, day re-fit around it`
          : `${original} removed; ${replacement} didn't fit today's budget`);
      },
      onError: (e) => toast.error(e.message || "Could not swap the food. Try again."),
    });
  };

  // ── Copy a previous day forward ────────────────────────────────────────────
  // The recents list handles one food at a time; this handles "yesterday again",
  // which is most of a repeatable diet.
  // Planned rows are suggestions, not a day that was eaten: copying them would
  // log un-eaten plan items as eaten.
  const copySourceEntries = eatenOnly(allFoodEntries).filter((e) => e.date === copyFromDate);

  const copyDayMutation = useMutation({
    mutationFn: async (entries) => {
      for (const entry of entries) {
        await db.entities.FoodEntry.create({
          food_name: entry.food_name,
          meal_type: entry.meal_type,
          serving_size: entry.serving_size,
          serving_unit: entry.serving_unit,
          serving_grams: entry.serving_grams ?? null,
          calories: entry.calories,
          protein_grams: entry.protein_grams,
          carbs_grams: entry.carbs_grams,
          fats_grams: entry.fats_grams,
          fiber_grams: entry.fiber_grams ?? null,
          // Eating it again costs the same as eating it the first time.
          cost_usd: entry.cost_usd ?? null,
          date: selectedDate,
          created_by: user.id,
          // Copies are logged against the meal's usual clock time, not the
          // moment of copying, so eaten_at stays meaningful.
          eaten_at: getEatenAt("earlier", entry.meal_type, selectedDate),
        });
      }
      return entries.length;
    },
    onSuccess: (count) => {
      invalidateFood(queryClient);
      setShowCopyDayDialog(false);
      setCopySelection({});
      toast.success(`Copied ${count} ${count === 1 ? "entry" : "entries"} to ${selectedDate}`);
    },
    onError: (e) => toast.error(`Couldn't copy the day: ${e.message}`),
  });

  // ── Descriptive intake stats ───────────────────────────────────────────────
  // Averages over days actually logged, not over the calendar window: dividing
  // by 7 when only 4 days were logged reports a deficit that never happened.
  const intakeStats = useMemo(() => {
    const start = format(subDays(parseISO(selectedDate), statsWindow - 1), "yyyy-MM-dd");
    const inWindow = eatenOnly(allFoodEntries).filter(
      (e) => e.date >= start && e.date <= selectedDate
    );
    const byDate = {};
    for (const e of inWindow) {
      if (!byDate[e.date]) {
        byDate[e.date] = { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, fiberKnown: true };
      }
      const d = byDate[e.date];
      d.calories += e.calories || 0;
      d.protein += e.protein_grams || 0;
      d.carbs += e.carbs_grams || 0;
      d.fats += e.fats_grams || 0;
      d.fiber += e.fiber_grams || 0;
      if (e.fiber_grams == null) d.fiberKnown = false;
    }
    const days = Object.values(byDate);
    if (!days.length) return null;

    const mean = (pick) => days.reduce((s, d) => s + pick(d), 0) / days.length;
    const avgCalories = Math.round(mean((d) => d.calories));
    const avgProtein = Math.round(mean((d) => d.protein));
    const avgCarbs = Math.round(mean((d) => d.carbs));
    const avgFats = Math.round(mean((d) => d.fats));
    const fiberDays = days.filter((d) => d.fiberKnown);
    const macroCals = avgProtein * 4 + avgCarbs * 4 + avgFats * 9;

    return {
      daysLogged: days.length,
      windowDays: statsWindow,
      avgCalories,
      avgProtein,
      avgCarbs,
      avgFats,
      // Only average fiber over days where every entry reported it — a day with
      // one unknown food understates, and a silent understatement is worse than
      // an absent number.
      avgFiber: fiberDays.length
        ? Math.round((fiberDays.reduce((s, d) => s + d.fiber, 0) / fiberDays.length) * 10) / 10
        : null,
      fiberCompleteDays: fiberDays.length,
      split: macroCals > 0
        ? {
            protein: Math.round(((avgProtein * 4) / macroCals) * 100),
            carbs: Math.round(((avgCarbs * 4) / macroCals) * 100),
            fats: Math.round(((avgFats * 9) / macroCals) * 100),
          }
        : null,
    };
  }, [allFoodEntries, selectedDate, statsWindow]);

  const mealGroups = {
    breakfast: foodEntries.filter(e => e.meal_type === "breakfast"),
    lunch: foodEntries.filter(e => e.meal_type === "lunch"),
    dinner: foodEntries.filter(e => e.meal_type === "dinner"),
    snack: foodEntries.filter(e => e.meal_type === "snack"),
  };

  if (!user) return <LoadingScreen />;

  const changeDate = (delta) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    setSelectedDate(format(d, 'yyyy-MM-dd'));
  };

  // 'Today' is a jump-back action, not a status label — only surface it when
  // the user has scrubbed off the current day, so the word is unambiguously
  // tappable and never redundant with a date pill that already reads today.
  const isViewingToday = selectedDate === getTodayString();

  return { changeDate, copyDayMutation, copySourceEntries, dayContext, foodSwap, intakeStats, isViewingToday, mealGroups, openActionsId, planFit, plannedCount, revertSwap, runSwap, setOpenActionsId, setSwapEntry, swapEntry, totals };
}
