// free-exercise-db (yuhonas/free-exercise-db, public domain) — 873 exercises with
// muscles, equipment, category, and step-by-step instructions. Lazy-loaded so the
// ~760KB JSON never lands in the logging chunk; it loads only when the swap picker
// (or a cues view) actually needs it. This SUPPLEMENTS src/ml/exerciseDB.js (the
// app's muscle-taxonomy used by the heatmap/volume engine), it does not replace it.
let _cache = null;

// Timed/hold movements log seconds, not reps. Sync name heuristic so it works
// without loading the library; override per-exercise via exercise.kind.
const HOLD_RE = /\b(plank|hold|hang|l-?sit|wall ?sit|carry|farmer|isometric|dead ?hang)\b/i;
export function inferSetKind(name) {
  return HOLD_RE.test(name || "") ? "hold" : "straight";
}

export async function loadExerciseLibrary() {
  if (!_cache) {
    const mod = await import("@/data/exerciseLibrary.json");
    _cache = mod.default;
  }
  return _cache;
}

// Sorted name list for the swap/replace picker.
export async function getLibraryNames() {
  const lib = await loadExerciseLibrary();
  return lib.map((e) => e.name).sort((a, b) => a.localeCompare(b));
}

// Full record for an exercise name (instructions/cues, muscles, equipment).
export async function getExerciseInfo(name) {
  if (!name) return null;
  const lib = await loadExerciseLibrary();
  const n = name.toLowerCase().trim();
  return lib.find((e) => e.name.toLowerCase() === n) || null;
}
