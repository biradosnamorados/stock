import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { month, year, unit_id, department_id } = await req.json();

    if (!month || !year) {
      return new Response(JSON.stringify({ error: "month e year são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = new Date(year, month, 0).toISOString().split("T")[0]; // last day of month

    // Fetch sessions — include ALL statuses that have entries (completed, in_progress, non_compliant, incomplete)
    let sessionsQuery = supabase
      .from("haccp_task_sessions")
      .select(`
        id, task_id, session_date, status, shift_period, filled_fields, total_fields, completed_at,
        haccp_tasks(id, name, description, frequency, department_id, departments(name)),
        units(name)
      `)
      .gte("session_date", startDate)
      .lte("session_date", endDate)
      .in("status", ["completed", "in_progress", "non_compliant", "incomplete"])
      .order("session_date")
      .order("task_id");

    if (unit_id) sessionsQuery = sessionsQuery.eq("unit_id", unit_id);
    if (department_id) sessionsQuery = sessionsQuery.eq("department_id", department_id);

    const { data: sessions, error: sessionsError } = await sessionsQuery;
    if (sessionsError) throw sessionsError;

    if (!sessions || sessions.length === 0) {
      return new Response(
        buildHtml([], month, year, null, null),
        { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    // Fetch all entries for these sessions (performed_by has no FK to profiles, join manually)
    const sessionIds = sessions.map((s: any) => s.id);
    const { data: entries, error: entriesError } = await supabase
      .from("haccp_field_entries")
      .select("*")
      .in("session_id", sessionIds)
      .order("performed_at");
    if (entriesError) throw entriesError;

    // Fetch performer names separately
    const performerIds = [...new Set((entries || []).map((e: any) => e.performed_by).filter(Boolean))];
    const profileMap: Record<string, string> = {};
    if (performerIds.length > 0) {
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", performerIds);
      (profileRows || []).forEach((p: any) => {
        profileMap[p.id] = p.full_name || p.email || p.id;
      });
    }

    // Attach performer name to each entry
    const enrichedEntries = (entries || []).map((e: any) => ({
      ...e,
      performer_name: profileMap[e.performed_by] ?? null,
    }));

    // Map entries by session id
    const entriesBySession: Record<string, any[]> = {};
    enrichedEntries.forEach((e: any) => {
      if (!entriesBySession[e.session_id]) entriesBySession[e.session_id] = [];
      entriesBySession[e.session_id].push(e);
    });

    // Get unit/department names for header
    let unitName: string | null = null;
    let deptName: string | null = null;
    if (unit_id) {
      const { data: u } = await supabase.from("units").select("name").eq("id", unit_id).maybeSingle();
      unitName = u?.name ?? null;
    }
    if (department_id) {
      const { data: d } = await supabase.from("departments").select("name").eq("id", department_id).maybeSingle();
      deptName = d?.name ?? null;
    }

    // Group sessions by department → task → date
    type SessionRow = {
      session: any;
      entries: any[];
    };
    const grouped: Record<string, Record<string, SessionRow[]>> = {};

    for (const session of sessions) {
      const task = (session as any).haccp_tasks;
      const dName = task?.departments?.name ?? task?.department_id ?? "Sem departamento";
      const tName = task?.name ?? "Tarefa desconhecida";
      if (!grouped[dName]) grouped[dName] = {};
      if (!grouped[dName][tName]) grouped[dName][tName] = [];
      grouped[dName][tName].push({
        session,
        entries: entriesBySession[session.id] || [],
      });
    }

    const html = buildHtml(grouped, month, year, unitName, deptName);

    return new Response(html, {
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message || "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

const MONTHS_PT = [
  "", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const STATUS_LABELS: Record<string, string> = {
  completed: "Concluído",
  in_progress: "Em curso",
  non_compliant: "Não conforme",
  incomplete: "Incompleto",
};

const STATUS_COLORS: Record<string, string> = {
  completed: "#16a34a",
  in_progress: "#2563eb",
  non_compliant: "#dc2626",
  incomplete: "#d97706",
};

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function formatTime(isoStr: string): string {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  return d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

function formatValue(entry: any): string {
  if (entry.input_type === "checkbox") return entry.value_boolean ? "✓ Sim" : "✗ Não";
  if (entry.input_type === "numeric") return entry.value_numeric != null ? String(entry.value_numeric) : "—";
  if (entry.input_type === "photo") return entry.value_photo_url ? `[FOTO]` : "—";
  if (entry.input_type === "datetime") return entry.value_datetime ? formatTime(entry.value_datetime) : "—";
  if (entry.input_type === "text") return entry.value_text || "—";
  return "—";
}

function buildHtml(
  grouped: Record<string, Record<string, { session: any; entries: any[] }[]>>,
  month: number,
  year: number,
  unitName: string | null,
  deptName: string | null,
): string {
  const monthLabel = MONTHS_PT[month];
  const hasData = Object.keys(grouped).length > 0;

  let body = "";

  if (!hasData) {
    body = `<div class="empty">Nenhum registo encontrado para o período selecionado.</div>`;
  } else {
    for (const [dept, tasks] of Object.entries(grouped)) {
      body += `<div class="dept-block"><h2 class="dept-title">${dept}</h2>`;

      for (const [taskName, sessionRows] of Object.entries(tasks)) {
        body += `<div class="task-block">
          <h3 class="task-title">${taskName}</h3>`;

        for (const { session, entries } of sessionRows) {
          const status = session.status as string;
          const statusLabel = STATUS_LABELS[status] || status;
          const statusColor = STATUS_COLORS[status] || "#64748b";
          const performedBy = entries.length > 0
            ? (entries[0].performer_name || "—")
            : "—";
          const completedTime = session.completed_at ? formatTime(session.completed_at) : (
            entries.length > 0 ? formatTime(entries[entries.length - 1].performed_at) : "—"
          );
          const unitName2 = (session as any).units?.name ?? "";

          body += `<div class="session-card">
            <div class="session-header">
              <div class="session-meta">
                <span class="session-date">${formatDate(session.session_date)}</span>
                ${unitName2 ? `<span class="session-unit">${unitName2}</span>` : ""}
                <span class="session-user">${performedBy}</span>
                ${completedTime !== "—" ? `<span class="session-time">${completedTime}</span>` : ""}
              </div>
              <span class="session-status" style="color:${statusColor};border-color:${statusColor}">${statusLabel}</span>
            </div>`;

          if (entries.length > 0) {
            // Group entries by field label (deduplicate — keep last per label)
            const lastByLabel: Record<string, any> = {};
            for (const e of entries) {
              lastByLabel[e.input_label] = e;
            }
            const uniqueEntries = Object.values(lastByLabel);

            body += `<table class="entries-table">
              <thead><tr><th>Campo</th><th>Valor</th><th>Estado</th><th>Hora</th></tr></thead>
              <tbody>`;

            for (const e of uniqueEntries) {
              const fieldStatus = e.field_status === "non_compliant"
                ? `<span style="color:#dc2626;font-weight:600">Não conforme</span>`
                : e.field_status === "compliant"
                  ? `<span style="color:#16a34a">Conforme</span>`
                  : "—";

              const isPhoto = e.input_type === "photo" && e.value_photo_url;

              if (isPhoto) {
                // Photo gets a full-width row
                body += `<tr>
                  <td><strong>${e.input_label}</strong></td>
                  <td colspan="3">
                    <div class="photo-cell">
                      <img src="${e.value_photo_url}" class="photo-report" alt="${e.input_label}" />
                      <div class="photo-meta">${fieldStatus} &nbsp;·&nbsp; ${formatTime(e.performed_at)}${e.performer_name ? ` &nbsp;·&nbsp; ${e.performer_name}` : ""}</div>
                    </div>
                  </td>
                </tr>`;
              } else {
                const val = formatValue(e);
                body += `<tr>
                  <td>${e.input_label}</td>
                  <td>${val}</td>
                  <td>${fieldStatus}</td>
                  <td class="time-cell">${formatTime(e.performed_at)}</td>
                </tr>`;
              }

              if (e.observation) {
                body += `<tr class="obs-row"><td colspan="4">Obs: ${e.observation}</td></tr>`;
              }
            }

            body += `</tbody></table>`;
          } else {
            body += `<p class="no-entries">Sessão iniciada mas sem registos de campo.</p>`;
          }

          body += `</div>`; // session-card
        }

        body += `</div>`; // task-block
      }

      body += `</div>`; // dept-block
    }
  }

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<title>Relatório HACCP — ${monthLabel} ${year}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1e293b; background: #fff; }
  .report-header { padding: 24px 32px 16px; border-bottom: 2px solid #0f172a; }
  .report-header h1 { font-size: 20px; font-weight: 700; color: #0f172a; }
  .report-header .meta { font-size: 11px; color: #64748b; margin-top: 4px; }
  .content { padding: 16px 32px 32px; }
  .dept-block { margin-bottom: 28px; }
  .dept-title { font-size: 14px; font-weight: 700; color: #0f172a; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 4px; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
  .task-block { margin-bottom: 20px; }
  .task-title { font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 8px; padding-left: 8px; border-left: 3px solid #3b82f6; }
  .session-card { border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 10px; overflow: hidden; }
  .session-header { display: flex; align-items: center; justify-content: space-between; background: #f8fafc; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; }
  .session-meta { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .session-date { font-weight: 700; color: #0f172a; }
  .session-unit { background: #e2e8f0; color: #475569; padding: 1px 6px; border-radius: 3px; font-size: 10px; }
  .session-user { color: #475569; }
  .session-time { color: #94a3b8; font-size: 11px; }
  .session-status { font-size: 10px; font-weight: 700; border: 1px solid; border-radius: 3px; padding: 2px 6px; white-space: nowrap; }
  .entries-table { width: 100%; border-collapse: collapse; }
  .entries-table th { background: #f1f5f9; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; padding: 5px 10px; text-align: left; border-bottom: 1px solid #e2e8f0; }
  .entries-table td { padding: 5px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  .entries-table tr:last-child td { border-bottom: none; }
  .entries-table tr:nth-child(even) { background: #fafafa; }
  .obs-row td { font-size: 10px; color: #94a3b8; padding: 2px 10px 5px; font-style: italic; }
  .time-cell { color: #94a3b8; font-size: 10px; white-space: nowrap; }
  .photo-thumb { max-width: 80px; max-height: 60px; object-fit: cover; border-radius: 4px; border: 1px solid #e2e8f0; display: block; }
  .photo-cell { padding: 8px 0; }
  .photo-report { max-width: 340px; width: 100%; max-height: 280px; object-fit: contain; border-radius: 6px; border: 1px solid #cbd5e1; display: block; background: #f8fafc; }
  .photo-meta { font-size: 10px; color: #64748b; margin-top: 5px; }
  .no-entries { font-size: 11px; color: #94a3b8; font-style: italic; padding: 8px 12px; }
  .empty { text-align: center; color: #94a3b8; padding: 48px; font-size: 14px; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }
  @media print {
    body { font-size: 11px; }
    .dept-block { page-break-inside: avoid; }
    .session-card { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="report-header">
  <h1>Relatório HACCP — ${monthLabel} ${year}</h1>
  <div class="meta">
    ${unitName ? `Unidade: <strong>${unitName}</strong> &nbsp;|&nbsp; ` : ""}
    ${deptName ? `Departamento: <strong>${deptName}</strong> &nbsp;|&nbsp; ` : ""}
    Gerado em: ${new Date().toLocaleString("pt-PT")}
  </div>
</div>
<div class="content">
  ${body}
  <div class="footer">Bira dos Namorados · Sistema HACCP · Relatório gerado automaticamente</div>
</div>
</body>
</html>`;
}
