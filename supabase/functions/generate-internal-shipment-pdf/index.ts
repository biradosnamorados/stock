import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { order_id } = await req.json();

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: 'order_id é obrigatório' }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const orderResponse = await fetch(
      `${supabaseUrl}/rest/v1/internal_orders?id=eq.${order_id}&select=*,from_unit:units!from_unit_id(name,code),to_unit:units!to_unit_id(name,code),prepared_by_profile:profiles!prepared_by(full_name),internal_order_lines(id,quantity,shipped_quantity,unit,products(code,name)),internal_order_packages(packaged_units(display_code,weight,unit,production_batches(batch_code,production_date,expiry_date)))`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );

    if (!orderResponse.ok) {
      throw new Error('Erro ao carregar encomenda');
    }

    const orders = await orderResponse.json();
    if (!orders || orders.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Encomenda não encontrada' }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const order = orders[0];

    const summaryRows = order.internal_order_lines.map((line: any) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${line.products.code}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${line.products.name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">${line.quantity} ${line.unit}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600; ${
          line.shipped_quantity >= line.quantity ? 'color: #16a34a;' : 'color: #ea580c;'
        }">${line.shipped_quantity || 0} ${line.unit}</td>
      </tr>
    `).join('');

    const packagesByProduct = new Map();
    for (const pkg of order.internal_order_packages) {
      const pu = pkg.packaged_units;
      if (!pu) continue;

      const key = pu.production_batches?.batch_code || 'unknown';
      if (!packagesByProduct.has(key)) {
        packagesByProduct.set(key, []);
      }
      packagesByProduct.get(key).push(pu);
    }

    const detailRows = Array.from(packagesByProduct.entries()).map(([batchCode, packages]: [string, any[]]) => {
      return packages.map((pu: any, idx: number) => `
        <tr>
          ${idx === 0 ? `<td rowspan="${packages.length}" style="padding: 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; font-weight: 600;">${batchCode}</td>` : ''}
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">
            <span style="font-family: monospace; font-weight: 600;">${pu.display_code}</span>
          </td>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">${pu.weight} ${pu.unit}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-size: 11px;">
            ${pu.production_batches?.production_date ? new Date(pu.production_batches.production_date).toLocaleDateString('pt-PT') : '-'}
          </td>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-size: 11px;">
            ${pu.production_batches?.expiry_date ? new Date(pu.production_batches.expiry_date).toLocaleDateString('pt-PT') : '-'}
          </td>
        </tr>
      `).join('');
    }).join('');

    const pdfHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { margin: 20mm; }
    body {
      font-family: Arial, sans-serif;
      line-height: 1.4;
      color: #1e293b;
      font-size: 12px;
    }
    .header {
      border-bottom: 3px solid #2563eb;
      padding-bottom: 15px;
      margin-bottom: 20px;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      color: #2563eb;
    }
    .header .order-number {
      font-size: 14px;
      color: #64748b;
      margin-top: 5px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin: 20px 0;
    }
    .info-box {
      padding: 10px;
      background: #f8fafc;
      border-left: 3px solid #2563eb;
      border-radius: 4px;
    }
    .info-box h3 {
      margin: 0 0 5px 0;
      font-size: 11px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .info-box p {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
    }
    .section {
      margin: 25px 0;
    }
    .section h2 {
      font-size: 16px;
      color: #1e293b;
      margin: 0 0 10px 0;
      padding-bottom: 5px;
      border-bottom: 2px solid #e2e8f0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0;
      font-size: 11px;
    }
    th {
      background: #f1f5f9;
      padding: 10px 8px;
      text-align: left;
      font-weight: 600;
      border-bottom: 2px solid #cbd5e1;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    th.right { text-align: right; }
    th.center { text-align: center; }
    td { font-size: 11px; }
    .footer {
      margin-top: 40px;
      padding-top: 15px;
      border-top: 2px solid #e2e8f0;
    }
    .signature-box {
      margin-top: 30px;
      padding: 15px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
    }
    .signature-box h4 {
      margin: 0 0 20px 0;
      font-size: 12px;
      color: #64748b;
    }
    .signature-line {
      margin-top: 40px;
      border-top: 1px solid #1e293b;
      padding-top: 5px;
      text-align: center;
      font-size: 10px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Guia de Remessa Interna</h1>
    <div class="order-number">Encomenda Nº ${order.order_number}</div>
  </div>

  <div class="info-grid">
    <div class="info-box">
      <h3>Origem</h3>
      <p>${order.from_unit.name}</p>
    </div>
    <div class="info-box">
      <h3>Destino</h3>
      <p>${order.to_unit.name}</p>
    </div>
    <div class="info-box">
      <h3>Data de Expedição</h3>
      <p>${order.shipped_at ? new Date(order.shipped_at).toLocaleDateString('pt-PT') : new Date().toLocaleDateString('pt-PT')}</p>
    </div>
    <div class="info-box">
      <h3>Preparado por</h3>
      <p>${order.prepared_by_profile?.full_name || '-'}</p>
    </div>
  </div>

  <div class="section">
    <h2>Resumo da Encomenda</h2>
    <table>
      <thead>
        <tr>
          <th>Código</th>
          <th>Produto</th>
          <th class="right">Quantidade Pedida</th>
          <th class="right">Quantidade Enviada</th>
        </tr>
      </thead>
      <tbody>
        ${summaryRows}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>Detalhes das Embalagens</h2>
    <table>
      <thead>
        <tr>
          <th>Lote</th>
          <th>Código Embalagem</th>
          <th class="right">Peso</th>
          <th class="center">Data Produção</th>
          <th class="center">Data Validade</th>
        </tr>
      </thead>
      <tbody>
        ${detailRows}
      </tbody>
    </table>
  </div>

  ${order.notes ? `
  <div class="section">
    <h2>Observações</h2>
    <div style="padding: 10px; background: #fef3c7; border-left: 3px solid #f59e0b;">
      ${order.notes}
    </div>
  </div>
  ` : ''}

  <div class="footer">
    <div class="signature-box">
      <h4>Confirmação de Receção</h4>
      <div class="signature-line">Nome e Assinatura do Responsável</div>
    </div>
  </div>
</body>
</html>
    `;

    return new Response(
      JSON.stringify({
        success: true,
        html: pdfHTML,
        order_number: order.order_number
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error('Erro:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
