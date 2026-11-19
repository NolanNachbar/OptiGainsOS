// Basis line for the day's calorie target. Only fields the engine (or the
// athlete) actually emitted appear; nothing is invented to fill the line.
export function targetBasis(targets) {
  if (!targets || !(targets.calories > 0)) return null;
  const kcal = `${Math.round(targets.calories).toLocaleString()} kcal`;
  if (targets.manualOverride) return { line: `${kcal}: set by you for this day` };
  if (targets.phasePending) return { line: `${kcal}: last night's numbers until the engine runs on the new phase` };
  const rec = targets.recommended;
  if (targets.engineSet && rec) {
    const parts = [];
    if (rec.kcal_deficit) parts.push(`${Math.round(rec.kcal_deficit).toLocaleString()} kcal deficit`);
    if (rec.deficit_ratio) parts.push(`${Math.round(rec.deficit_ratio * 100)}% of maintenance`);
    if (rec.protein_g) parts.push(`protein ${Math.round(rec.protein_g)} g`);
    if (rec.fat_floor_g) parts.push(`fat floor ${Math.round(rec.fat_floor_g)} g`);
    return {
      line: `${kcal}: ${parts.length ? parts.join(", ") : "engine target"}`,
      detail: rec.rationale || null,
    };
  }
  return { line: `${kcal}: saved goal. No check-in, using defaults.` };
}
