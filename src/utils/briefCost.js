/**
 * Shared brief token-cost estimator so the Dashboard card and Brief History show
 * an identical ~$ value for the same brief. Prices the full token total at the
 * input rate plus a discounted cached-read rate (rough estimate, not exact).
 */
export function estimateBriefCost(brief) {
  const totalTokens = (brief?.input_tokens || 0) + (brief?.output_tokens || 0);
  if (totalTokens <= 0) return null;
  const cachedTokens = brief?.cache_read_tokens || 0;
  return `~$${((totalTokens * 0.00000025) + (cachedTokens * 0.000000025)).toFixed(4)}`;
}
