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

// ─── Body weight: one trend state ───────────────────────────────────────────
// Every weight surface (Weight card headline, basis line, period deltas,
// Metabolism's weight-trend tile) reads THIS object, so they cannot disagree.
// The old bug: the headline counted every weigh-in ever logged ("26"), the
// rate needed 7+ days of data inside a 28-day window, the deltas reached
// back across any gap, and Metabolism printed its own threshold copy. With one
// recent weigh-in after a long gap that read "Smoothed trend of 26 weigh-ins"
// beside "Only 1 weigh-in in 30 days" beside "1W +1 lbs".
//
// trended: calculateEWMA output, oldest to newest ({ recorded_date, weight, trendWeight }).
// today:   Date (wall clock) for the staleness read.
const STALE_DAYS = 7;
// A delta's reference weigh-in must sit within this many days before the
// period cutoff; otherwise the "change" spans an unlogged gap and is invented.
const DELTA_REF_SLACK_DAYS = 7;

export function weightTrendState(trended, today = new Date()) {
  const rows = trended || [];
  const total = rows.length;
  if (total === 0) return { status: "none", total, recent: 0, latest: null, rate: null, isStale: false, basis: null };
  const latest = rows[total - 1];
  const lastT = dayStamp(latest.recorded_date);
  const recent = rows.filter((r) => lastT - dayStamp(r.recorded_date) <= RATE_WINDOW_DAYS * DAY_MS).length;
  const rate = weeklyRate(rows.map((r) => ({ date: r.recorded_date, value: r.trendWeight })));
  const todayT = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const ageDays = Math.round((todayT - lastT) / DAY_MS);
  const isStale = ageDays > STALE_DAYS;
  const status = total < 2 ? "building" : rate ? "ok" : "sparse";

  const asOf = isStale
    ? `As of ${new Date(lastT).toLocaleDateString("en-US", { month: "short", day: "numeric" })}. `
    : "";
  const recentPhrase = `${recent} weigh-in${recent === 1 ? "" : "s"} in the ${RATE_WINDOW_DAYS} days to the last one`;
  const basis = status === "ok"
    ? `${asOf}Smoothed trend, rate over the last ${rate.spanDays} days (${recentPhrase}).`
    : status === "sparse"
      ? `${asOf}No rate yet: ${recentPhrase}, and a rate needs 2 or more spanning ${RATE_MIN_SPAN_DAYS} days.`
      : null;

  return { status, total, recent, latest, rate, isStale, ageDays, basis };
}

// Trend change over a fixed period, anchored on the latest weigh-in. Null
// unless the trend state has a rate AND a weigh-in sits close to the cutoff.
export function periodDelta(trended, days, state) {
  if (!state || state.status !== "ok") return null;
  const last = trended[trended.length - 1];
  const cutoffT = dayStamp(last.recorded_date) - days * DAY_MS;
  let ref = null;
  for (let i = trended.length - 1; i >= 0; i--) {
    if (dayStamp(trended[i].recorded_date) <= cutoffT) { ref = trended[i]; break; }
  }
  if (!ref || cutoffT - dayStamp(ref.recorded_date) > DELTA_REF_SLACK_DAYS * DAY_MS) return null;
  return Math.round((last.trendWeight - ref.trendWeight) * 10) / 10;
}
