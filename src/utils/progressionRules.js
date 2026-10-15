/**
 * Explicit progression rules that override the e1RM seed when a program
 * exercise (or set_scheme block) carries a `progression` object:
 *   { type: 'single_step', step }  top single: +step after a made single,
 *                                  repeat the last made single after a miss
 *   { type: 'double', step }       rep range lo-hi: +step once every working
 *                                  set of the last session hit hi, else hold
 * Each function returns a weight, or null when the rule does not apply / has
 * no qualifying history (callers then fall back to the e1RM rule).
 * Name + components matching and e1rm_anchor filtering mirror e1rm.js.
 */
const norm = (n) => String(n || '').toLowerCase().trim();

const logTime = (log) => {
  const t = new Date(log?.log_date).getTime();
  return Number.isFinite(t) ? t : 0;
};
const createdTime = (log) => {
  const t = new Date(log?.created_at).getTime();
  return Number.isFinite(t) ? t : 0;
};

/** Logs newest first (log_date, then created_at), within the anchor, with this exercise's sets. */
const historyFor = (logs, exercise) => {
  const names = [exercise?.name, ...(exercise?.components || [])].map(norm);
  const anchor = exercise?.e1rm_anchor;
  const aT = anchor && Number(anchor.value) > 0 ? new Date(anchor.date).getTime() : NaN;
  const out = [];
  for (const log of logs || []) {
    if (Number.isFinite(aT) && logTime(log) < aT) continue;
    const sets = [];
    for (const ex of log.exercises || []) {
      if (names.includes(norm(ex.name))) sets.push(...(ex.sets || []));
    }
    if (sets.length) out.push({ log, sets });
  }
  return out.sort((a, b) => logTime(b.log) - logTime(a.log) || createdTime(b.log) - createdTime(a.log));
};

const isMade = (s) => !!s?.completed && Number(s?.reps) >= 1;

/** single_step: `exercise` supplies name/components/anchor; `progression` is the block's or exercise's. */
export const singleStepWeight = (logs, exercise, progression) => {
  const step = Number(progression?.step);
  if (progression?.type !== 'single_step' || !(step > 0)) return null;
  const hist = historyFor(logs, exercise)
    .map(({ sets }) => sets.filter((s) => s?.set_type === 'top_set' && Number(s?.weight) > 0))
    .filter((tops) => tops.length);
  if (!hist.length) return null;
  const last = hist[0][hist[0].length - 1];
  if (isMade(last)) return Number(last.weight) + step;
  // Missed: repeat the most recent made top single, else defer to the e1RM rule.
  for (const tops of hist) {
    const made = [...tops].reverse().find(isMade);
    if (made) return Number(made.weight);
  }
  return null;
};

/** double progression on a "lo-hi" rep_target; `ex.sets` is the prescribed count. */
export const doubleWeight = (logs, exercise, progression = exercise?.progression) => {
  const step = Number(progression?.step);
  if (progression?.type !== 'double' || !(step > 0)) return null;
  const m = String(exercise?.rep_target ?? '').match(/^(\d+)\s*-\s*(\d+)/);
  if (!m) return null;
  const hi = Number(m[2]);
  const prescribed = Number(exercise?.sets) || 1;
  for (const { sets } of historyFor(logs, exercise)) {
    const work = sets.filter((s) => s?.completed && Number(s?.weight) > 0 && !/warm/i.test(s?.set_type || ''));
    if (!work.length) continue;
    const top = Math.max(...work.map((s) => Number(s.weight)));
    const hit = work.length >= prescribed && work.every((s) => Number(s.reps) >= hi);
    return hit ? top + step : top;
  }
  return null;
};

/** Seed weight for a set_scheme block (progression on the block, else on the exercise). */
export const blockProgressionWeight = (logs, exercise, block) => {
  const p = block?.progression || exercise?.progression;
  return p?.type === 'single_step' ? singleStepWeight(logs, exercise, p) : null;
};

/** Seed weight for a scheme-less exercise. */
export const exerciseProgressionWeight = (logs, exercise) => {
  const p = exercise?.progression;
  if (p?.type === 'double') return doubleWeight(logs, exercise, p);
  if (p?.type === 'single_step') return singleStepWeight(logs, exercise, p);
  return null;
};
