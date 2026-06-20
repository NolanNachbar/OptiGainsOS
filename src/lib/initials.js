/**
 * deriveInitials — single source of truth for avatar initials across the chrome
 * (UserAvatar in Layout) and the Profile card (ProfileStatsCard), so the same
 * user never shows two different glyphs. Uses word-leading letters/digits only,
 * so decorative tokens like "(Local)" never bleed a stray glyph ("N(") in. Emails
 * collapse to their first character (the local-part is not a display name).
 */
export function deriveInitials(name) {
  const source = (name || "").trim();
  if (!source) return "?";
  if (source.includes("@")) return source[0].toUpperCase();
  const letters = source
    .split(/\s+/)
    .map((token) => (token.match(/[\p{L}\p{N}]/u) || [""])[0])
    .filter(Boolean);
  return (letters.join("") || source[0] || "?").toUpperCase().slice(0, 2);
}
