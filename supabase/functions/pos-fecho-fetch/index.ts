// Vai buscar o PDF do fecho do POS à caixa partilhada (fechos@) através do Microsoft Graph.
// A aplicação no Azure só tem acesso a essa caixa (Exchange RBAC for Applications).
//  body: { unit_id, date: "AAAA-MM-DD" } → { ok, files: [{ name, received_at, subject, base64 }] }
// A página lê os PDFs com o mesmo leitor do upload manual e escolhe o do dia certo.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const nextDay = (d: string) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };

async function graphToken() {
  const tenant = Deno.env.get("MS_TENANT_ID"), id = Deno.env.get("MS_CLIENT_ID"), secret = Deno.env.get("MS_CLIENT_SECRET");
  if (!tenant || !id || !secret) throw new Error("A ligação ao email ainda não está configurada (faltam MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET).");
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`Microsoft recusou a ligação: ${j.error_description?.split("\n")[0] ?? j.error ?? res.status}`);
  return j.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  try {
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Sessão inválida." }, 401);

    const { unit_id, date } = await req.json().catch(() => ({}));
    if (!unit_id || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) return json({ error: "Parâmetros: unit_id e date." }, 400);
    const { data: profile } = await admin.from("profiles").select("role, unit_id, active").eq("id", user.id).maybeSingle();
    if (!profile?.active || (profile.role !== "Admin" && profile.unit_id !== unit_id)) return json({ error: "Sem permissão para esta unidade." }, 403);

    const mailbox = Deno.env.get("FECHOS_MAILBOX") || "fechos@biradosnamorados.pt";
    const token = await graphToken();
    const g = (path: string) => fetch(`https://graph.microsoft.com/v1.0${path}`, { headers: { Authorization: `Bearer ${token}` } });

    // emails recebidos entre o início do dia de trabalho e o meio-dia seguinte (fechos depois da meia-noite)
    const from = `${date}T06:00:00Z`, to = `${nextDay(date)}T12:00:00Z`;
    const filter = encodeURIComponent(`receivedDateTime ge ${from} and receivedDateTime le ${to} and hasAttachments eq true`);
    const list = await g(`/users/${encodeURIComponent(mailbox)}/messages?$filter=${filter}&$orderby=receivedDateTime desc&$top=15&$select=id,subject,receivedDateTime,from`);
    const lj = await list.json();
    if (!list.ok) {
      const m = lj?.error?.message ?? list.status;
      if (list.status === 403) return json({ error: `Sem acesso à caixa ${mailbox}. Confirme o passo 4 (acesso só à caixa fechos@).` }, 403);
      return json({ error: `Erro ao ler o email: ${m}` }, 502);
    }

    const files: { name: string; received_at: string; subject: string; base64: string }[] = [];
    for (const msg of lj.value ?? []) {
      const ar = await g(`/users/${encodeURIComponent(mailbox)}/messages/${msg.id}/attachments`);
      const aj = await ar.json();
      for (const a of aj.value ?? []) {
        const isPdf = a["@odata.type"] === "#microsoft.graph.fileAttachment" &&
          ((a.contentType ?? "").includes("pdf") || /\.pdf$/i.test(a.name ?? ""));
        if (isPdf && a.contentBytes) {
          files.push({ name: a.name, received_at: msg.receivedDateTime, subject: msg.subject ?? "", base64: a.contentBytes });
        }
      }
      if (files.length >= 6) break;
    }
    if (!files.length) return json({ ok: true, files: [], message: "Ainda não chegou nenhum fecho do POS para este dia." });
    return json({ ok: true, files });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
