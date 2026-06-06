/**
 * Utilities for calculating recovery and readiness scores.
 * Phase 3e roadmap item.
 */

/**
 * Calculates a composite readiness score (0-100).
 * Formula: (body_battery * 0.4) + (sleep_score * 0.4) + (subjective_energy * 0.2)
 * 
 * Falls back to Apple Health metrics if Garmin data is missing.
 */
export function calculateReadinessScore(metrics, checkin) {
  let bb = metrics?.body_battery;
  let ss = metrics?.sleep_score;
  let se = checkin?.energy ? checkin.energy * 10 : null;

  // Fallback for Sleep Score from Apple Health (minutes to 0-100)
  if (ss == null && metrics?.ah_sleep_min) {
    // 8 hours (480 min) = 100 score, linear down to 4 hours = 0.
    const min = metrics.ah_sleep_min;
    ss = Math.min(100, Math.max(0, ((min - 240) / 240) * 100));
  }

  // Fallback for Body Battery from HRV (very rough proxy)
  if (bb == null && metrics?.ah_hrv) {
    // This is a placeholder; ideally we'd compare today's HRV to a 7-day baseline
    bb = Math.min(100, Math.max(0, metrics.ah_hrv * 1.5)); 
  }

  // Final Score Calculation with Dynamic Weighting
  let totalWeight = 0;
  let weightedSum = 0;

  if (bb != null) { weightedSum += bb * 0.4; totalWeight += 0.4; }
  if (ss != null) { weightedSum += ss * 0.4; totalWeight += 0.4; }
  if (se != null) { weightedSum += se * 0.2; totalWeight += 0.2; }

  if (totalWeight === 0) return null;

  return Math.round(weightedSum / totalWeight);
}

/**
 * Categorizes a readiness score into a human-readable state.
 */
export function getReadinessCategory(score) {
  if (score == null) return { label: "Unknown", color: "text-slate-500", bg: "bg-slate-600/10" };
  if (score >= 85) return { label: "Optimal", color: "text-brand", bg: "bg-brand/10" };
  if (score >= 70) return { label: "Good", color: "text-[#4ade80]", bg: "bg-[#4ade80]/10" };
  if (score >= 50) return { label: "Moderate", color: "text-[#fbbf24]", bg: "bg-[#fbbf24]/10" };
  return { label: "Recovery Needed", color: "text-[#f87171]", bg: "bg-[#f87171]/10" };
}

/**
 * Calculates Acute:Chronic Workload Ratio (ACWR) proxy from steps or calories.
 */
export function calculateACWR(metricsHistory) {
  if (!metricsHistory || metricsHistory.length < 28) return null;
  
  const acute = metricsHistory.slice(0, 7).reduce((s, m) => s + (m.steps || 0), 0) / 7;
  const chronic = metricsHistory.slice(0, 28).reduce((s, m) => s + (m.steps || 0), 0) / 28;
  
  if (chronic === 0) return 1.0;
  return Math.round((acute / chronic) * 100) / 100;
}

/**
 * Suggests a training duration for today based on capacity.
 * Logic:
 * 1. Start with profile.max_daily_training_hours
 * 2. Reduce if HRV trend is negative (> 10% below 7-day avg)
 * 3. Reduce if ACWR is outside optimal zone (> 1.3)
 * 4. Increase if Readiness is Optimal (> 85)
 */
export function calculateTrainingCapacity(metricsHistory, profile, checkin) {
  const maxHours = Number(profile?.max_daily_training_hours) || 2.0;
  if (!metricsHistory || metricsHistory.length === 0) return { hours: maxHours, rationale: "Default capacity (no history)" };

  const today = metricsHistory[0];
  const readiness = calculateReadinessScore(today, checkin) || 70;
  
  let capacityMult = 1.0;

  // 1. HRV Penalty
  if (metricsHistory.length >= 7) {
    const hrvToday = today.hrv || today.ah_hrv;
    const hrvBaseline = metricsHistory.slice(1, 8).reduce((s, m) => s + (m.hrv || m.ah_hrv || 0), 0) / 7;
    
    if (hrvToday && hrvBaseline > 0) {
      const hrvRatio = hrvToday / hrvBaseline;
      if (hrvRatio < 0.9) capacityMult *= 0.7; // Significant drop
      else if (hrvRatio < 0.95) capacityMult *= 0.9; // Slight drop
    }
  }

  // 2. Load Penalty (ACWR)
  const acwr = calculateACWR(metricsHistory);
  if (acwr > 1.5) capacityMult *= 0.5; // Extreme danger zone
  else if (acwr > 1.3) capacityMult *= 0.8; // High load

  // 3. Readiness Bonus/Penalty
  if (readiness >= 90) capacityMult *= 1.1;
  else if (readiness < 40) capacityMult *= 0.5;

  const suggestedHours = Math.min(maxHours, maxHours * capacityMult);
  const minutes = Math.round(suggestedHours * 60);

  return {
    hours: suggestedHours,
    minutes,
    acwr,
    readiness,
    rationale: capacityMult < 1.0 ? "Reduced due to recovery markers" : "Full capacity recommended"
  };
}
