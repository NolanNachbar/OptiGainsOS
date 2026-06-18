// failureReasons.js — UI mirror of scripts/engine/failure_reasons.py.
//
// When a logged set misses the prior best for its rep range, the athlete tags WHY.
// The tag (stored as set.failure_reason) splits two ways in the engine:
//   • SYSTEMIC ("out of gas") — counts as a strength dip that eases the cut.
//   • TECHNICAL (lockout / off-chest / form / grip) — a skill/leverage issue: it is
//     EXCLUDED from the cut-calorie signal and instead routed to programming
//     (e.g. bench lockout → triceps-biased assistance).
//
// A second field, set.sticking_point, is tagged on a MADE but near-failure set
// (RIR ≤ 1). It reuses the same lift-specific keys but is PROGRAMMING ONLY — it
// steers assistance (same weakness path) yet never touches the cut-calorie signal,
// because a completed set is not a strength regression. Big-3 only (the only lifts
// with region tags). See stickingPointReasons() below.
// Keep the string keys IN SYNC with failure_reasons.FAILURE_REASONS in Python.

export const FAILURE_REASONS = {
  out_of_gas:  { label: "Out of gas / weak", systemic: true,  universal: true },
  form:        { label: "Form broke down",   systemic: false, universal: true },
  lockout:     { label: "Lockout",           systemic: false, lifts: ["bench", "deadlift"] },
  off_chest:   { label: "Off the chest",     systemic: false, lifts: ["bench"] },
  out_of_hole: { label: "Out of the hole",   systemic: false, lifts: ["squat"] },
  off_floor:   { label: "Off the floor",     systemic: false, lifts: ["deadlift"] },
  grip:        { label: "Grip failed",       systemic: false, lifts: ["deadlift"] },
  // Catch-all for a miss that doesn't fit the buckets above. Neither systemic
  // (won't ease the cut — we can't claim it's a fuelling issue) nor a sticking
  // point (no region → steers no assistance). Always offered, last.
  other:       { label: "Other",             systemic: false, universal: true },
};

export function inferLift(name = "") {
  const n = String(name).toLowerCase();
  if (n.includes("bench")) return "bench";
  if (n.includes("deadlift") || n.includes("rdl")) return "deadlift";
  if (n.includes("squat")) return "squat";
  return null;
}

// Ordered reason keys relevant to a given exercise: lift-specific sticking points
// first (most useful), then the universal "out of gas" / "form".
export function reasonsForExercise(name) {
  const lift = inferLift(name);
  const specific = Object.entries(FAILURE_REASONS)
    .filter(([, m]) => lift && (m.lifts || []).includes(lift))
    .map(([k]) => k);
  const universal = Object.entries(FAILURE_REASONS)
    .filter(([, m]) => m.universal)
    .map(([k]) => k);
  return [...specific, ...universal];
}

// Sticking-point keys for a MADE near-failure set: only the lift-specific regions
// (lockout / off-chest / ...). "Out of gas" and "form" carry no region, so they'd
// be no-ops for programming and are intentionally omitted. Empty for non-big-3.
export function stickingPointReasons(name) {
  const lift = inferLift(name);
  return Object.entries(FAILURE_REASONS)
    .filter(([, m]) => lift && (m.lifts || []).includes(lift))
    .map(([k]) => k);
}

const e1rm = (w, r) => (Number(w) || 0) * (1 + (Number(r) || 0) / 30);

// A completed set "missed" only if it fell short of what was PRESCRIBED for it —
// not merely below a heavier prior best. Programmed-lighter work (speed/back-off/
// rep-range days, deloads, submaximal builds) hits its target and must never be
// flagged: comparing to the all-time best falsely nags "why did you miss?" on a
// day you did exactly what was written. `target` is { weight, reps } for this set
// (working weight or daily-min weight × the exercise's rep target). With no
// prescription (free workout) a miss isn't defined, so we don't flag one.
export function isMissedSet(set, target) {
  if (!set?.completed || !(Number(set.weight) > 0) || !(Number(set.reps) > 0)) return false;
  const tW = Number(target?.weight) || 0;
  const tR = Number(target?.reps) || 0;
  if (tW <= 0 || tR <= 0) return false;
  return e1rm(set.weight, set.reps) < e1rm(tW, tR) * 0.99;
}
