/** Pure helpers for the design-system components (kept out of the .jsx files so
 *  React Fast Refresh stays happy — component files export only components). */

// Physiological spectrum bands — hue-coded per the Vapor×Macro identity:
// teal = primed/positive, green = ready, amber = caution, coral = recover.
export function bandFor(value) {
  if (value == null) return { color: "var(--text-faint)", label: "—" };
  if (value >= 85) return { color: "var(--hue-teal)", label: "Primed" };
  if (value >= 70) return { color: "var(--hue-green)", label: "Ready" };
  if (value >= 50) return { color: "var(--warn)", label: "Moderate" };
  return { color: "var(--bad)", label: "Recover" };
}

export function verdictKey(score) {
  if (score == null) return "unknown";
  if (score >= 85) return "primed";
  if (score >= 70) return "ready";
  if (score >= 50) return "moderate";
  return "recover";
}
