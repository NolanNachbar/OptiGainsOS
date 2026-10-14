/**
 * Pure helpers for the lifting-log CSV export (one row per logged set).
 * Kept free of Supabase/DOM so it can be unit-tested in isolation.
 */

export const LIFTING_CSV_HEADER = [
  "date", "workout", "exercise", "set_number", "weight", "reps",
  "rir", "rpe", "set_type", "completed", "exercise_notes", "workout_notes",
];

export function csvCell(value) {
  const s = String(value ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

/**
 * Rows for every set in every log, oldest first. Stable: ties on date keep the
 * input order (created_at), so a re-export of the same data is byte-identical.
 * A set with no recorded set_type is exported as "working", the app default.
 */
export function buildLiftingCsvRows(logs, workoutNameById = {}) {
  const rows = [LIFTING_CSV_HEADER];
  const ordered = (logs || [])
    .map((log, i) => ({ log, i }))
    .sort((a, b) => {
      const da = String(a.log?.log_date || "");
      const db = String(b.log?.log_date || "");
      return da < db ? -1 : da > db ? 1 : a.i - b.i;
    })
    .map((x) => x.log);

  for (const log of ordered) {
    const workoutName = workoutNameById[log.workout_id] || "Quick Workout";
    for (const ex of Array.isArray(log.exercises) ? log.exercises : []) {
      for (const [idx, s] of (Array.isArray(ex?.sets) ? ex.sets : []).entries()) {
        rows.push([
          log.log_date ?? "",
          workoutName,
          ex.name ?? "",
          s.set_number ?? idx + 1,
          s.weight ?? "",
          s.reps ?? "",
          s.rir ?? "",
          s.rpe ?? "",
          s.set_type || "working",
          s.completed ? "yes" : "no",
          ex.notes ?? "",
          log.notes ?? "",
        ]);
      }
    }
  }
  return rows;
}

/**
 * Fetch every row of a query past the server's row cap by walking .range()
 * windows until a short page comes back. `makeQuery` must return a fresh,
 * deterministically ordered builder each call (ordering by a unique tiebreaker
 * is what keeps pages from overlapping or skipping).
 */
export async function fetchAllPages(makeQuery, pageSize = 1000) {
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    const page = data || [];
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}
