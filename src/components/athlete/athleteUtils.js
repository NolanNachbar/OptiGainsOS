// True when the engine's verdict for a lift is "Stalled" (same rule as StallBadge).
export function isStalled(risk, rate) {
  return risk != null && risk >= 0.75 && !(Number(rate) > 0);
}

// Live countdown to the Aug 31 PST deadline. The engine stores days_to_aug31 as
// of the row's date, so a stale row would count down to a date that may already
// be past. Recompute against today; never show a countdown to a past date.
export function pstCountdown(endurance, asOfDate, today) {
  if (endurance?.days_to_aug31 == null || !asOfDate || !today) return null;
  const base = new Date(`${asOfDate}T00:00:00`);
  const deadline = new Date(base.getTime() + endurance.days_to_aug31 * 86400000);
  const now = new Date(`${today}T00:00:00`);
  const days = Math.round((deadline - now) / 86400000);
  const label = deadline.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { days, passed: days < 0, label };
}
