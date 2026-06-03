import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { 
      status: 204, 
      headers: corsHeaders 
    });
  }

  try {
    const authHeader = req.headers.get("Authorization")!;

    // Verify caller identity with anon client
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service role client — only way to read/write strava_tokens (no client RLS)
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { action, code, redirect_uri } = await req.json();
    const clientId = parseInt(Deno.env.get("STRAVA_CLIENT_ID")!, 10);
    const clientSecret = Deno.env.get("STRAVA_CLIENT_SECRET")!;

    if (action === "exchange") {
      if (!code || !redirect_uri) {
        return new Response(JSON.stringify({ error: "Missing code or redirect_uri" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const res = await fetch("https://www.strava.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return new Response(JSON.stringify({ error: data.message || "Strava API error" }), {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Store refresh_token server-side only — never returned to client
      await serviceClient.from("strava_tokens").upsert({
        user_id: user.id,
        refresh_token: data.refresh_token,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

      const { refresh_token: _rt, ...safeData } = data;
      return new Response(JSON.stringify(safeData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "refresh") {
      // Read refresh_token from secure server-side table — client never sends it
      const { data: tokenRow, error: tokenError } = await serviceClient
        .from("strava_tokens")
        .select("refresh_token")
        .eq("user_id", user.id)
        .single();

      if (tokenError || !tokenRow?.refresh_token) {
        return new Response(JSON.stringify({ error: "No Strava token found — please reconnect Strava" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const res = await fetch("https://www.strava.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: tokenRow.refresh_token,
          grant_type: "refresh_token",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return new Response(JSON.stringify({ error: data.message || "Strava refresh failed" }), {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update stored refresh_token (Strava rotates it on each refresh)
      await serviceClient.from("strava_tokens").upsert({
        user_id: user.id,
        refresh_token: data.refresh_token,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

      const { refresh_token: _rt, ...safeData } = data;
      return new Response(JSON.stringify(safeData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "disconnect") {
      await serviceClient.from("strava_tokens").delete().eq("user_id", user.id);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else {
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
