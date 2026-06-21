import { subDays, parseISO, differenceInDays } from "date-fns";
import { ACTIVITY_LEVELS } from "@/lib/constants";

// --- EWMA Weight Trending ---

export function calculateEWMA(weightEntries, alpha = 0.1) {
  if (!weightEntries || weightEntries.length === 0) return [];

  const sorted = [...weightEntries].sort(
    (a, b) => new Date(a.recorded_date) - new Date(b.recorded_date)
  );

  let trend = sorted[0].weight;
  return sorted.map((entry, i) => {
    if (i === 0) {
      return { ...entry, trendWeight: Math.round(trend * 10) / 10 };
    }
    // Normalize alpha by days elapsed so sparse logging doesn't lag the trend
    const daysDelta = Math.max(1, differenceInDays(parseISO(entry.recorded_date), parseISO(sorted[i - 1].recorded_date)));
    const effectiveAlpha = 1 - Math.pow(1 - alpha, daysDelta);
    trend = effectiveAlpha * entry.weight + (1 - effectiveAlpha) * trend;
    return { ...entry, trendWeight: Math.round(trend * 10) / 10 };
  });
}

export function getLatestTrendWeight(weightEntries, alpha = 0.1) {
  const trended = calculateEWMA(weightEntries, alpha);
  if (trended.length === 0) return null;
  return trended[trended.length - 1].trendWeight;
}

// --- Weight Analysis ---

export function analyzeWeightTrend(weightEntries, days = 7) {
  // Compute EWMA over full history for proper smoothing
  const allTrended = calculateEWMA(weightEntries, 0.1);

  const cutoff = subDays(new Date(), days);
  const recent = allTrended.filter((e) => parseISO(e.recorded_date) >= cutoff);

  if (recent.length < 2) {
    return {
      trend: "insufficient_data",
      avgWeightChange: 0,
      weeklyRate: 0,
      dataPoints: recent.length,
    };
  }

  const firstTrend = recent[0].trendWeight;
  const lastTrend = recent[recent.length - 1].trendWeight;
  const change = lastTrend - firstTrend;
  const daySpan = differenceInDays(
    parseISO(recent[recent.length - 1].recorded_date),
    parseISO(recent[0].recorded_date)
  );
  const weeklyRate = daySpan > 0 ? (change / daySpan) * 7 : 0;

  let trend = "maintaining";
  if (weeklyRate < -0.25) trend = "losing";
  else if (weeklyRate > 0.25) trend = "gaining";

  return {
    trend,
    avgWeightChange: Math.round(change * 10) / 10,
    weeklyRate: Math.round(weeklyRate * 10) / 10,
    dataPoints: recent.length,
    trendStart: firstTrend,
    trendEnd: lastTrend,
  };
}

export function analyzeLoggingConsistency(foodEntries, profile, days = 7) {
  const cutoff = subDays(new Date(), days);
  const recent = foodEntries.filter((e) => parseISO(e.date) >= cutoff);

  const byDate = {};
  recent.forEach((entry) => {
    if (!byDate[entry.date]) byDate[entry.date] = [];
    byDate[entry.date].push(entry);
  });

  const daysLogged = Object.keys(byDate).length;
  const consistency = Math.round((daysLogged / days) * 100);

  const dailyTotals = Object.values(byDate).map((entries) => ({
    calories: entries.reduce((s, e) => s + (e.calories || 0), 0),
    protein: entries.reduce((s, e) => s + (e.protein_grams || 0), 0),
  }));

  const avgCalories =
    daysLogged > 0
      ? Math.round(
          dailyTotals.reduce((s, d) => s + d.calories, 0) / daysLogged
        )
      : 0;
  const avgProtein =
    daysLogged > 0
      ? Math.round(
          dailyTotals.reduce((s, d) => s + d.protein, 0) / daysLogged
        )
      : 0;

  const proteinGoal = profile?.daily_protein_goal || 150;
  const proteinHitRate =
    daysLogged > 0
      ? Math.round(
          (dailyTotals.filter((d) => d.protein >= proteinGoal * 0.9).length /
            daysLogged) *
            100
        )
      : 0;

  return {
    daysLogged,
    totalDays: days,
    consistency,
    avgCalories,
    avgProtein,
    proteinHitRate,
  };
}

export function analyzeMonthlyProgress(weightEntries, foodEntries, profile) {
  const weightAnalysis = analyzeWeightTrend(weightEntries, 30);
  const loggingAnalysis = analyzeLoggingConsistency(foodEntries, profile, 30);
  return { weightAnalysis, loggingAnalysis };
}

export function generateRecommendations(weightAnalysis, loggingAnalysis, profile) {
  const recommendations = [];
  const rawGoal = Array.isArray(profile?.primary_goal) ? profile.primary_goal[0] : profile?.primary_goal;
  const goal = rawGoal?.toLowerCase() || "general_fitness";

  if (
    (goal === "weight loss" || goal === "weight_loss") &&
    weightAnalysis.trend === "gaining"
  ) {
    recommendations.push({
      id: "weight-goal-mismatch",
      type: "warning",
      title: "Weight Trending Up",
      description: `You're gaining ~${Math.abs(weightAnalysis.weeklyRate)} lbs/week, but your goal is weight loss.`,
      suggestion: `Consider reducing daily calories by 200-300. Current avg: ${loggingAnalysis.avgCalories} cal.`,
      severity: "high",
    });
  }

  if (
    (goal === "muscle gain" || goal === "muscle_gain") &&
    weightAnalysis.trend === "losing"
  ) {
    recommendations.push({
      id: "weight-goal-mismatch",
      type: "warning",
      title: "Weight Trending Down",
      description: `You're losing ~${Math.abs(weightAnalysis.weeklyRate)} lbs/week, but your goal is muscle gain.`,
      suggestion: `Consider increasing daily calories by 200-300. Current avg: ${loggingAnalysis.avgCalories} cal.`,
      severity: "high",
    });
  }

  if (loggingAnalysis.consistency < 70) {
    recommendations.push({
      id: "low-consistency",
      type: "info",
      title: "Log More Consistently",
      description: `You logged food ${loggingAnalysis.daysLogged} of the last ${loggingAnalysis.totalDays} days (${loggingAnalysis.consistency}%).`,
      suggestion:
        "Try to log at least 5 out of 7 days for accurate coaching insights.",
      severity: "medium",
    });
  }

  if (loggingAnalysis.proteinHitRate < 60 && loggingAnalysis.daysLogged > 0) {
    recommendations.push({
      id: "low-protein",
      type: "suggestion",
      title: "Protein Target Missed",
      description: `You hit your protein goal only ${loggingAnalysis.proteinHitRate}% of logged days.`,
      suggestion: `Aim for ${profile?.daily_protein_goal || 150}g daily. Try adding a protein-rich snack.`,
      severity: "medium",
    });
  }

  if (
    (goal === "weight loss" || goal === "weight_loss") &&
    weightAnalysis.trend === "losing" &&
    weightAnalysis.weeklyRate >= -2
  ) {
    recommendations.push({
      id: "good-progress",
      type: "success",
      title: "Great Progress!",
      description: `You're losing ${Math.abs(weightAnalysis.weeklyRate)} lbs/week, right on track for healthy weight loss.`,
      suggestion: "Keep it up! Stay consistent with your current approach.",
      severity: "low",
    });
  }

  if (
    (goal === "muscle gain" || goal === "muscle_gain") &&
    weightAnalysis.trend === "gaining" &&
    weightAnalysis.weeklyRate <= 1
  ) {
    recommendations.push({
      id: "good-progress",
      type: "success",
      title: "Solid Gains!",
      description: `You're gaining ${weightAnalysis.weeklyRate} lbs/week, a good rate for lean muscle gain.`,
      suggestion: "Keep hitting your protein targets and progressive overload.",
      severity: "low",
    });
  }

  if (
    weightAnalysis.trend === "maintaining" &&
    loggingAnalysis.consistency >= 70
  ) {
    recommendations.push({
      id: "maintaining-well",
      type: "success",
      title: "Staying Consistent",
      description:
        "Your weight is stable and you're logging consistently. Great discipline!",
      suggestion:
        goal === "general_fitness" || goal === "general fitness"
          ? "You're doing great for general fitness maintenance."
          : "If you want to see changes, consider adjusting your calorie target.",
      severity: "low",
    });
  }

  return recommendations;
}

// --- TDEE & Macro Calculation Functions ---

/**
 * Maps daily step count to an activity level value.
 * Phase 3c roadmap logic.
 */
export function getActivityLevelFromSteps(avgSteps) {
  if (avgSteps == null) return null;
  if (avgSteps < 5000) return "sedentary";
  if (avgSteps < 7500) return "lightly_active";
  if (avgSteps < 10000) return "moderately_active";
  if (avgSteps < 12500) return "very_active";
  return "extremely_active";
}

// currentWeight must be in the unit matching profile.weight_unit:
//   lbs when profile.weight_unit === "lbs" (or unset)
//   kg  when profile.weight_unit === "kg"
export function calculateFormulaTDEE(profile, currentWeight, activityLevelOverride = null) {
  const activityLevel = activityLevelOverride || profile?.activity_level;
  if (!profile?.height_cm || !profile?.age || !profile?.sex || !activityLevel || !currentWeight) {
    return null;
  }

  const heightCm = profile.height_unit === "in"
    ? profile.height_cm * 2.54
    : profile.height_cm;
  const weightKg = (profile.weight_unit === "kg")
    ? currentWeight
    : currentWeight / 2.205;

  const bmr = profile.sex === "male"
    ? 10 * weightKg + 6.25 * heightCm - 5 * profile.age + 5
    : 10 * weightKg + 6.25 * heightCm - 5 * profile.age - 161;

  const activityEntry = ACTIVITY_LEVELS.find((a) => a.value === activityLevel);
  const multiplier = activityEntry?.multiplier || 1.2;
  const tdee = Math.round(bmr * multiplier);

  return { bmr: Math.round(bmr), tdee, method: "formula", activityLevelUsed: activityLevel };
}

export function calculateAdaptiveTDEE(weightEntries, foodEntries, days = 14) {
  const cutoff = subDays(new Date(), days);

  // Use EWMA over full history, then slice recent window
  const allTrended = calculateEWMA(weightEntries, 0.1);
  const recentWeight = allTrended.filter(
    (e) => parseISO(e.recorded_date) >= cutoff
  );

  const recentFood = foodEntries.filter((e) => parseISO(e.date) >= cutoff);

  if (recentWeight.length < 2) return null;

  const daySpan = differenceInDays(
    parseISO(recentWeight[recentWeight.length - 1].recorded_date),
    parseISO(recentWeight[0].recorded_date)
  );
  if (daySpan < 14) return null;

  const byDate = {};
  recentFood.forEach((entry) => {
    if (!byDate[entry.date]) byDate[entry.date] = 0;
    byDate[entry.date] += entry.calories || 0;
  });

  const daysLogged = Object.keys(byDate).length;
  if (daysLogged < 10) return null;

  const avgDailyCalories = Math.round(
    Object.values(byDate).reduce((s, c) => s + c, 0) / daysLogged
  );

  const weightChangeLbs =
    recentWeight[recentWeight.length - 1].trendWeight - recentWeight[0].trendWeight;
  const weeklyChangeLbs = (weightChangeLbs / daySpan) * 7;

  const tdee = Math.round(avgDailyCalories - weeklyChangeLbs * 500);

  let confidence = "low";
  if (daySpan >= 28) confidence = "high";
  else if (daySpan >= 21) confidence = "medium";

  return {
    tdee,
    confidence,
    method: "adaptive",
    dataPoints: { weightEntries: recentWeight.length, foodDays: daysLogged, daySpan },
  };
}

export function getBestTDEE(profile, currentWeightLbs, weightEntries, foodEntries, recoveryMetrics = []) {
  if (profile?.tdee_override) {
    return {
      tdee: Math.round(profile.tdee_override),
      method: "manual",
      confidence: null,
      formula_tdee: null,
      adaptive_tdee: null,
    };
  }

  // Phase 3c: Look for 7-day avg steps to derive auto-activity level
  let autoActivityLevel = null;
  if (recoveryMetrics?.length > 0) {
    const validMetrics = recoveryMetrics.filter(m => m.steps != null).slice(0, 7);
    if (validMetrics.length >= 3) {
      const avgSteps = validMetrics.reduce((s, m) => s + m.steps, 0) / validMetrics.length;
      autoActivityLevel = getActivityLevelFromSteps(avgSteps);
    }
  }

  // Prefer profile.current_weight as the fast path; fall back to passed-in weight
  const weightForFormula = profile?.current_weight ?? currentWeightLbs;
  const formula = calculateFormulaTDEE(profile, weightForFormula, autoActivityLevel);
  const adaptive = calculateAdaptiveTDEE(weightEntries, foodEntries);

  const useAdaptive = adaptive && (adaptive.confidence === "medium" || adaptive.confidence === "high");

  return {
    tdee: useAdaptive ? adaptive.tdee : formula?.tdee || null,
    method: useAdaptive ? "adaptive" : formula ? "formula" : null,
    confidence: adaptive?.confidence || null,
    formula_tdee: formula?.tdee || null,
    adaptive_tdee: adaptive?.tdee || null,
    autoActivityLevel,
  };
}

export function calculateMacroSplit(calorieGoal, proteinGrams) {
  const proteinCal = proteinGrams * 4;
  const remaining = Math.max(0, calorieGoal - proteinCal);
  const carbs = Math.round((remaining * 0.5) / 4);
  const fats = Math.round((remaining * 0.5) / 9);

  return {
    daily_protein_goal: proteinGrams,
    daily_carbs_goal: carbs,
    daily_fats_goal: fats,
    daily_calorie_goal: calorieGoal
  };
}

export function suggestProtein(weightLbs, goal, phaseType = null) {
  const rawGoal = Array.isArray(goal) ? goal[0] : goal;
  const g = rawGoal?.toLowerCase() || "general_fitness";

  let grams;
  // Cuts: higher protein (1.2g/lb) to preserve muscle under deficit
  if (phaseType === "cut" || g === "weight_loss" || g === "weight loss") {
    grams = weightLbs * 1.2;
  } else if (g === "muscle_gain" || g === "muscle gain") {
    grams = weightLbs * 1.0;
  } else {
    grams = weightLbs * 0.8;
  }

  // Cap at 250g — beyond this point additional protein has diminishing returns
  // and can crowd out carbs/fats at normal calorie targets
  return Math.min(250, Math.round(grams));
}

// --- Diet Phase Helpers ---

export function calculatePhaseCalories(tdee, weeklyRate) {
  if (!tdee) return null;
  return Math.round(tdee + weeklyRate * 500);
}

export function phaseToGoal(phaseType) {
  switch (phaseType) {
    case "cut": return "weight_loss";
    case "bulk": return "muscle_gain";
    case "maintain": return "main_gain";
    case "reverse": return "muscle_gain";
    default: return "general_fitness";
  }
}

export function shouldTransitionPhase(phase, currentTrendWeight) {
  if (!phase || !phase.target_weight || !currentTrendWeight) return false;
  if (phase.phase_type === "cut") return currentTrendWeight <= phase.target_weight;
  if (phase.phase_type === "bulk") return currentTrendWeight >= phase.target_weight;
  return false;
}
