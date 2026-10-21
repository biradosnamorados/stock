import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function hashPin(pin: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(pin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { user_id, pin } = await req.json();

    if (!user_id || !pin || typeof pin !== "string" || pin.length !== 4) {
      return new Response(
        JSON.stringify({ error: "Parâmetros inválidos." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Load profile
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email, pin_hash, active, account_status")
      .eq("id", user_id)
      .maybeSingle();

    if (profileErr || !profile) {
      return new Response(
        JSON.stringify({ error: "Utilizador não encontrado." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!profile.active || profile.account_status !== "active") {
      return new Response(
        JSON.stringify({ error: "Conta inativa. Contacte o administrador." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!profile.pin_hash) {
      return new Response(
        JSON.stringify({ error: "PIN não configurado. Contacte o administrador." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const inputHash = await hashPin(pin);
    if (inputHash !== profile.pin_hash) {
      return new Response(
        JSON.stringify({ error: "PIN incorreto." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // PIN is correct — use the Admin REST API to generate a magic link
    // and extract the tokens from the hash fragment via the token_hash approach.
    // The correct approach: call generateLink and parse the returned hashed_token,
    // then exchange it via the verify endpoint.
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: profile.email,
    });

    if (linkErr || !linkData) {
      console.error("generateLink error:", linkErr);
      return new Response(
        JSON.stringify({ error: "Falha ao gerar link de autenticação." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Extract hashed_token from the action_link URL
    const actionLink = linkData.properties?.action_link;
    if (!actionLink) {
      console.error("No action_link in response:", JSON.stringify(linkData));
      return new Response(
        JSON.stringify({ error: "Falha ao obter link de autenticação." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Parse token_hash from the URL
    const url = new URL(actionLink);
    const tokenHash = url.searchParams.get("token_hash") || url.searchParams.get("token");

    if (!tokenHash) {
      console.error("No token_hash in action_link:", actionLink);
      return new Response(
        JSON.stringify({ error: "Falha ao extrair token." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Exchange token_hash for a session via the verify OTP endpoint
    const verifyRes = await fetch(`${supabaseUrl}/auth/v1/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        type: "magiclink",
        token_hash: tokenHash,
      }),
    });

    const verifyData = await verifyRes.json();

    if (!verifyRes.ok || !verifyData.access_token) {
      console.error("verify error:", JSON.stringify(verifyData));
      return new Response(
        JSON.stringify({ error: "Falha ao criar sessão." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        access_token: verifyData.access_token,
        refresh_token: verifyData.refresh_token,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno. Tente novamente." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
