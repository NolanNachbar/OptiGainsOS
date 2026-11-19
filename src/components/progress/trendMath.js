// Shared trend maths for the Body charts. Trend over raw: the headline is the
// smoothed value plus its weekly rate; raw points only ever sit behind it.

const DAY_MS = 86400000;
const RATE_WINDOW_DAYS = 28;
const RATE_MIN_SPAN_DAYS = 7;

export const dayStamp = (isoDate) => new Date(`${isoDate}T00:00:00`).getTime();

// Weekly rate of a smoothed series, read over the last 28 days. Returns null
// when the series spans under 7 days: a rate from a few days is noise.
// rows: [{ date: 'yyyy-MM-dd', value }] oldest to newest.
export function weeklyRate(rows) {
  if (!rows || rows.length < 2) return null;
  const last = rows[rows.length - 1];
  const lastT = dayStamp(last.date);
  const ref = rows.find((r) => lastT - dayStamp(r.date) <= RATE_WINDOW_DAYS * DAY_MS);
  if (!ref) return null;
  const spanDays = (lastT - dayStamp(ref.date)) / DAY_MS;
  if (spanDays < RATE_MIN_SPAN_DAYS) return null;
  return {
    perWeek: ((last.value - ref.value) / spanDays) * 7,
    spanDays: Math.round(spanDays),
  };
}

// Exponentially weighted trend with the gap between points folded into alpha,
// so a long gap pulls the trend further than a daily log does.
export function smoothSeries(rows, alpha) {
  let trend = null;
  let prevT = null;
  return rows.map((r) => {
    const t = dayStamp(r.date);
    if (trend == null) {
      trend = r.value;
    } else {
      const days = Math.max(1, Math.round((t - prevT) / DAY_MS));
      const a = 1 - Math.pow(1 - alpha, days);
      trend = a * r.value + (1 - a) * trend;
    }
    prevT = t;
    return { ...r, t, trend: Math.round(trend * 100) / 100 };
  });
}

export const signed = (n, digits = 1) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(n).toFixed(digits)}`;

export const BF_ALPHA = 0.4;

// Session BF rows -> raw + smoothed trend, oldest to newest. The page headline
// and the chart both read this, so they always show the same numbers.
export function buildBfTrend(sessions) {
  const rows = (sessions || [])
    .filter((s) => s.bf != null)
    .map((s) => ({ date: s.date, value: Math.round(s.bf * 10) / 10 }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  return smoothSeries(rows, BF_ALPHA);
}
