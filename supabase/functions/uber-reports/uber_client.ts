// Cliente da Uber Eats Reporting API (client credentials, scope eats.report).
// O token dura ~30 dias e a Uber limita a geração de tokens, por isso fica guardado
// na tabela uber_tokens (só acessível com a service role).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const UBER_API = "https://api.uber.com";
const TOKEN_URL = "https://auth.uber.com/oauth/v2/token";

export function uberSecrets() {
  const id = Deno.env.get("UBER_CLIENT_ID");
  const secret = Deno.env.get("UBER_CLIENT_SECRET");
  return { id, secret, present: !!id && !!secret };
}

export async function getUberToken(admin: SupabaseClient, force = false): Promise<string> {
  if (!force) {
    const { data } = await admin.from("uber_tokens").select("access_token, expires_at").eq("id", 1).maybeSingle();
    if (data && new Date(data.expires_at).getTime() - Date.now() > 60 * 60 * 1000) return data.access_token;
  }
  const { id, secret, present } = uberSecrets();
  if (!present) throw new Error("Faltam os segredos UBER_CLIENT_ID / UBER_CLIENT_SECRET no Supabase.");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id!, client_secret: secret!, grant_type: "client_credentials", scope: "eats.report" }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Token Uber falhou (${res.status}): ${text.slice(0, 300)}`);
  const j = JSON.parse(text);
  const expiresAt = new Date(Date.now() + (j.expires_in ?? 2592000) * 1000).toISOString();
  await admin.from("uber_tokens").upsert({ id: 1, access_token: j.access_token, scope: j.scope, expires_at: expiresAt, updated_at: new Date().toISOString() });
  return j.access_token;
}

export async function requestReport(admin: SupabaseClient, body: {
  report_type: string; store_uuids: string[]; start_date: string; end_date: string;
}) {
  let token = await getUberToken(admin);
  let res = await fetch(`${UBER_API}/v1/eats/report`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    token = await getUberToken(admin, true);
    res = await fetch(`${UBER_API}/v1/eats/report`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`Uber ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text) as { workflow_id: string };
}
