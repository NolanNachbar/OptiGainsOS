/**
 * Deterministic, RIR-adjusted e1RM loads. The ONLY load rule for seeding sets:
 *   setE1rm = weight * (1 + (reps + rir) / 30)
 *   load    = round(currentE1rm / (1 + (reps + rir) / 30))
 * Nothing here is hand-tuned; the inputs are logged sets and the block's
 * reps @ RIR prescription.
 */
const MAX_REPS = 12;
const norm = (n) => String(n || '').toLowerCase().trim();

// Same precedence as programProgression.setRir: rir, else 10 - rpe, else null.
const setRir = (s) => {
  if (s?.rir != null && s.rir !== '') return Number(s.rir);
  if (s?.rpe != null && s.rpe !== '') return 10 - Number(s.rpe);
  return null;
};

export const roundLoad = (x, step = 5) => Math.round(x / step) * step;

export const setE1rm = (weight, reps, rir) =>
  Number(weight) * (1 + (Number(reps) + (Number.isFinite(rir) ? Math.max(0, rir) : 0)) / 30);

const eligible = (s) =>
  !!s?.completed && Number(s?.weight) > 0 && Number(s?.reps) >= 1 && Number(s?.reps) <= MAX_REPS &&
  !/warm/i.test(s?.set_type || '');

const bestInLog = (log, names) => {
  let best = 0;
  for (const ex of log.exercises || []) {
    if (!names.includes(norm(ex.name))) continue;
    for (const s of ex.sets || []) {
      if (eligible(s)) best = Math.max(best, setE1rm(s.weight, s.reps, setRir(s)));
    }
  }
  return best;
};

/**
 * Max set e1RM over the last windowDays; if none, best set of the most recent
 * session that has one (any age). Matches name + components (merged lifts).
 */
export const currentE1rm = (logs, exerciseName, { components = [], windowDays = 14, now = new Date(), anchor = null } = {}) => {
  // anchor {value, date}: acts like a logged set with e1RM=value on date; logs before date are ignored.
  const aT = anchor && Number(anchor.value) > 0 ? new Date(anchor.date).getTime() : NaN;
  const hasAnchor = Number.isFinite(aT);
  if (!logs?.length && !hasAnchor) return null;
  const names = [exerciseName, ...components].map(norm);
  const cutoff = new Date(now).getTime() - windowDays * 86400000;
  let windowBest = 0;
  let latest = null;
  const consider = (t, b) => {
    if (t >= cutoff) windowBest = Math.max(windowBest, b);
    if (!latest || t > latest.t) latest = { t, b };
  };
  if (hasAnchor) consider(aT, Number(anchor.value));
  for (const log of logs || []) {
    const t = new Date(log.log_date).getTime();
    if (hasAnchor && t < aT) continue;
    const b = bestInLog(log, names);
    if (b) consider(t, b);
  }
  return windowBest || latest?.b || null;
};

/** Load for reps @ RIR from an e1RM, or null when there is no e1RM / target. */
export const loadForTarget = (e1rm, reps, rir, step = 5) => {
  const r = Number(reps);
  if (!e1rm || !(r >= 1) || rir == null || rir === '' || !Number.isFinite(Number(rir))) return null;
  return roundLoad(e1rm / (1 + (r + Number(rir)) / 30), step) || null;
};
