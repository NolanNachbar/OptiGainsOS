/**
 * Shared brief token-cost estimator so the Dashboard card and Brief History show
 * an identical ~$ value for the same brief.
 *
 * Every brief used to be priced at one hardcoded rate regardless of which model
 * actually generated it. 74 of the 89 briefs on file came from Groq Llama and 15
 * from a Claude CLI run, so a single blended rate was wrong for all of them.
 *
 * RATES are $ per token and are a maintained constant, not a derived value —
 * update them from the vendor's pricing page when they change. A model missing
 * from the table returns null (unknown) rather than being silently priced at
 * someone else's rate.
 */
const RATES = {
  "llama-3.3-70b-versatile": { input: 0.59e-6, output: 0.79e-6, cached: 0.59e-6 },
  "claude-haiku-4-5":        { input: 1.00e-6, output: 5.00e-6, cached: 0.10e-6 },
};

// Briefs generated through a Claude Code CLI session run on Nolan's existing
// subscription, so they carry no marginal per-brief cost to display. These rows
// also record zero tokens, which is why they cannot be priced from usage.
const NO_MARGINAL_COST = [/\(CLI\)/i, /^claude-local$/i];

function ratesFor(modelUsed) {
  if (!modelUsed) return null;
  if (NO_MARGINAL_COST.some((re) => re.test(modelUsed))) return "free";
  if (RATES[modelUsed]) return RATES[modelUsed];
  // Tolerate a suffixed variant ("claude-haiku-4-5-20251001") without inventing
  // a rate for a model family that is not in the table at all.
  const key = Object.keys(RATES).find((k) => modelUsed.startsWith(k));
  return key ? RATES[key] : null;
}

export function estimateBriefCost(brief) {
  const rates = ratesFor(brief?.model_used);
  if (rates === "free") return "included";
  if (!rates) return null;

  const cached = brief?.cache_read_tokens || 0;
  const input = Math.max(0, (brief?.input_tokens || 0) - cached);
  const output = brief?.output_tokens || 0;
  if (input + output + cached <= 0) return null;

  const cost = input * rates.input + output * rates.output + cached * rates.cached;
  return `~$${cost.toFixed(4)}`;
}
