/**
 * "Why this weight" lines for the logger, built ONLY from fields the engine
 * actually wrote on today's strength_block row (session_generator.py builds
 * `ex_detail` with: load_lbs, load_pct, reps, rir, notes; merged lifts carry a
 * `set_scheme` of blocks with the same fields plus cut_note / soreness_note).
 *
 *   load_lbs  engine load = round5(current_e1rm * load_pct)
 *   load_pct  fraction of the lift's current e1RM, already including the
 *             reps+RIR conversion, the day's MPC intensity and any
 *             interference back-off
 *   notes / cut_note / soreness_note  engine-authored free text
 *
 * No numbers are derived or invented here; a row with none of these returns
 * null and the UI shows nothing. A block is only reported while a logged set
 * still carries its load, so an edited weight never sits under a stale
 * explanation of a different number.
 *
 * @returns {string[]|null}
 */
export function buildLoadWhy(engineRow, sets, unit = "lb") {
  if (!engineRow || typeof engineRow !== "object") return null;
  const blocks = Array.isArray(engineRow.set_scheme) && engineRow.set_scheme.length
    ? engineRow.set_scheme
    : [engineRow];
  const weights = new Set((sets || []).map((s) => Number(s?.weight)).filter((w) => w > 0));
  const blockLines = [];
  const lines = [];
  const seenNotes = new Set();
  const addNote = (t) => {
    const s = typeof t === "string" ? t.trim() : "";
    if (s && !seenNotes.has(s)) { seenNotes.add(s); lines.push(s); }
  };
  let matched = 0;
  for (const b of blocks) {
    const load = Number(b?.load_lbs);
    if (!(load > 0) || !weights.has(load)) continue;
    matched++;
    const bits = [`${load} ${unit}`];
    const pct = Number(b.load_pct);
    if (pct > 0) bits.push(`${Math.round(pct * 100)}% of current e1RM`);
    const reps = b.reps ?? b.rep_target;
    if (reps != null && reps !== "") {
      const rir = b.rir ?? b.rir_target;
      bits.push(`${reps} reps${rir != null && rir !== "" ? ` @ RIR ${rir}` : ""}`);
    }
    blockLines.push(`${b.label ? `${b.label}: ` : ""}${bits.join(" · ")}`);
    addNote(b.notes);
    addNote(b.cut_note);
    addNote(b.soreness_note);
  }
  if (matched === 0) return null;
  return [...blockLines, ...lines];
}
