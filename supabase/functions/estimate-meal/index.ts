// estimate-meal — "describe or photograph a whole meal, get a per-item macro
// breakdown." Travel/restaurant logging when weighing every item isn't possible.
//
// Two inputs (one required):
//   { description }  — plain text, e.g. "cheeseburger, large fries, and a coke"
//   { image }        — a data URL (data:image/jpeg;base64,...) of the plate
//
// Returns a LIST of items, each with a portion estimate, so the client can drop
// them straight into the food log as separate entries the athlete confirms.
//
// Less accurate than weighing — the prompt is told to be realistic and to caveat.
// Text uses GROQ_MODEL; photo uses GROQ_VISION_MODEL (same keys the other
// functions already rely on). Mirrors estimate-food-macros' helpers.

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;
const GROQ_MODEL = Deno.env.get("GROQ_MODEL") || "llama-3.3-70b-versatile";
const GROQ_VISION_MODEL = Deno.env.get("GROQ_VISION_MODEL") || "meta-llama/llama-4-scout-17b-16e-instruct";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...CORS } });

function extractJSON(raw: string): Record<string, unknown> | null {
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  try { return JSON.parse(cleaned); } catch { /* */ }
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* */ } }
  return null;
}

const num = (v: unknown, d = 0) => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : d;
};

const INSTRUCTIONS =
  "Break the meal into individual food items. For EACH item estimate the macros for the actual portion " +
  "eaten/shown (not per 100g). Be realistic, not optimistic. Per item, calories should roughly equal " +
  "protein*4 + carbs*4 + fat*9. Skip drinks with no calories (water, black coffee). Cap at 15 items. " +
  'Return STRICT JSON only, no prose, no markdown:\n' +
  '{"items":[{"food_name":"<clean title-case name>","serving_description":"<portion, e.g. \'1 cup (185 g)\'>",' +
  '"calories":<kcal>,"protein":<g>,"carbs":<g>,"fats":<g>}],' +
  '"confidence":"low|medium|high","note":"<one short caveat line>"}';

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid JSON body" }, 400); }

  const description = (body.description as string)?.trim();
  const image = (body.image as string)?.trim(); // data URL
  if (!description && !image) return json({ error: "provide 'description' or 'image'" }, 400);
  if (description && description.length > 500) return json({ error: "description too long" }, 400);
  // ~10MB cap on the base64 data URL (a phone photo is well under this).
  if (image && image.length > 10_000_000) return json({ error: "image too large; use a smaller photo" }, 413);

  const isVision = !!image;
  const model = isVision ? GROQ_VISION_MODEL : GROQ_MODEL;
  const prompt = isVision
    ? `You are a sports-nutrition estimator looking at a photo of a meal. ${INSTRUCTIONS}`
    : `You are a sports-nutrition estimator. The athlete ate: "${description}". ${INSTRUCTIONS}`;

  const messages = isVision
    ? [{ role: "user", content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: image } },
      ] }]
    : [{ role: "user", content: prompt }];

  let raw: string;
  try {
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model,
        messages,
        temperature: isVision ? 0.7 : 0.2,
        max_tokens: 1200,
        // Vision models are flakier with forced json_object; rely on extractJSON
        // there. Text path keeps the hard JSON constraint.
        ...(isVision
          // qwen3.6-27b is a thinking model — without this it can burn the
          // whole max_tokens budget on a <think> block and never emit JSON.
          ? { reasoning_effort: "none", top_p: 0.8 }
          : { response_format: { type: "json_object" } }),
      }),
    });
    if (!resp.ok) return json({ error: `Groq error ${resp.status}: ${(await resp.text()).slice(0, 300)}` }, 502);
    const d = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
    raw = d.choices?.[0]?.message?.content?.trim() ?? "";
    if (!raw) return json({ error: "empty response from model" }, 502);
  } catch (err) {
    return json({ error: String(err) }, 502);
  }

  const parsed = extractJSON(raw);
  const rawItems = Array.isArray(parsed?.items) ? parsed!.items as unknown[] : [];
  if (!rawItems.length) return json({ error: "could not identify any foods", raw }, 422);

  const items = rawItems.slice(0, 15).map((it) => {
    const o = (it ?? {}) as Record<string, unknown>;
    return {
      food_name: String(o.food_name || "Food").slice(0, 80),
      serving_description: String(o.serving_description || "1 serving").slice(0, 60),
      calories: Math.round(num(o.calories)),
      protein: num(o.protein),
      carbs: num(o.carbs),
      fats: num(o.fats),
    };
  // Drop zero-calorie noise (e.g. water the model included anyway).
  }).filter((i) => i.calories > 0);

  if (!items.length) return json({ error: "no calorie-bearing foods found", raw }, 422);

  const confidence = ["low", "medium", "high"].includes(String(parsed?.confidence))
    ? parsed!.confidence : "medium";

  return json({
    estimated: true,
    items,
    confidence,
    note: String(parsed?.note || "Rough estimate — adjust portions before logging.").slice(0, 200),
  });
});
