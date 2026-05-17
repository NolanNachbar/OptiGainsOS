import { format, subDays, parseISO, differenceInDays } from "date-fns";

// ─── hrTSS for Strava cardio sessions ───────────────────────────────────────
// Uses TRIMP-based heart rate training stress score.
// maxHR estimated from age (220 - age) if not provided.

export function calculateHrTSS(session, maxHR) {
  const { moving_time_seconds, average_heartrate } = session;
  if (!moving_time_seconds || !average_heartrate || !maxHR) return null;

  const durationHrs = moving_time_seconds / 3600;
  const hrFraction = average_heartrate / maxHR;

  // Intensity factor: hrFraction squared gives higher penalty for hard efforts
  const intensityFactor = hrFraction * hrFraction;

  // 100 TSS = 1 hour at max HR (threshold)
  const tss = Math.round(durationHrs * intensityFactor * 100);
  return Math.min(tss, 300); // cap outliers
}

// ─── RPE-based TSS for lifting sessions ─────────────────────────────────────
// Formula: TSS = Duration (hrs) × (avgRPE × 10) × 0.8
// avgRPE derived from logged set RPE values; falls back to 7 if none logged.

export function calculateLiftingTSS(workoutLog) {
  if (!workoutLog) return null;
  const durationHrs = (workoutLog.duration_seconds || 0) / 3600;
  if (durationHrs < 0.1) return null;

  // Collect RIR values from completed sets; fall back to legacy `rpe` field for old logs
  const rirValues = (workoutLog.exercises || [])
    .flatMap((ex) => ex.sets || [])
    .filter((s) => s.completed && (s.rir ?? s.rpe) != null)
    .map((s) => Number(s.rir ?? s.rpe));

  // Convert average RIR to implied RPE (RPE = 10 - RIR)
  // Default: assume RIR 3 (≈ RPE 7) when nothing is logged
  const avgRIR = rirValues.length > 0
    ? rirValues.reduce((a, b) => a + b, 0) / rirValues.length
    : 3;
  const impliedRPE = 10 - avgRIR;

  const tss = Math.round(durationHrs * (impliedRPE * 10) * 0.8);
  return Math.min(tss, 250);
}

// ─── Daily TSS: combine cardio + lifting for a given date string ─────────────

export function getDailyTSS(dateStr, cardioSessions, workoutLogs, maxHR) {
  const cardioTSS = (cardioSessions || [])
    .filter((s) => s.start_date?.startsWith(dateStr))
    .reduce((sum, s) => sum + (calculateHrTSS(s, maxHR) || 0), 0);

  const liftingTSS = (workoutLogs || [])
    .filter((l) => l.log_date === dateStr)
    .reduce((sum, l) => sum + (calculateLiftingTSS(l) || 0), 0);

  return cardioTSS + liftingTSS;
}

// ─── Weekly TSS bars (last N weeks) ─────────────────────────────────────────

export function getWeeklyTSSData(cardioSessions, workoutLogs, maxHR, weeks = 10) {
  const result = [];
  const today = new Date();

  for (let w = weeks - 1; w >= 0; w--) {
    const weekEnd = subDays(today, w * 7);
    const weekStart = subDays(weekEnd, 6);
    let total = 0;
    for (let d = 0; d < 7; d++) {
      const dateStr = format(subDays(weekEnd, d), "yyyy-MM-dd");
      total += getDailyTSS(dateStr, cardioSessions, workoutLogs, maxHR);
    }
    result.push({
      label: format(weekStart, "MMM d"),
      weekStart: format(weekStart, "yyyy-MM-dd"),
      tss: Math.round(total),
    });
  }
  return result;
}

// ─── CTL / ATL / TSB (unlocks after minDays of data) ────────────────────────
// CTL = 42-day exponential moving average of daily TSS
// ATL = 7-day exponential moving average of daily TSS
// TSB = CTL - ATL  (positive = fresh, negative = fatigued)

export function getCTLData(cardioSessions, workoutLogs, maxHR, days = 60) {
  const today = new Date();
  const dailyTSS = [];

  for (let i = days - 1; i >= 0; i--) {
    const dateStr = format(subDays(today, i), "yyyy-MM-dd");
    dailyTSS.push({ date: dateStr, tss: getDailyTSS(dateStr, cardioSessions, workoutLogs, maxHR) });
  }

  const ctlDecay = 1 / 42;
  const atlDecay = 1 / 7;
  let ctl = 0, atl = 0;
  const result = [];

  for (const { date, tss } of dailyTSS) {
    ctl = ctl + ctlDecay * (tss - ctl);
    atl = atl + atlDecay * (tss - atl);
    const tsb = ctl - atl;
    result.push({
      date,
      ctl: Math.round(ctl * 10) / 10,
      atl: Math.round(atl * 10) / 10,
      tsb: Math.round(tsb * 10) / 10,
    });
  }

  return result;
}

// ─── Check if enough data exists to show CTL/ATL/TSB ───────────────────────

export function hasSufficientLoadData(cardioSessions, workoutLogs, minDays = 28) {
  const allDates = new Set([
    ...(cardioSessions || []).map((s) => s.start_date?.slice(0, 10)).filter(Boolean),
    ...(workoutLogs || []).map((l) => l.log_date).filter(Boolean),
  ]);
  if (allDates.size < 2) return false;
  const sorted = [...allDates].sort();
  const span = differenceInDays(parseISO(sorted[sorted.length - 1]), parseISO(sorted[0]));
  return span >= minDays;
}

// ─── Derive user max HR from profile ────────────────────────────────────────

export function getMaxHR(profile) {
  if (!profile) return 185;
  const age = profile.age;
  return age ? Math.round(220 - age) : 185;
}
