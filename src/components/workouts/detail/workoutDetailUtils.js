// Extracted from WorkoutDetail.jsx (no behavior change).

export const isRunEx = (ex) => /\b(run|sprint|cardio|zone ?2)\b/i.test(ex.name || '');

// Epley e1RM scaling with progressive overload projection.
// If last session hit target reps (or exceeded them), nudge the suggested weight
// up by 2.5 lbs — the smallest standard plate increment.
// Rounds to nearest 2.5 so suggested weights are always rackable.
export const scaleWeightToReps = (lastWeight, lastReps, targetReps) => {
  if (!lastWeight || !lastReps || lastReps <= 0 || targetReps <= 0) return lastWeight || 0;
  const e1rm = lastWeight * (1 + 0.0333 * lastReps);
  const scaled = e1rm / (1 + 0.0333 * targetReps);
  const overload = lastReps >= targetReps ? 2.5 : 0;
  return Math.round((scaled + overload) / 2.5) * 2.5;
};

// Use the LOWER end of rep ranges (e.g. "8-12" → 8) so the autofill defaults
// to the heavier end of the rep range. Default is 8, not 10.
export const parseRepTarget = (repTarget) => {
  const s = String(repTarget || '8').trim();
  const m = s.match(/^(\d+)\s*[-–]\s*(\d+)/);
  return m ? parseInt(m[1], 10) : (parseInt(s, 10) || 8);
};

// Engine-generated workouts carry the RIR target in the exercise notes ("RIR 2",
// "RIR 3 · ..."). No RIR in notes → 0, matching how scaleWeightToReps treats reps.
export const parseRirFromNotes = (notes) => {
  const m = String(notes || '').match(/RIR\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : 0;
};

export const parseRirTarget = (v) => {
  if (v == null || v === '') return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
};

// "Back Squat (Top Set)" / "Back Squat (Back-off)" → "back squat"
export const baseLiftName = (name) =>
  String(name || '').toLowerCase().replace(/\s*\([^)]*\)\s*$/, '').trim();

export const formatTimeAgo = (startTimeStr) => {
  if (!startTimeStr) return "recently";
  const ms = Date.now() - new Date(startTimeStr).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
};

