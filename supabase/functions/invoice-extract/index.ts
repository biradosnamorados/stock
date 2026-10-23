// Lê a(s) foto(s) de uma fatura de fornecedor e devolve as linhas já associadas aos produtos
// da encomenda (ou do catálogo do fornecedor), para pré-preencher a receção de mercadoria.
// Usa a API da Anthropic (Claude) — requer o segredo ANTHROPIC_API_KEY no Supabase.
//  body: { paths: string[] (bucket "invoices"), purchase_order_id?: string, supplier_id?: string }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const TOOL = {
  name: "registar_fatura",
  description: "Regista os dados lidos da fatura e a correspondência de cada linha com o catálogo.",
  input_schema: {
    type: "object",
    properties: {
      invoice_number: { type: ["string", "null"], description: "Número da fatura (ex.: FT 2026/1234)" },
      invoice_date: { type: ["string", "null"], description: "Data da fatura AAAA-MM-DD" },
      supplier_name: { type: ["string", "null"] },
      supplier_nif: { type: ["string", "null"] },
      total_with_vat: { type: ["number", "null"] },
      lines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string", description: "Descrição tal como aparece na fatura" },
            supplier_code: { type: ["string", "null"] },
            quantity: { type: "number", description: "Quantidade tal como na fatura" },
            unit: { type: ["string", "null"], description: "Unidade da fatura (KG, UN, CX, L…)" },
            unit_price: { type: ["number", "null"], description: "Preço unitário SEM IVA, já com desconto de linha" },
            line_total: { type: ["number", "null"], description: "Total da linha sem IVA" },
            batch: { type: ["string", "null"], description: "Lote, se aparecer" },
            expiry_date: { type: ["string", "null"], description: "Validade AAAA-MM-DD, se aparecer" },
            catalog_ref: { type: ["string", "null"], description: "ref do produto do catálogo que corresponde a esta linha, ou null se não houver" },
            qty_in_purchase_units: { type: ["number", "null"], description: "Quantidade convertida para a unidade de compra do catálogo" },
            price_per_purchase_unit: { type: ["number", "null"], description: "Preço sem IVA por unidade de compra do catálogo" },
            confidence: { type: "string", enum: ["alta", "media", "baixa"] },
          },
          required: ["description", "quantity", "catalog_ref", "confidence"],
        },
      },
      warnings: { type: "array", items: { type: "string" }, description: "Problemas: foto ilegível, páginas em falta, etc." },
    },
    required: ["lines"],
  },
};

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
    const { data: profile } = await admin.from("profiles").select("role, unit_id, active").eq("id", user.id).maybeSingle();
    if (!profile?.active) return json({ error: "Sem permissão." }, 403);

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "A leitura automática ainda não está ativa (falta a chave ANTHROPIC_API_KEY). Preencha à mão — a foto fica guardada na mesma." }, 400);

    const body = await req.json().catch(() => ({}));
    const paths: string[] = (body.paths ?? []).slice(0, 6);
    if (!paths.length) return json({ error: "Sem fotos." }, 400);
    for (const p of paths) {
      if (profile.role !== "Admin" && !p.startsWith(`${profile.unit_id}/`)) return json({ error: "Sem acesso a esta foto." }, 403);
    }

    // ── catálogo para a correspondência ──
    type Cat = { ref: string; product_id: string; order_line_id: string | null; code: string; name: string; supplier_code: string | null; ordered: number | null; purchase_unit: string | null; purchase_unit_quantity: number | null; unit: string | null };
    const catalog: Cat[] = [];
    let supplierId: string | null = body.supplier_id ?? null;

    if (body.purchase_order_id) {
      const { data: po } = await admin.from("purchase_orders")
        .select("supplier_id, unit_id, purchase_order_lines(id, product_id, quantity, unit, purchase_unit, purchase_unit_quantity, products(code, name))")
        .eq("id", body.purchase_order_id).maybeSingle();
      if (!po) return json({ error: "Encomenda não encontrada." }, 404);
      if (profile.role !== "Admin" && po.unit_id !== profile.unit_id) return json({ error: "Sem acesso a esta encomenda." }, 403);
      supplierId = po.supplier_id;
      (po.purchase_order_lines ?? []).forEach((l: any) => catalog.push({
        ref: `E${catalog.length + 1}`, product_id: l.product_id, order_line_id: l.id, code: l.products?.code, name: l.products?.name,
        supplier_code: null, ordered: l.quantity, purchase_unit: l.purchase_unit, purchase_unit_quantity: l.purchase_unit_quantity, unit: l.unit,
      }));
    }
    if (supplierId) {
      const { data: sp } = await admin.from("supplier_products")
        .select("product_id, supplier_code, products(code, name, unit, purchase_unit, purchase_unit_quantity, active)")
        .eq("supplier_id", supplierId).eq("active", true).limit(400);
      for (const s of sp ?? []) {
        const p: any = (s as any).products;
        if (!p?.active) continue;
        const existing = catalog.find((c) => c.product_id === s.product_id);
        if (existing) { existing.supplier_code = s.supplier_code; continue; }
        catalog.push({
          ref: `P${catalog.length + 1}`, product_id: s.product_id, order_line_id: null, code: p.code, name: p.name,
          supplier_code: s.supplier_code, ordered: null, purchase_unit: p.purchase_unit, purchase_unit_quantity: p.purchase_unit_quantity, unit: p.unit,
        });
      }
    }

    // ── fotos ──
    const content: any[] = [];
    for (const p of paths) {
      const { data: blob, error } = await admin.storage.from("invoices").download(p);
      if (error || !blob) return json({ error: `Não foi possível abrir a foto (${p}).` }, 400);
      const b64 = encodeBase64(new Uint8Array(await blob.arrayBuffer()));
      const mt = blob.type || (p.endsWith(".pdf") ? "application/pdf" : "image/jpeg");
      content.push(mt === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
        : { type: "image", source: { type: "base64", media_type: mt, data: b64 } });
    }

    const catalogText = catalog.length
      ? catalog.map((c) => `${c.ref} | ${c.code} | ${c.name} | cód. fornecedor: ${c.supplier_code ?? "-"} | unidade de compra: ${c.purchase_unit ?? c.unit ?? "-"}${c.purchase_unit_quantity ? ` (= ${c.purchase_unit_quantity} ${c.unit})` : ""}${c.ordered != null ? ` | ENCOMENDADO: ${c.ordered}` : ""}`).join("\n")
      : "(sem catálogo — devolve catalog_ref null em todas as linhas)";

    content.push({
      type: "text",
      text: `Esta é a fatura (ou guia) de um fornecedor de um restaurante em Portugal. Lê TODAS as linhas de produtos.
Para cada linha, indica em catalog_ref a referência do produto do catálogo abaixo que lhe corresponde (pela descrição, código do fornecedor ou semelhança), ou null se nenhum corresponder. Não inventes correspondências duvidosas: nesse caso usa confidence "baixa".
Converte a quantidade e o preço para a unidade de compra do catálogo quando for possível (ex.: fatura em KG e unidade de compra "Caixa (= 5 kg)": 10 KG -> 2 caixas; preço 3€/KG -> 15€/caixa). Preços sempre SEM IVA e já com descontos.
Ignora linhas de portes, ecovalor ou taras, mas menciona-as em warnings se tiverem valor.

Catálogo (ref | código | nome | ...):
${catalogText}`,
    });

    const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5";
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model, max_tokens: 4096,
        tools: [TOOL], tool_choice: { type: "tool", name: TOOL.name },
        messages: [{ role: "user", content }],
      }),
    });
    const out = await res.json();
    if (!res.ok) return json({ error: `Leitura falhou: ${out?.error?.message ?? res.status}` }, 502);
    const tool = (out.content ?? []).find((c: any) => c.type === "tool_use");
    if (!tool) return json({ error: "Não foi possível ler a fatura." }, 502);

    const r = tool.input;
    const byRef = new Map(catalog.map((c) => [c.ref, c]));
    const lines = (r.lines ?? []).map((l: any) => {
      const c = l.catalog_ref ? byRef.get(l.catalog_ref) : undefined;
      return { ...l, product_id: c?.product_id ?? null, order_line_id: c?.order_line_id ?? null, product_name: c?.name ?? null, product_code: c?.code ?? null };
    });
    return json({ ok: true, ...r, lines, usage: out.usage });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
