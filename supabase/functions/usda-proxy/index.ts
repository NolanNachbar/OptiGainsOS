import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const USDA_BASE_URL = "https://api.nal.usda.gov/fdc/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit: 200 requests per user per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabase
      .from("usda_request_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", oneHourAgo);

    if (countError) {
      console.error("Rate limit check failed:", countError);
    } else if ((count ?? 0) >= 200) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again in an hour." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("usda_request_log").insert({ user_id: user.id });

    const { action, ...params } = await req.json();
    const apiKey = Deno.env.get("USDA_API_KEY");

    let usdaUrl: string;

    if (action === "search") {
      const { query, pageSize = 10, dataType } = params;
      if (!query) throw new Error("query is required");
      const searchParams = new URLSearchParams({
        api_key: apiKey!,
        query,
        pageSize: String(pageSize),
        sortBy: "score",
        sortOrder: "desc",
      });
      if (dataType) searchParams.set("dataType", dataType);
      usdaUrl = `${USDA_BASE_URL}/foods/search?${searchParams}`;
    } else if (action === "detail") {
      const { fdcId } = params;
      if (!fdcId) throw new Error("fdcId is required");
      usdaUrl = `${USDA_BASE_URL}/food/${fdcId}?api_key=${apiKey}`;
    } else {
      throw new Error(`Unknown action: ${action}`);
    }

    const usdaRes = await fetch(usdaUrl);
    if (!usdaRes.ok) {
      const text = await usdaRes.text();
      return new Response(JSON.stringify({ error: "USDA API error", detail: text }), {
        status: usdaRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await usdaRes.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
