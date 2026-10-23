import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { cashmaticPost } from "./cashmatic_client.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// "13:02:16 19/10/2026" (hora de Lisboa) -> ISO UTC
function lisbonToIso(s?: string | null): string | null {
  if (!s) return null;
  const [t, d] = s.trim().split(" ");
  if (!t || !d) return null;
  const [dd, mm, yy] = d.split("/");
  const asUtc = new Date(`${yy}-${mm}-${dd}T${t}Z`);
  if (isNaN(asUtc.getTime())) return null;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Lisbon", hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(asUtc).map((x) => [x.type, x.value]),
  );
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return new Date(asUtc.getTime() - (wall - asUtc.getTime())).toISOString();
}

// Dia de trabalho: das 09:00 do dia do fecho às 08:59:59 do dia seguinte,
// para apanhar os fechos feitos depois da meia-noite.
const BUSINESS_DAY_START = "09:00:00";
const BUSINESS_DAY_END = "08:59:59";

function nextDay(date: string) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  let unitId: string | undefined;

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Sessão inválida." }, 401);

    const body = await req.json().catch(() => ({}));
    unitId = body.unit_id;
    const date: string = body.date;
    const test: boolean = !!body.test;
    if (!unitId || (!test && !/^\d{4}-\d{2}-\d{2}$/.test(date ?? ""))) {
      return json({ error: "Parâmetros: unit_id e date (AAAA-MM-DD)." }, 400);
    }

    const { data: profile } = await admin.from("profiles").select("role, unit_id, active").eq("id", user.id).maybeSingle();
    if (!profile?.active || (profile.role !== "Admin" && profile.unit_id !== unitId)) {
      return json({ error: "Sem permissão para esta unidade." }, 403);
    }

    const { data: creds, error: credErr } = await admin.rpc("get_cashmatic_credentials", { p_unit_id: unitId });
    const c = creds?.[0];
    if (credErr || !c) return json({ error: "Cashmatic não configurado para esta unidade." }, 404);
    if (!c.enabled) return json({ error: "Integração Cashmatic desativada." }, 400);
    if (!c.password) return json({ error: "Palavra-passe Cashmatic em falta." }, 400);

    const target = { host: c.host, port: c.port, tlsName: c.local_ip || "10.0.0.10" };
    const login = await cashmaticPost(target, "/api/user/Login", { username: c.username, password: c.password });
    const token = login.token as string;

    if (test) {
      await admin.from("unit_cashmatic_settings").update({ last_sync_at: new Date().toISOString(), last_sync_status: "ok", last_sync_error: null }).eq("unit_id", unitId);
      return json({ ok: true, message: "Ligação à máquina OK." });
    }

    const txs = await cashmaticPost(target, "/api/report/GetTransactions", {
      userId: 0,
      startTime: `${date} ${BUSINESS_DAY_START}`,
      endTime: `${nextDay(date)} ${BUSINESS_DAY_END}`,
      operations: { payment: true },
    }, token) as any[];

    const rows = (txs ?? []).map((t) => ({
      unit_id: unitId,
      device_tx_id: t.id,
      operation: t.operation,
      success: t.success,
      end_type: t.endType,
      requested_cents: t.requested,
      inserted_cents: t.inserted,
      dispensed_cents: t.dispensed,
      not_dispensed_cents: t.notDispensed,
      started_at: lisbonToIso(t.startTime),
      ended_at: lisbonToIso(t.endTime),
      business_date: date,
      source_ip: t.source,
      reason: t.reason,
      reference: t.reference,
      device_username: t.username,
      raw: t,
      synced_at: new Date().toISOString(),
    }));

    if (rows.length) {
      const { error } = await admin.from("cashmatic_transactions").upsert(rows, { onConflict: "unit_id,device_tx_id" });
      if (error) throw new Error("Erro a gravar transações: " + error.message);
    }

    const ok = rows.filter((r) => r.operation === "payment" && r.success !== false && r.end_type === "normal");
    const totalCents = ok.reduce((s, r) => s + ((r.inserted_cents ?? 0) - (r.dispensed_cents ?? 0)), 0);
    const total = totalCents / 100;

    await admin.from("cash_closings").update({ cashmatic_total: total }).eq("unit_id", unitId).eq("closing_date", date).neq("status", "validated");
    await admin.from("unit_cashmatic_settings").update({ last_sync_at: new Date().toISOString(), last_sync_status: "ok", last_sync_error: null }).eq("unit_id", unitId);

    return json({
      ok: true,
      date,
      total,
      count: ok.length,
      transactions: rows.map(({ raw, unit_id, synced_at, ...r }) => r),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (unitId) await admin.from("unit_cashmatic_settings").update({ last_sync_at: new Date().toISOString(), last_sync_status: "error", last_sync_error: msg }).eq("unit_id", unitId);
    return json({ ok: false, error: msg }, 502);
  }
});
