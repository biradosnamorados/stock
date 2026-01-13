import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface OrderEmailRequest {
  orderId: string;
  supplierEmail: string;
  supplierName: string;
  storeName: string;
  orderNumber: string;
  items: Array<{
    productName: string;
    quantity: number;
    unit: string;
    notes?: string;
  }>;
  notes?: string;
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  storeName: string
): Promise<void> {
  const smtpHost = Deno.env.get('SMTP_HOST') || 'obrien.servidorpt.pt';
  const smtpPort = parseInt(Deno.env.get('SMTP_PORT') || '465');

  let smtpUser: string;
  let smtpPass: string;

  if (storeName.toLowerCase().includes('braga')) {
    smtpUser = Deno.env.get('SMTP_USER_BRAGA') || 'restaurantebraga@biradosnamorados.pt';
    smtpPass = Deno.env.get('SMTP_PASS_BRAGA') || '#$restaurantebraga$#';
  } else {
    smtpUser = Deno.env.get('SMTP_USER_PORTO') || 'restauranteporto@biradosnamorados.pt';
    smtpPass = Deno.env.get('SMTP_PASS_PORTO') || '#$restauranteporto$#';
  }

  const client = new SMTPClient({
    connection: {
      hostname: smtpHost,
      port: smtpPort,
      tls: true,
      auth: {
        username: smtpUser,
        password: smtpPass,
      },
    },
  });

  try {
    await client.send({
      from: smtpUser,
      to: to,
      subject: subject,
      content: html,
      html: html,
    });
  } finally {
    await client.close();
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const requestData: OrderEmailRequest = await req.json();

    const emailHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
.header { background: linear-gradient(135deg, #038C5A 0%, #048ABF 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
.content { background: #f9f9f9; padding: 30px; border: 1px solid #ddd; }
.order-info { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; }
th { background: #038C5A; color: white; padding: 12px; text-align: left; }
td { padding: 12px; border-bottom: 1px solid #eee; }
tr:last-child td { border-bottom: none; }
.notes { background: #fff3cd; padding: 15px; border-radius: 8px; margin-top: 20px; border-left: 4px solid #ffc107; }
.footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
</style>
</head>
<body>
<div class="header">
<h1>Nova Encomenda</h1>
<p>Bira dos Namorados</p>
</div>
<div class="content">
<div class="order-info">
<h2>Encomenda ${requestData.orderNumber}</h2>
<p><strong>Loja:</strong> ${requestData.storeName}</p>
<p><strong>Data:</strong> ${new Date().toLocaleDateString('pt-PT', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
</div>
<h3>Produtos</h3>
<table>
<thead>
<tr>
<th>Produto</th>
<th>Quantidade</th>
<th>Unidade</th>
<th>Observações</th>
</tr>
</thead>
<tbody>
${requestData.items.map(item => `<tr><td><strong>${item.productName}</strong></td><td>${item.quantity}</td><td>${item.unit}</td><td>${item.notes || '-'}</td></tr>`).join('')}
</tbody>
</table>
${requestData.notes ? `<div class="notes"><h4>Observações</h4><p>${requestData.notes}</p></div>` : ''}
</div>
<div class="footer">
<p>Este email foi enviado automaticamente pelo sistema de gestão de stock.</p>
<p>Por favor, confirme a receção desta encomenda.</p>
</div>
</body>
</html>`;

    await sendEmail(
      requestData.supplierEmail,
      `Nova Encomenda ${requestData.orderNumber} - ${requestData.storeName}`,
      emailHtml,
      requestData.storeName
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Email enviado com sucesso',
        orderId: requestData.orderId
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error('Error sending email:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Erro ao enviar email'
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});