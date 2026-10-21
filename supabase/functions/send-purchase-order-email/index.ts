import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface EmailData {
  to: string;
  subject: string;
  html: string;
  order_id: string;
  order_number: string;
}

interface SMTPSettings {
  smtp_provider: string;
  api_key: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_username: string | null;
  smtp_password: string | null;
  from_email: string;
  from_name: string;
  enabled: boolean;
}

async function getUnitSMTPSettings(unitId: string, supabaseUrl: string, supabaseKey: string): Promise<SMTPSettings | null> {
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/unit_smtp_settings?unit_id=eq.${unitId}&enabled=eq.true&select=*`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const settings = await response.json();
    if (!settings || settings.length === 0) {
      return null;
    }

    return settings[0];
  } catch (error) {
    console.error('Error fetching SMTP settings:', error);
    return null;
  }
}

async function sendEmailViaSMTP(
  to: string,
  subject: string,
  html: string,
  smtpSettings: SMTPSettings
): Promise<{ success: boolean; error?: string }> {
  try {
    const SMTPClient = await import('npm:emailjs@4.0.3');

    const client = new SMTPClient.SMTPClient({
      host: smtpSettings.smtp_host!,
      port: smtpSettings.smtp_port || 587,
      user: smtpSettings.smtp_username!,
      password: smtpSettings.smtp_password!,
      ssl: smtpSettings.smtp_port === 465,
      tls: smtpSettings.smtp_port === 587,
    });

    await client.sendAsync({
      from: `${smtpSettings.from_name} <${smtpSettings.from_email}>`,
      to: to,
      subject: subject,
      attachment: [{ data: html, alternative: true }],
    });

    return { success: true };
  } catch (error) {
    console.error('SMTP Error:', error);
    return { success: false, error: error.message || 'Erro ao enviar email via SMTP' };
  }
}

async function sendEmail(data: EmailData, smtpSettings?: SMTPSettings | null): Promise<{ success: boolean; error?: string }> {
  const provider = smtpSettings?.smtp_provider || 'resend';
  const apiKey = smtpSettings?.api_key || Deno.env.get('RESEND_API_KEY');
  const fromEmail = smtpSettings?.from_email || 'Encomendas <orders@yourdomain.com>';
  const fromName = smtpSettings?.from_name || 'Encomendas';

  if (provider === 'smtp') {
    if (!smtpSettings?.smtp_host || !smtpSettings?.smtp_username || !smtpSettings?.smtp_password) {
      return { success: false, error: 'Configuração SMTP incompleta' };
    }
    return await sendEmailViaSMTP(data.to, data.subject, data.html, smtpSettings);
  }

  if (!apiKey && provider === 'resend') {
    return { success: false, error: 'API Key não configurada para esta unidade' };
  }

  try {
    let response;

    if (provider === 'resend') {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: [data.to],
          subject: data.subject,
          html: data.html,
        }),
      });
    } else if (provider === 'sendgrid') {
      response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{
            to: [{ email: data.to }],
          }],
          from: { email: fromEmail, name: fromName },
          subject: data.subject,
          content: [{
            type: 'text/html',
            value: data.html,
          }],
        }),
      });
    } else {
      return { success: false, error: `Provider ${provider} não suportado ainda` };
    }

    if (!response.ok) {
      const result = await response.json();
      return { success: false, error: result.message || result.errors?.[0]?.message || 'Erro ao enviar email' };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
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
      `${supabaseUrl}/rest/v1/purchase_orders?id=eq.${order_id}&select=*,suppliers(name,email),units(name),purchase_order_lines(quantity,unit,unit_price,products(code,name)),profiles!created_by(email,full_name)`,
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

    if (!order.suppliers?.email) {
      return new Response(
        JSON.stringify({ error: 'Fornecedor sem email configurado' }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const smtpSettings = await getUnitSMTPSettings(order.unit_id, supabaseUrl, supabaseKey);

    const hasPrice = order.purchase_order_lines.some((line: any) => line.unit_price !== null);
    const total = order.purchase_order_lines.reduce((sum: number, line: any) => {
      if (line.unit_price) {
        return sum + (line.quantity * line.unit_price);
      }
      return sum;
    }, 0);

    const linesHTML = order.purchase_order_lines.map((line: any) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${line.products.code}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${line.products.name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">${line.quantity} ${line.unit}</td>
        ${hasPrice ? `<td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">${line.unit_price ? `€${line.unit_price.toFixed(2)}` : '-'}</td>` : ''}
        ${hasPrice && line.unit_price ? `<td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600;">€${(line.quantity * line.unit_price).toFixed(2)}</td>` : hasPrice ? `<td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">-</td>` : ''}
      </tr>
    `).join('');

    const emailHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; }
    .container { max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: white; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
    .info-box { padding: 15px; background: #f8fafc; border-radius: 8px; }
    .info-box h3 { margin: 0 0 8px 0; font-size: 12px; color: #64748b; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: #f1f5f9; padding: 12px 8px; text-align: left; font-weight: 600; border-bottom: 2px solid #cbd5e1; }
    th.right { text-align: right; }
    .total-row { background: #f1f5f9; font-weight: 600; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">Nova Encomenda</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Encomenda Nº ${order.order_number}</p>
    </div>
    <div class="content">
      <p>Caro(a) <strong>${order.suppliers.name}</strong>,</p>
      <p>Segue em anexo a nossa encomenda com os seguintes detalhes:</p>

      <div class="info-grid">
        <div class="info-box">
          <h3>Data da Encomenda</h3>
          <p><strong>${new Date(order.order_date).toLocaleDateString('pt-PT')}</strong></p>
        </div>
        ${order.expected_delivery_date ? `
        <div class="info-box">
          <h3>Entrega Prevista</h3>
          <p><strong>${new Date(order.expected_delivery_date).toLocaleDateString('pt-PT')}</strong></p>
        </div>
        ` : ''}
      </div>

      <table>
        <thead>
          <tr>
            <th>Código</th>
            <th>Produto</th>
            <th style="text-align: right;">Quantidade</th>
            ${hasPrice ? '<th style="text-align: right;">Preço Unit.</th>' : ''}
            ${hasPrice ? '<th style="text-align: right;">Total</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${linesHTML}
          ${hasPrice && total > 0 ? `
          <tr class="total-row">
            <td colspan="${hasPrice ? '4' : '3'}" style="padding: 12px 8px; text-align: right;">TOTAL:</td>
            <td style="padding: 12px 8px; text-align: right; font-size: 18px;">€${total.toFixed(2)}</td>
          </tr>
          ` : ''}
        </tbody>
      </table>

      ${order.notes ? `
      <div style="padding: 15px; background: #fef3c7; border-left: 4px solid #f59e0b; margin: 20px 0;">
        <h3 style="margin: 0 0 8px 0; color: #92400e;">Observações</h3>
        <p style="margin: 0;">${order.notes}</p>
      </div>
      ` : ''}

      <p>Por favor, confirme a receção e disponibilidade dos produtos.</p>
      <p>Obrigado,<br><strong>${order.units.name}</strong></p>

      <div class="footer">
        <p>Esta é uma mensagem automática. Por favor não responda diretamente a este email.</p>
      </div>
    </div>
  </div>
</body>
</html>
    `;

    const emailToSupplier = await sendEmail({
      to: order.suppliers.email,
      subject: `Nova Encomenda ${order.order_number}`,
      html: emailHTML,
      order_id: order_id,
      order_number: order.order_number,
    }, smtpSettings);

    let emailToUser = { success: true, error: undefined };
    if (order.profiles?.email) {
      const confirmationHTML = emailHTML.replace(
        `<p>Caro(a) <strong>${order.suppliers.name}</strong>,</p>`,
        `<p>Caro(a) <strong>${order.profiles.full_name || order.profiles.email}</strong>,</p>`
      ).replace(
        `<p>Segue em anexo a nossa encomenda com os seguintes detalhes:</p>`,
        `<p>Esta é uma confirmação da encomenda que enviou ao fornecedor <strong>${order.suppliers.name}</strong>:</p>`
      ).replace(
        `<p>Por favor, confirme a receção e disponibilidade dos produtos.</p>`,
        `<p>O fornecedor receberá esta mesma encomenda por email.</p>`
      );

      emailToUser = await sendEmail({
        to: order.profiles.email,
        subject: `Confirmação: Encomenda ${order.order_number} enviada`,
        html: confirmationHTML,
        order_id: order_id,
        order_number: order.order_number,
      }, smtpSettings);
    }

    const updateData: any = {
      last_sent_at: new Date().toISOString(),
      resend_count: (order.resend_count || 0) + 1,
    };

    if (emailToSupplier.success) {
      updateData.email_sent_at = new Date().toISOString();
      updateData.email_status = 'sent';
      updateData.email_recipient = order.suppliers.email;
      updateData.email_error = null;
      updateData.status = 'sent';
    } else {
      updateData.email_status = 'failed';
      updateData.email_error = emailToSupplier.error;
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
        body: JSON.stringify(updateData),
      }
    );

    if (emailToSupplier.success) {
      const message = emailToUser.success
        ? 'Emails enviados com sucesso ao fornecedor e ao utilizador'
        : `Email enviado ao fornecedor. Aviso: ${emailToUser.error}`;

      return new Response(
        JSON.stringify({ success: true, message }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } else {
      return new Response(
        JSON.stringify({ success: false, error: emailToSupplier.error }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
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
