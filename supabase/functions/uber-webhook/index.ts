// Recebe os webhooks da Uber Eats (eats.report.success), descarrega os CSV e guarda as linhas.
// A Uber assina o corpo com HMAC-SHA256 usando o Client Secret (cabeçalho X-Uber-Signature).
// Por privacidade, as colunas com dados pessoais de clientes/estafetas não são guardadas.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ok = () => new Response(null, { status: 200 });

async function hmacHex(key: string, body: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  const t = text.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

// colunas a descartar (nomes/telefones/moradas de clientes e estafetas)
const PII = /(customer|eater|cliente|courier|estafeta|driver|motorista).*(name|nome|phone|telefone|tel|address|morada|email)|^(customer|eater|cliente)$|phone|telefone|e-?mail/i;

const pick = (o: Record<string, string>, re: RegExp) => {
  const k = Object.keys(o).find((h) => re.test(h));
  return k ? o[k] : undefined;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method !== "POST") return ok();
  const raw = await req.text();
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  let payload: any = {};
  try { payload = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

  const secret = Deno.env.get("UBER_CLIENT_SECRET") ?? "";
  const got = (req.headers.get("x-uber-signature") ?? "").toLowerCase();
  const signatureOk = !!secret && !!got && got === (await hmacHex(secret, raw));

  const eventId = payload.event_id ?? crypto.randomUUID();
  const { data: ev } = await admin.from("uber_webhook_events").upsert({
    event_id: eventId, event_type: payload.event_type, job_id: payload.job_id, signature_ok: signatureOk, payload,
  }, { onConflict: "event_id" }).select("id, processed_at").single();

  if (!signatureOk) return new Response("invalid signature", { status: 401 });
  if (ev?.processed_at) return ok(); // repetido
  if (payload.event_type !== "eats.report.success") {
    await admin.from("uber_webhook_events").update({ processed_at: new Date().toISOString() }).eq("event_id", eventId);
    return ok();
  }

  // responder já à Uber e processar em segundo plano
  const work = (async () => {
    const jobId: string = payload.job_id ?? eventId;
    try {
      const { data: reqs } = await admin.from("uber_report_requests").select("id, workflow_id").not("workflow_id", "is", null).eq("status", "requested");
      const match = (reqs ?? []).find((r) => jobId === r.workflow_id || jobId.startsWith(r.workflow_id) || jobId.includes(r.workflow_id));

      let total = 0;
      for (const s of payload.report_metadata?.sections ?? []) {
        const res = await fetch(s.download_url);
        if (!res.ok) throw new Error(`Download ${res.status} (${s.section_id})`);
        const rows = parseCsv(await res.text());
        if (rows.length < 2) continue;
        const headers = rows[0].map((h) => h.trim());
        const keep = headers.map((h) => !PII.test(h));
        const out = rows.slice(1).map((r, i) => {
          const data: Record<string, string> = {};
          headers.forEach((h, j) => { if (keep[j] && h) data[h] = (r[j] ?? "").trim(); });
          const store = pick(data, /store.*(uuid|id)|loja.*id/i);
          return {
            request_id: match?.id ?? null,
            job_id: jobId,
            report_type: payload.report_type,
            section_id: s.section_id ?? "0",
            row_num: i + 1,
            store_uuid: store && UUID.test(store) ? store : null,
            order_id: pick(data, /^(order.?id|workflow.?id|id do pedido|pedido)$/i) ?? pick(data, /order.*id|pedido/i) ?? null,
            data,
          };
        });
        for (let i = 0; i < out.length; i += 500) {
          const { error } = await admin.from("uber_report_rows").upsert(out.slice(i, i + 500), { onConflict: "job_id,section_id,row_num" });
          if (error) throw new Error(error.message);
        }
        total += out.length;
      }
      if (match) await admin.from("uber_report_requests").update({ status: "done", completed_at: new Date().toISOString(), row_count: total }).eq("id", match.id);
      await admin.from("uber_webhook_events").update({ processed_at: new Date().toISOString(), error: null }).eq("event_id", eventId);
    } catch (e) {
      await admin.from("uber_webhook_events").update({ error: (e as Error).message }).eq("event_id", eventId);
    }
  })();
  // @ts-ignore EdgeRuntime existe no Supabase
  EdgeRuntime.waitUntil(work);
  return ok();
});
