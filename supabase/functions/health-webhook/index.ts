import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface HealthPayload {
  date: string;
  hrv?: number;
  resting_hr?: number;
  sleep_min?: number;
  weight?: number;
  steps?: number;
  active_energy?: number;
  source?: string;
  user_id?: string; // Optional if provided in URL or header
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Basic secret check
    const authHeader = req.headers.get("Authorization");
    const secret = Deno.env.get("HEALTH_WEBHOOK_SECRET");
    if (secret && authHeader !== `Bearer ${secret}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload: HealthPayload = await req.json();
    console.log("Received health payload:", payload);

    if (!payload.date) {
      throw new Error("Missing date in payload");
    }

    // Resolve User ID
    // If not in payload, try to find the only user or use a default from ENV
    let userId = payload.user_id;
    if (!userId) {
      const defaultUserId = Deno.env.get("DEFAULT_USER_ID");
      if (defaultUserId) {
        userId = defaultUserId;
      } else {
        // Fallback: Get the first user profile (it's a Personal OS)
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("created_by")
          .limit(1)
          .single();
        userId = profile?.created_by;
      }
    }

    if (!userId) {
      throw new Error("Could not resolve user_id");
    }

    const source = payload.source || "apple_health";

    // Upsert into recovery_metrics
    const { error: upsertError } = await supabase
      .from("recovery_metrics")
      .upsert({
        created_by: userId,
        date: payload.date,
        source: source,
        ah_hrv: payload.hrv,
        ah_resting_hr: payload.resting_hr,
        ah_sleep_min: payload.sleep_min,
        ah_weight: payload.weight,
        ah_active_energy_kcal: payload.active_energy,
        ah_steps: payload.steps,
        // Also map to generic fields if coming from Apple Health as primary
        hrv: payload.hrv,
        resting_hr: payload.resting_hr,
        sleep_duration_min: payload.sleep_min,
        steps: payload.steps,
        active_calories: payload.active_energy,
        raw_payload: payload,
        updated_at: new Date().toISOString(),
      }, { onConflict: "created_by,date,source" });

    if (upsertError) throw upsertError;

    // Also update current weight in user_profiles if weight is provided
    if (payload.weight) {
      await supabase
        .from("user_profiles")
        .update({ current_weight: payload.weight })
        .eq("created_by", userId);
      
      // Also add to body_weight_entries for history
      await supabase
        .from("body_weight_entries")
        .upsert({
          created_by: userId,
          recorded_date: payload.date,
          weight: payload.weight,
          notes: `Synced via ${source}`
        }, { onConflict: "created_by,recorded_date" });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
