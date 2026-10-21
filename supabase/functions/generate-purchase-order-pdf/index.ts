import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface OrderLine {
  product_code: string;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number | null;
  purchase_unit: string | null;
  purchase_unit_quantity: number | null;
}

interface PurchaseOrder {
  order_number: string;
  order_date: string;
  expected_delivery_date: string | null;
  supplier_name: string;
  supplier_email: string | null;
  unit_name: string;
  lines: OrderLine[];
  notes: string | null;
}

function generatePDF(order: PurchaseOrder): string {
  const total = order.lines.reduce((sum, line) => {
    if (line.unit_price) {
      return sum + (line.quantity * line.unit_price);
    }
    return sum;
  }, 0);

  const hasPrice = order.lines.some(line => line.unit_price !== null);

  const pad2 = (n: number) => String(n).padStart(2, '0');

  const linesHTML = order.lines.map(line => {
    const qtyCell = `${pad2(line.quantity)} un`;
    const purchaseUnitCell = line.purchase_unit || '-';
    const purchaseQtyCell = line.purchase_unit_quantity
      ? `${line.purchase_unit_quantity}${line.unit}`
      : '-';

    return `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${line.product_code}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${line.product_name}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center;">${qtyCell}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${purchaseUnitCell}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">${purchaseQtyCell}</td>
      ${hasPrice ? `<td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">${line.unit_price ? `€${line.unit_price.toFixed(2)}` : '-'}</td>` : ''}
      ${hasPrice && line.unit_price ? `<td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600;">€${(line.quantity * line.unit_price).toFixed(2)}</td>` : hasPrice ? `<td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">-</td>` : ''}
    </tr>
  `;
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Encomenda ${order.order_number}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #1e293b; }
    .header { margin-bottom: 30px; border-bottom: 3px solid #2563eb; padding-bottom: 20px; }
    .header h1 { margin: 0; color: #2563eb; font-size: 28px; }
    .header p { margin: 5px 0; color: #64748b; }
    .info-section { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .info-box { flex: 1; padding: 15px; background: #f8fafc; border-radius: 8px; margin-right: 15px; }
    .info-box:last-child { margin-right: 0; }
    .info-box h3 { margin: 0 0 10px 0; font-size: 14px; color: #64748b; text-transform: uppercase; }
    .info-box p { margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: #f1f5f9; padding: 12px 8px; text-align: left; font-weight: 600; border-bottom: 2px solid #cbd5e1; }
    th.right, td.right { text-align: right; }
    .total-row { background: #f1f5f9; font-weight: 600; }
    .notes { margin-top: 30px; padding: 15px; background: #fef3c7; border-left: 4px solid #f59e0b; }
    .notes h3 { margin: 0 0 10px 0; color: #92400e; }
    .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>ENCOMENDA A FORNECEDOR</h1>
    <p>Encomenda Nº ${order.order_number}</p>
  </div>

  <div class="info-section">
    <div class="info-box">
      <h3>Fornecedor</h3>
      <p><strong>${order.supplier_name}</strong></p>
      ${order.supplier_email ? `<p>${order.supplier_email}</p>` : ''}
    </div>
    <div class="info-box">
      <h3>Unidade</h3>
      <p><strong>${order.unit_name}</strong></p>
    </div>
    <div class="info-box">
      <h3>Datas</h3>
      <p><strong>Encomenda:</strong> ${new Date(order.order_date).toLocaleDateString('pt-PT')}</p>
      ${order.expected_delivery_date ? `<p><strong>Entrega:</strong> ${new Date(order.expected_delivery_date).toLocaleDateString('pt-PT')}</p>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Código</th>
        <th>Produto</th>
        <th style="text-align: center;">Qtd.</th>
        <th>Un. Compra</th>
        <th class="right">Qtd. Unidade</th>
        ${hasPrice ? '<th class="right">Preço Unit.</th>' : ''}
        ${hasPrice ? '<th class="right">Total</th>' : ''}
      </tr>
    </thead>
    <tbody>
      ${linesHTML}
      ${hasPrice && total > 0 ? `
      <tr class="total-row">
        <td colspan="6" style="padding: 12px 8px; text-align: right;">TOTAL:</td>
        <td style="padding: 12px 8px; text-align: right; font-size: 18px;">€${total.toFixed(2)}</td>
      </tr>
      ` : ''}
    </tbody>
  </table>

  ${order.notes ? `
  <div class="notes">
    <h3>Observações</h3>
    <p>${order.notes}</p>
  </div>
  ` : ''}

  <div class="footer">
    <p>Este documento foi gerado automaticamente em ${new Date().toLocaleString('pt-PT')}</p>
  </div>
</body>
</html>
  `;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    console.log('=== Iniciando geração de PDF ===');
    console.log('Request method:', req.method);
    console.log('Request headers:', Object.fromEntries(req.headers.entries()));

    let body;
    try {
      body = await req.json();
      console.log('Request body:', body);
    } catch (jsonError) {
      console.error('Erro ao fazer parse do JSON:', jsonError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'JSON inválido no corpo da requisição'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { order_id } = body;

    if (!order_id) {
      console.error('order_id não fornecido');
      return new Response(
        JSON.stringify({ error: 'order_id é obrigatório' }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.error('Variáveis de ambiente não configuradas');
      return new Response(
        JSON.stringify({ error: 'Configuração do servidor incompleta' }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log('Carregando encomenda:', order_id);

    const orderResponse = await fetch(
      `${supabaseUrl}/rest/v1/purchase_orders?id=eq.${order_id}&select=*,suppliers(name,email),units(name),purchase_order_lines(quantity,unit,unit_price,purchase_unit,purchase_unit_quantity,products(code,name))`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );

    if (!orderResponse.ok) {
      const errorText = await orderResponse.text();
      console.error('Erro ao carregar encomenda:', orderResponse.status, errorText);
      throw new Error(`Erro ao carregar encomenda: ${orderResponse.status}`);
    }

    const orders = await orderResponse.json();
    console.log('Encomenda carregada:', orders);

    if (!orders || orders.length === 0) {
      console.error('Encomenda não encontrada:', order_id);
      return new Response(
        JSON.stringify({ error: 'Encomenda não encontrada' }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const order = orders[0];

    console.log('Order data structure:', {
      hasSuppliers: !!order.suppliers,
      hasUnits: !!order.units,
      hasLines: !!order.purchase_order_lines,
      linesCount: order.purchase_order_lines?.length
    });

    if (!order.suppliers) {
      throw new Error('Dados do fornecedor não encontrados');
    }

    if (!order.units) {
      throw new Error('Dados da unidade não encontrados');
    }

    if (!order.purchase_order_lines || order.purchase_order_lines.length === 0) {
      throw new Error('Encomenda sem linhas de produtos');
    }

    const orderData: PurchaseOrder = {
      order_number: order.order_number,
      order_date: order.order_date,
      expected_delivery_date: order.expected_delivery_date,
      supplier_name: order.suppliers.name,
      supplier_email: order.suppliers.email,
      unit_name: order.units.name,
      notes: order.notes,
      lines: order.purchase_order_lines.map((line: any) => {
        if (!line.products) {
          console.error('Line missing products:', line);
          throw new Error('Linha de encomenda sem dados do produto');
        }
        return {
          product_code: line.products.code,
          product_name: line.products.name,
          quantity: line.quantity,
          unit: line.unit,
          unit_price: line.unit_price,
          purchase_unit: line.purchase_unit ?? null,
          purchase_unit_quantity: line.purchase_unit_quantity ?? null,
        };
      }),
    };

    console.log('Order data prepared successfully');

    const html = generatePDF(orderData);

    const pdfPath = `purchase-orders/${order_id}.html`;

    let uploadResponse = await fetch(
      `${supabaseUrl}/storage/v1/object/documents/${pdfPath}`,
      {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'text/html',
        },
        body: html,
      }
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.log('POST failed, trying PUT:', errorText);

      uploadResponse = await fetch(
        `${supabaseUrl}/storage/v1/object/documents/${pdfPath}`,
        {
          method: 'PUT',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'text/html',
          },
          body: html,
        }
      );

      if (!uploadResponse.ok) {
        const putError = await uploadResponse.text();
        console.error('PUT also failed:', putError);
        throw new Error(`Falha ao guardar documento: ${putError}`);
      }
    }

    await fetch(
      `${supabaseUrl}/rest/v1/purchase_orders?id=eq.${order_id}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          pdf_path: pdfPath,
          pdf_generated_at: new Date().toISOString(),
        }),
      }
    );

    return new Response(
      JSON.stringify({
        success: true,
        pdf_path: pdfPath,
        html: html,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Erro desconhecido ao gerar PDF'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
