import { differenceInDays, parseISO, format } from "date-fns";
import {
  calculateEWMA,
  analyzeLoggingConsistency,
  getBestTDEE,
  calculateMacroSplit,
  suggestProtein,
  phaseToGoal,
} from "./coachingUtils";

const MAX_WEEKLY_ADJUSTMENT = 150;
const MIN_WEEKLY_ADJUSTMENT = 50;
const MIN_LOGGING_CONSISTENCY = 50; // % of days logged required to trust an adjustment

function clampAdjustment(adjustment) {
  const abs = Math.abs(adjustment);
  if (abs < MIN_WEEKLY_ADJUSTMENT) return 0;
  if (abs > MAX_WEEKLY_ADJUSTMENT)
    return adjustment > 0 ? MAX_WEEKLY_ADJUSTMENT : -MAX_WEEKLY_ADJUSTMENT;
  return Math.round(adjustment / 25) * 25;
}

export function generateWeeklyCheckin({
  activePhase,
  weightEntries,
  foodEntries,
  profile,
  previousCheckin,
}) {
  if (!activePhase) return null;

  // 1. Compute EWMA over all weight entries
  const trendedEntries = calculateEWMA(weightEntries, 0.1);
  if (trendedEntries.length < 2) return null;

  const currentTrend = trendedEntries[trendedEntries.length - 1].trendWeight;

  // 2. Get previous trend weight — always re-derive from the current EWMA at the
  //    previous checkin date so both values use the same algorithm (avoids sign errors
  //    from stale stored trend_weight values computed by old algorithms).
  let prevTrend;
  if (previousCheckin?.checkin_date) {
    const prevDate = parseISO(previousCheckin.checkin_date);
    const entriesUpToCheckin = trendedEntries.filter(
      (e) => parseISO(e.recorded_date) <= prevDate
    );
    prevTrend =
      entriesUpToCheckin.length > 0
        ? entriesUpToCheckin[entriesUpToCheckin.length - 1].trendWeight
        : trendedEntries[0].trendWeight;
  } else if (trendedEntries.length > 7) {
    prevTrend = trendedEntries[trendedEntries.length - 8].trendWeight;
  } else {
    prevTrend = trendedEntries[0].trendWeight;
  }

  // 3. Calculate actual weekly rate
  const weightChangeTrend = currentTrend - prevTrend;
  const daysSinceLastCheckin = previousCheckin
    ? differenceInDays(new Date(), parseISO(previousCheckin.checkin_date))
    : 7;
  const actualWeeklyRate =
    daysSinceLastCheckin > 0
      ? (weightChangeTrend / daysSinceLastCheckin) * 7
      : 0;

  // 4. Compare to goal rate
  const goalRate = activePhase.weekly_rate || 0;
  const rateDeviation = actualWeeklyRate - goalRate;

  // 5. Get TDEE
  const weightUnit = profile?.weight_unit || "lbs";
  const weightLbs =
    weightUnit === "kg" ? currentTrend * 2.205 : currentTrend;
  const tdeeResult = getBestTDEE(
    profile,
    currentTrend,
    weightEntries,
    foodEntries
  );

  // 6. Logging consistency
  const loggingAnalysis = analyzeLoggingConsistency(foodEntries, profile, 7);

  // 7. Calculate adjustment
  let calorieAdjustment = 0;
  let reasoning = "";

  // Gate: if logging is too sparse, we can't trust the weight-trend math.
  // Return a no-adjustment check-in with an explanation instead.
  if (loggingAnalysis.consistency < MIN_LOGGING_CONSISTENCY && activePhase.phase_type !== "reverse") {
    const protein = profile?.daily_protein_goal || suggestProtein(
      profile?.weight_unit === "kg" ? (profile?.current_weight || 70) * 2.205 : (profile?.current_weight || 150),
      phaseToGoal(activePhase.phase_type),
      activePhase.phase_type
    );
    const newMacros = calculateMacroSplit(profile?.daily_calorie_goal || 2000, protein);
    return {
      diet_phase_id: activePhase.id,
      checkin_date: format(new Date(), "yyyy-MM-dd"),
      week_number: previousCheckin ? (previousCheckin.week_number || 0) + 1 : 1,
      raw_weight: [...weightEntries].sort((a, b) => new Date(b.recorded_date) - new Date(a.recorded_date))[0]?.weight ?? null,
      trend_weight: currentTrend,
      weight_change_trend: null,
      actual_weekly_rate: null,
      goal_weekly_rate: activePhase.weekly_rate || 0,
      rate_deviation: null,
      previous_calories: profile?.daily_calorie_goal || 2000,
      new_calories: profile?.daily_calorie_goal || 2000,
      calorie_adjustment: 0,
      previous_protein: profile?.daily_protein_goal || protein,
      new_protein: newMacros.daily_protein_goal,
      previous_carbs: profile?.daily_carbs_goal,
      new_carbs: newMacros.daily_carbs_goal,
      previous_fats: profile?.daily_fats_goal,
      new_fats: newMacros.daily_fats_goal,
      tdee_used: tdeeResult?.tdee || null,
      tdee_method: tdeeResult?.method || null,
      logging_consistency: loggingAnalysis.consistency,
      avg_daily_calories: loggingAnalysis.avgCalories,
      status: "pending",
      reasoning: `Only ${loggingAnalysis.daysLogged} of the last 7 days were logged (${loggingAnalysis.consistency}%). Log at least 4 days/week for accurate coaching adjustments. No changes made this week.`,
    };
  }

  const weekNumber = previousCheckin ? (previousCheckin.week_number || 0) + 1 : 1;

  if (activePhase.phase_type === "reverse") {
    // Fixed calorie increment each week — don't use rate-deviation math
    const increment = activePhase.weekly_rate; // stored as cal/week
    calorieAdjustment = increment;

    let warning = "";
    if (actualWeeklyRate > 0.5) {
      warning = ` Weight gaining faster than expected (+${Math.abs(Math.round(actualWeeklyRate * 10) / 10)} ${weightUnit}/wk) — consider slowing your increment.`;
    }
    reasoning = `Reverse diet week ${weekNumber}: adding +${increment} cal as planned → ${(profile?.daily_calorie_goal || 0) + increment} cal/day.${warning}`;
  } else if (activePhase.phase_type === "maintain") {
    if (Math.abs(actualWeeklyRate) > 0.25) {
      calorieAdjustment = clampAdjustment(
        Math.round(-actualWeeklyRate * 250)
      );
      reasoning = `Your weight is ${
        actualWeeklyRate > 0 ? "increasing" : "decreasing"
      } at ${Math.abs(
        Math.round(actualWeeklyRate * 10) / 10
      )} ${weightUnit}/wk. Adjusting by ${
        calorieAdjustment > 0 ? "+" : ""
      }${calorieAdjustment} cal/day to maintain.`;
    } else {
      reasoning = `Weight is stable (${
        Math.round(actualWeeklyRate * 10) / 10
      } ${weightUnit}/wk). No adjustment needed.`;
    }
  } else {
    const absDeviation = Math.abs(rateDeviation);

    if (absDeviation < 0.15) {
      reasoning = `On track! Actual rate: ${
        Math.round(actualWeeklyRate * 10) / 10
      } ${weightUnit}/wk vs goal: ${goalRate} ${weightUnit}/wk. No adjustment needed.`;
    } else {
      calorieAdjustment = clampAdjustment(Math.round(-rateDeviation * 250));

      const direction =
        calorieAdjustment > 0 ? "Increasing" : "Decreasing";
      const tooFastOrSlow =
        activePhase.phase_type === "cut"
          ? actualWeeklyRate < goalRate
            ? "faster"
            : "slower"
          : actualWeeklyRate > goalRate
          ? "faster"
          : "slower";

      reasoning = `${
        activePhase.phase_type === "cut" ? "Losing" : "Gaining"
      } ${tooFastOrSlow} than planned (${
        Math.round(actualWeeklyRate * 10) / 10
      } vs ${goalRate} ${weightUnit}/wk). ${direction} calories by ${Math.abs(
        calorieAdjustment
      )}/day.`;
    }
  }

  // 8. Compute new macros
  const previousCalories = profile?.daily_calorie_goal || 2000;
  const goalType = phaseToGoal(activePhase.phase_type);
  const protein = profile?.daily_protein_goal || suggestProtein(weightLbs, goalType, activePhase.phase_type);

  // Dynamic calorie floor: 40% of estimated TDEE (never below 1200).
  const minCalories = Math.max(1200, Math.round((tdeeResult?.tdee || 2000) * 0.4));

  let newCalories;
  if (activePhase.phase_type === "reverse") {
    // Reverse diet: cap at TDEE + 10% to prevent indefinite surplus
    const reverseCeiling = tdeeResult?.tdee ? Math.round(tdeeResult.tdee * 1.1) : 99999;
    newCalories = Math.min(previousCalories + calorieAdjustment, reverseCeiling);
  } else {
    newCalories = Math.max(minCalories, previousCalories + calorieAdjustment);
  }

  const newMacros = calculateMacroSplit(newCalories, protein);

  // 9. Get raw weight
  const sortedEntries = [...weightEntries].sort(
    (a, b) => new Date(b.recorded_date) - new Date(a.recorded_date)
  );
  const rawWeight = sortedEntries.length > 0 ? sortedEntries[0].weight : null;

  return {
    diet_phase_id: activePhase.id,
    checkin_date: format(new Date(), "yyyy-MM-dd"),
    week_number: weekNumber,
    raw_weight: rawWeight,
    trend_weight: currentTrend,
    weight_change_trend: Math.round(weightChangeTrend * 10) / 10,
    actual_weekly_rate: Math.round(actualWeeklyRate * 10) / 10,
    goal_weekly_rate: goalRate,
    rate_deviation: Math.round(rateDeviation * 10) / 10,
    previous_calories: previousCalories,
    new_calories: newCalories,
    calorie_adjustment: calorieAdjustment,
    previous_protein: profile?.daily_protein_goal || protein,
    new_protein: newMacros.daily_protein_goal,
    previous_carbs: profile?.daily_carbs_goal,
    new_carbs: newMacros.daily_carbs_goal,
    previous_fats: profile?.daily_fats_goal,
    new_fats: newMacros.daily_fats_goal,
    tdee_used: tdeeResult?.tdee || null,
    tdee_method: tdeeResult?.method || null,
    logging_consistency: loggingAnalysis.consistency,
    avg_daily_calories: loggingAnalysis.avgCalories,
    status: "pending",
    reasoning,
  };
}
