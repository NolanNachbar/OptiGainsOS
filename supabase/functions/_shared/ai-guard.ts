// Shared auth + rate-limit guard for the Groq-backed estimate functions.
// Mirrors usda-proxy: require a real signed-in user (the public anon key is a
// valid JWT, so the gateway's default check alone does not prove a user), then
// cap requests per user per hour so a leaked session cannot run up the Groq bill.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const HOURLY_LIMIT = 60;

export type GuardResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string };

export async function guardAiRequest(req: Request, fn: string): Promise<GuardResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { ok: false, status: 401, error: "Missing authorization" };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, status: 401, error: "Unauthorized" };

  // Fail open if the log table is unavailable (migration not yet applied): the
  // auth check above is the primary protection; the limit is defence in depth.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("ai_request_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", oneHourAgo);

  if (countError) {
    console.error(`[${fn}] rate limit check failed:`, countError.message);
  } else {
    if ((count ?? 0) >= HOURLY_LIMIT) {
      return { ok: false, status: 429, error: "Rate limit exceeded. Try again in an hour." };
    }
    await supabase.from("ai_request_log").insert({ user_id: user.id, fn });
  }

  return { ok: true, userId: user.id };
}
