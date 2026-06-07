// analyze-physique — estimate body composition from an uploaded photo.
// User-triggered (verify_jwt on). Reads the image from the private 'physique'
// bucket via a short-lived signed URL, sends it to a Groq vision model, stores
// the structured assessment in physique_entries.
//
// HONEST LIMITATION: photo-based bodyfat is low-accuracy in absolute terms.
// The value is TREND over time + composition cues, not a precise number. The
// prompt and the stored confidence reflect that.
//
// Model is overridable via GROQ_VISION_MODEL (no redeploy needed if Groq's
// vision model id changes).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const USER_ID      = Deno.env.get("USER_ID")!;
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;
const GROQ_VISION_MODEL = Deno.env.get("GROQ_VISION_MODEL") || "meta-llama/llama-4-scout-17b-16e-instruct";

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

  const mediaType = (body.media_type as string) || "photo";
  const weightLb  = body.weight_lb ?? null;
  const pose      = (body.pose as string) || null;
  const takenAt   = (body.taken_at as string) || new Date().toISOString().slice(0, 10);

  // Videos aren't auto-analyzed (vision model takes stills) — store the entry only.
  if (mediaType === "video") {
    const { data, error } = await supabase.from("physique_entries").insert({
      created_by: USER_ID, photo_path: path, media_type: "video",
      taken_at: takenAt, weight_lb: weightLb, pose,
      analysis: { note: "Video stored; auto-analysis runs on photos. Upload a still for an estimate." },
    }).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ stored: true, analyzed: false, entry: data });
  }

  // Short-lived signed URL for the private object.
  const { data: signed, error: signErr } = await supabase
    .storage.from("physique").createSignedUrl(path, 300);
  if (signErr || !signed?.signedUrl) {
    return json({ error: `could not sign storage path: ${signErr?.message ?? "unknown"}` }, 400);
  }

  const prompt =
    "You are a physique-assessment assistant. Estimate body composition from this photo. " +
    (pose ? `The subject is holding the "${pose}" pose, so judge the muscle groups that pose emphasizes. ` : "") +
    "Be honest that photo-based bodyfat is approximate. Return STRICT JSON, no prose, no markdown fences:\n" +
    '{"bodyfat_estimate": <number, percent>, "bodyfat_range": "<e.g. 12-15%>", ' +
    '"confidence": "low|medium|high", "assessment": "<1-2 sentence overall read>", ' +
    '"strengths": ["<developed/lean areas>"], "focus_areas": ["<lagging or higher-fat areas>"], ' +
    '"vs_lean_goal": "<what would visibly change at a leaner bodyfat>"}. ' +
    "Base confidence on lighting, pose, and how much of the body is visible.";

  let raw: string;
  try {
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_VISION_MODEL,
        temperature: 0.2,
        max_tokens: 700,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: signed.signedUrl } },
          ],
        }],
      }),
    });
    if (!resp.ok) return json({ error: `Groq vision error ${resp.status}: ${(await resp.text()).slice(0, 300)}` }, 502);
    const d = await resp.json() as { choices: Array<{ message: { content: string } }> };
    raw = d.choices[0].message.content.trim();
  } catch (err) {
    return json({ error: String(err) }, 502);
  }

  const analysis = extractJSON(raw);
  if (!analysis) return json({ error: "could not parse vision output", raw }, 500);

  const bf = typeof analysis.bodyfat_estimate === "number" ? analysis.bodyfat_estimate : null;
  const { data, error } = await supabase.from("physique_entries").insert({
    created_by: USER_ID,
    photo_path: path,
    media_type: "photo",
    taken_at: takenAt,
    weight_lb: weightLb,
    pose,
    bodyfat_estimate: bf,
    confidence: (analysis.confidence as string) ?? null,
    analysis,
  }).select().single();
  if (error) return json({ error: error.message }, 500);

  return json({ stored: true, analyzed: true, entry: data });
});
