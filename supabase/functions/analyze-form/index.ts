// analyze-form — Coach office hours. Critique exercise form from an uploaded
// video clip. Single-user app: service role + fixed USER_ID, same as
// analyze-physique. Reads the clip from the private 'physique' bucket (under a
// form/ prefix) via a short-lived signed URL, inlines it to Gemini, returns a
// structured critique.
//
// Gemini reads VIDEO natively (unlike the Groq stills model in analyze-physique),
// so no client-side frame extraction is needed.
//
// HONEST LIMITATION: a single phone angle hides depth and load. Critique is
// reliable on side-view squat/deadlift/bench and gets vague on rotational or
// off-axis work. The prompt + returned confidence reflect that.
//
// Model overridable via GEMINI_MODEL (no redeploy if the id changes).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const USER_ID = Deno.env.get("USER_ID")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";

// Gemini inline_data caps the whole request near 20MB; base64 inflates ~33%, so
// keep source clips under ~14MB. Bigger clips → Files API (the upgrade path).
const MAX_BYTES = 14 * 1024 * 1024;

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });

function extractJSON(raw: string): Record<string, unknown> | null {
  try { return JSON.parse(raw); } catch { /* */ }
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* */ } }
  return null;
}

// ArrayBuffer → base64 in chunks (String.fromCharCode spread blows the stack on
// multi-MB buffers).
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid JSON body" }, 400); }

  const path = body.path as string | undefined;
  if (!path) return json({ error: "missing 'path' (storage path in the physique bucket)" }, 400);
  const exercise = (body.exercise as string)?.trim() || "the lift";
  const notes = (body.notes as string)?.trim() || "";

  // Short-lived signed URL for the private object.
  const { data: signed, error: signErr } = await supabase
    .storage.from("physique").createSignedUrl(path, 300);
  if (signErr || !signed?.signedUrl) {
    return json({ error: `could not sign storage path: ${signErr?.message ?? "unknown"}` }, 400);
  }

  // Fetch the clip bytes and inline them.
  let dataB64: string, mimeType: string;
  try {
    const vidRes = await fetch(signed.signedUrl);
    if (!vidRes.ok) return json({ error: `could not read clip: ${vidRes.status}` }, 502);
    const buf = await vidRes.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      return json({
        error: `clip is ${(buf.byteLength / 1024 / 1024).toFixed(1)}MB; keep it under ${MAX_BYTES / 1024 / 1024}MB (trim to a few reps).`,
      }, 413);
    }
    mimeType = vidRes.headers.get("content-type") || "video/mp4";
    dataB64 = toBase64(buf);
  } catch (err) {
    return json({ error: `clip read failed: ${String(err)}` }, 502);
  }

  const prompt =
    `You are a strict, experienced strength coach reviewing a video of ${exercise}. ` +
    (notes ? `The lifter notes: "${notes}". ` : "") +
    "Watch the full clip and critique technique like a coach at office hours: specific, actionable, prioritized. " +
    "Be honest about what a single camera angle can and cannot show (depth, load, bracing are partly invisible) and set confidence accordingly. " +
    "Do NOT invent faults you cannot see. Return STRICT JSON only, no prose, no markdown fences:\n" +
    '{"exercise": "<what you see being performed>", ' +
    '"overall": "<2-3 sentence read of the set>", ' +
    '"rating": <number 1-10, technique quality>, ' +
    '"confidence": "low|medium|high", ' +
    '"good": ["<things done well>"], ' +
    '"fixes": [{"issue": "<the fault>", "why": "<why it matters>", "cue": "<one coaching cue to fix it>"}], ' +
    '"safety_flags": ["<anything risky enough to stop the set>"]}. ' +
    "Order fixes most-to-least important. If form looks solid, say so and keep fixes short.";

  let raw: string;
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: dataB64 } },
            ],
          }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1200, responseMimeType: "application/json" },
        }),
      },
    );
    if (!resp.ok) return json({ error: `Gemini error ${resp.status}: ${(await resp.text()).slice(0, 300)}` }, 502);
    const d = await resp.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    raw = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    if (!raw) return json({ error: "empty response from Gemini", detail: JSON.stringify(d).slice(0, 300) }, 502);
  } catch (err) {
    return json({ error: String(err) }, 502);
  }

  const critique = extractJSON(raw);
  if (!critique) return json({ error: "could not parse critique", raw }, 500);

  // Persist the review so it survives a reload (mirrors analyze-physique). The
  // full critique lives in `result`; rating/confidence are denormalized for the
  // history list. confidence comes back as low|medium|high — map to a numeric
  // 1-3 for the numeric column while the original string stays in `result`.
  const rating = typeof critique.rating === "number" ? critique.rating : null;
  const confMap: Record<string, number> = { low: 1, medium: 2, high: 3 };
  const confidence = confMap[String(critique.confidence).toLowerCase()] ?? null;

  // Resilient: a failed insert must not break the critique response.
  const { error: insErr } = await supabase.from("form_reviews").insert({
    created_by: USER_ID,
    clip_path: path,
    exercise: (body.exercise as string)?.trim() || null,
    focus_note: notes || null,
    result: critique,
    rating,
    confidence,
  });
  if (insErr) console.error("form_reviews insert failed:", insErr.message);

  return json({ analyzed: true, critique });
});
