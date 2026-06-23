// read-nutrition-label — "barcode missed it? photograph the Nutrition Facts."
// The fallback when a barcode scan finds no product: the athlete snaps the label
// and the vision model READS the printed values (not guesses them), so accuracy
// is high — the numbers are right there on the panel. They type the product name
// themselves (labels don't always show a clean name).
//
// Input:  { image }  — a data URL (data:image/jpeg;base64,...) of the label
// Output: a single per-serving macro estimate to prefill the log.
//
// Uses GROQ_VISION_MODEL + GROQ_API_KEY (same keys the other functions rely on).
// Mirrors estimate-food-macros' helpers.

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;
const GROQ_VISION_MODEL = Deno.env.get("GROQ_VISION_MODEL") || "meta-llama/llama-4-scout-17b-16e-instruct";

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

  const image = (body.image as string)?.trim(); // data URL
  if (!image) return json({ error: "missing 'image'" }, 400);
  if (image.length > 10_000_000) return json({ error: "image too large; use a smaller photo" }, 413);

  const prompt =
    "You are reading a Nutrition Facts label from a photo. Extract the values EXACTLY as printed for ONE " +
    "serving (the 'per serving' column, not 'per container'). Read the numbers, do not estimate them. " +
    "If the label is partly illegible, fill what you can read and lower the confidence. " +
    "Return STRICT JSON only, no prose, no markdown:\n" +
    '{"serving_description":"<the serving size as printed, e.g. \'1 cup (240 ml)\'>",' +
    '"serving_grams":<grams/ml of one serving as a number, or null>,' +
    '"calories":<kcal per serving>,"protein":<g>,"carbs":<g>,"fats":<g>,' +
    '"confidence":"low|medium|high","note":"<one short line, e.g. what was unreadable>"}. ' +
    "confidence: high when the panel is sharp and fully legible; low when blurry or cropped.";

  let raw: string;
  try {
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: GROQ_VISION_MODEL,
        temperature: 0.1, // reading printed numbers — keep it tight
        max_tokens: 500,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: image } },
          ],
        }],
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
  if (!est || est.calories == null) return json({ error: "could not read the label", raw }, 422);

  const estimate = {
    serving_description: String(est.serving_description || "1 serving").slice(0, 60),
    serving_grams: est.serving_grams == null ? null : num(est.serving_grams) || null,
    calories: Math.round(num(est.calories)),
    protein: num(est.protein),
    carbs: num(est.carbs),
    fats: num(est.fats),
    confidence: ["low", "medium", "high"].includes(String(est.confidence)) ? est.confidence : "medium",
    note: String(est.note || "").slice(0, 200),
  };

  return json({ read: true, estimate });
});
