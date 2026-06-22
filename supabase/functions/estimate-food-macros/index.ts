// estimate-food-macros — "describe a food, get macros." When the athlete can't
// find an exact match in USDA/branded search, they type a plain-language
// description ("8 oz grilled chicken breast", "bowl of oatmeal with a banana")
// and an LLM returns a single-serving macro estimate to prefill the log.
//
// Stateless: input description -> structured estimate. No DB writes, no USER_ID.
// Anchoring accuracy: for a named food with an explicit portion this lands
// within ~10-20% on calories (about as good as picking a generic DB entry) — the
// dominant error is portion ambiguity, so the prompt asks the model to state the
// assumed portion and a confidence so the UI can badge it as an estimate.
//
// Model overridable via GROQ_MODEL (no redeploy if the id changes). Uses the same
// GROQ_API_KEY the other functions already rely on.

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;
const GROQ_MODEL = Deno.env.get("GROQ_MODEL") || "llama-3.3-70b-versatile";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...CORS } });

function extractJSON(raw: string): Record<string, unknown> | null {
  try { return JSON.parse(raw); } catch { /* */ }
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* */ } }
  return null;
}

const num = (v: unknown, d = 0) => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : d;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid JSON body" }, 400); }

  const description = (body.description as string)?.trim();
  if (!description) return json({ error: "missing 'description'" }, 400);
  if (description.length > 200) return json({ error: "description too long" }, 400);

  const prompt =
    `You are a sports-nutrition database. Estimate the macros for this food the athlete describes: "${description}".\n` +
    `If they gave a portion (oz, grams, cups, "a bowl", "1 medium"), use it. If not, assume ONE typical serving and say what you assumed.\n` +
    `Anchor to well-known nutrition data. Be realistic, not optimistic. Calories must roughly equal protein*4 + carbs*4 + fat*9.\n` +
    `Return STRICT JSON only, no prose, no markdown:\n` +
    `{"food_name":"<clean title-case name>","serving_description":"<the portion you costed, e.g. '8 oz (227 g)'>",` +
    `"serving_grams":<grams as a number or null>,"calories":<kcal>,"protein":<g>,"carbs":<g>,"fats":<g>,` +
    `"confidence":"low|medium|high","assumptions":"<one short line on what you assumed>"}.\n` +
    `confidence: high for a clearly specified common food + portion; low for vague or mixed restaurant dishes.`;

  let raw: string;
  try {
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 400,
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) return json({ error: `Groq error ${resp.status}: ${(await resp.text()).slice(0, 300)}` }, 502);
    const d = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
    raw = d.choices?.[0]?.message?.content?.trim() ?? "";
    if (!raw) return json({ error: "empty response from model" }, 502);
  } catch (err) {
    return json({ error: String(err) }, 502);
  }

  const est = extractJSON(raw);
  if (!est || est.calories == null) return json({ error: "could not parse estimate", raw }, 500);

  // Normalize + clamp to a sane shape the client can trust.
  const estimate = {
    food_name: String(est.food_name || description).slice(0, 80),
    serving_description: String(est.serving_description || "1 serving").slice(0, 60),
    serving_grams: est.serving_grams == null ? null : num(est.serving_grams) || null,
    calories: Math.round(num(est.calories)),
    protein: num(est.protein),
    carbs: num(est.carbs),
    fats: num(est.fats),
    confidence: ["low", "medium", "high"].includes(String(est.confidence)) ? est.confidence : "medium",
    assumptions: String(est.assumptions || "").slice(0, 200),
  };

  return json({ estimated: true, estimate });
});
