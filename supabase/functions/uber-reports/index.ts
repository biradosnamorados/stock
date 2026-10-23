// Pede relatórios à Uber Eats. O resultado chega mais tarde pelo webhook (uber-webhook).
//  { action: "check" }                       -> estado dos segredos e do token (sem expor nada)
//  { action: "request", report_type, start_date, end_date, unit_id? }  -> Admin/Chefe
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getUberToken, requestReport, uberSecrets, UBER_ENV } from "./uber_client.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Cron-Key",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const REPORT_TYPES = new Set([
  "PAYMENT_DETAILS_REPORT", "ORDER_ERRORS_MENU_ITEM_REPORT", "ORDER_ERRORS_TRANSACTION_REPORT",
  "ORDER_HISTORY_REPORT", "DOWNTIME_REPORT", "CUSTOMER_AND_DELIVERY_FEEDBACK_REPORT",
  "MENU_ITEM_FEEDBACK_REPORT", "ORDERS_AND_ITEMS_REPORT", "FINANCE_SUMMARY_REPORT",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({}));

  try {
    if (body.action === "check") {
      const s = uberSecrets();
      if (!s.present) return json({ secrets: false, token: false });
      try {
        await getUberToken(admin, !!body.force);
        return json({ secrets: true, token: true, env: UBER_ENV });
      } catch (e) {
        return json({ secrets: true, token: false, env: UBER_ENV, error: (e as Error).message });
      }
    }

    // Pedido automático noturno (pg_cron): últimos 7 dias, todas as lojas ativas.
    // A Uber só fecha os valores ~72h depois; os repetidos são eliminados na vista uber_orders.
    if (body.action === "cron") {
      const { data: cfg } = await admin.from("uber_cron_config").select("cron_key").eq("id", 1).maybeSingle();
      if (!cfg || req.headers.get("x-cron-key") !== cfg.cron_key) return json({ error: "Não autorizado." }, 401);
      const lisbon = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(d);
      const end = lisbon(new Date(Date.now() - 1 * 86400000));
      const start = lisbon(new Date(Date.now() - 7 * 86400000));
      const { data: stores } = await admin.from("uber_stores").select("store_uuid").eq("active", true);
      const storeUuids = (stores ?? []).map((s) => s.store_uuid);
      if (!storeUuids.length) return json({ ok: true, skipped: "sem lojas" });
      const { data: reqRow } = await admin.from("uber_report_requests").insert({
        report_type: "PAYMENT_DETAILS_REPORT", store_uuids: storeUuids, start_date: start, end_date: end,
      }).select("id").single();
      try {
        const r = await requestReport(admin, { report_type: "PAYMENT_DETAILS_REPORT", store_uuids: storeUuids, start_date: start, end_date: end });
        await admin.from("uber_report_requests").update({ workflow_id: r.workflow_id }).eq("id", reqRow!.id);
        return json({ ok: true, workflow_id: r.workflow_id, start, end });
      } catch (e) {
        await admin.from("uber_report_requests").update({ status: "error", error: (e as Error).message }).eq("id", reqRow!.id);
        return json({ ok: false, error: (e as Error).message }, 502);
      }
    }

    // a partir daqui é preciso utilizador Admin/Chefe
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Sessão inválida." }, 401);
    const { data: profile } = await admin.from("profiles").select("role, unit_id, active").eq("id", user.id).maybeSingle();
    if (!profile?.active || !["Admin", "Chefe"].includes(profile.role)) return json({ error: "Sem permissão." }, 403);

    if (body.action !== "request") return json({ error: "Ação desconhecida." }, 400);

    const reportType = String(body.report_type ?? "PAYMENT_DETAILS_REPORT");
    if (!REPORT_TYPES.has(reportType)) return json({ error: "Tipo de relatório inválido." }, 400);
    const re = /^\d{4}-\d{2}-\d{2}$/;
    if (!re.test(body.start_date ?? "") || !re.test(body.end_date ?? "")) return json({ error: "Datas AAAA-MM-DD." }, 400);

    const unitId = profile.role === "Admin" ? (body.unit_id ?? null) : profile.unit_id;
    let q = admin.from("uber_stores").select("store_uuid").eq("active", true);
    if (unitId) q = q.eq("unit_id", unitId);
    const { data: stores } = await q;
    const storeUuids = (stores ?? []).map((s) => s.store_uuid);
    if (!storeUuids.length) return json({ error: "Sem lojas Uber configuradas." }, 400);

    const { data: reqRow, error: insErr } = await admin.from("uber_report_requests").insert({
      report_type: reportType, store_uuids: storeUuids, start_date: body.start_date, end_date: body.end_date,
      requested_by: user.id,
    }).select("id").single();
    if (insErr) throw insErr;

    try {
      const r = await requestReport(admin, {
        report_type: reportType, store_uuids: storeUuids, start_date: body.start_date, end_date: body.end_date,
      });
      await admin.from("uber_report_requests").update({ workflow_id: r.workflow_id }).eq("id", reqRow.id);
      return json({ ok: true, workflow_id: r.workflow_id });
    } catch (e) {
      const msg = (e as Error).message;
      await admin.from("uber_report_requests").update({ status: "error", error: msg }).eq("id", reqRow.id);
      return json({ ok: false, error: msg }, 502);
    }
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
