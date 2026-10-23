// Envia a notificação push (iPhone, via APNs) de um aviso acabado de criar.
// Chamado pela app/site logo a seguir a send_notice. Só o autor do aviso (ou Admin) pode disparar.
// Segredos: APNS_KEY_P8 (conteúdo do ficheiro AuthKey_322RSA768N.p8). Opcionais: APNS_KEY_ID, APNS_TEAM_ID, APNS_TOPIC.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const KEY_ID = Deno.env.get('APNS_KEY_ID') ?? '322RSA768N';
const TEAM_ID = Deno.env.get('APNS_TEAM_ID') ?? 'P7WHDV55U2';
const TOPIC = Deno.env.get('APNS_TOPIC') ?? 'pt.biradosnamorados.gestao';

const b64url = (b: Uint8Array | string) => {
  const s = typeof b === 'string' ? btoa(unescape(encodeURIComponent(b))) : btoa(String.fromCharCode(...b));
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

let cached: { jwt: string; at: number } | null = null;
async function apnsJwt(): Promise<string> {
  if (cached && Date.now() - cached.at < 40 * 60_000) return cached.jwt;
  const pem = Deno.env.get('APNS_KEY_P8');
  if (!pem) throw new Error('Falta o segredo APNS_KEY_P8 no Supabase.');
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: KEY_ID }));
  const body = b64url(JSON.stringify({ iss: TEAM_ID, iat: Math.floor(Date.now() / 1000) }));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${head}.${body}`)));
  cached = { jwt: `${head}.${body}.${b64url(sig)}`, at: Date.now() };
  return cached.jwt;
}

async function sendOne(token: string, env: string, payload: unknown): Promise<{ status: number; reason?: string }> {
  const host = env === 'sandbox' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
  const r = await fetch(`https://${host}/3/device/${token}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${await apnsJwt()}`, 'apns-topic': TOPIC, 'apns-push-type': 'alert', 'apns-priority': '10',
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  let reason: string | undefined;
  if (r.status !== 200) { try { reason = (await r.json()).reason; } catch { /* */ } } else { await r.body?.cancel(); }
  return { status: r.status, reason };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) return json({ error: 'Sem sessão' }, 401);

    const { notice_id } = await req.json().catch(() => ({}));
    if (!notice_id) return json({ error: 'Falta notice_id' }, 400);

    const { data: n } = await admin.from('dashboard_notices').select('id, title, message, urgent, created_by, pushed_at').eq('id', notice_id).maybeSingle();
    if (!n) return json({ error: 'Aviso não encontrado' }, 404);
    const { data: me } = await admin.from('profiles').select('role').eq('id', u.user.id).maybeSingle();
    if (n.created_by !== u.user.id && me?.role !== 'Admin') return json({ error: 'Sem permissão' }, 403);
    if (n.pushed_at) return json({ ok: true, sent: 0, already: true });
    await admin.from('dashboard_notices').update({ pushed_at: new Date().toISOString() }).eq('id', n.id);

    const { data: rec } = await admin.from('notice_recipients').select('user_id').eq('notice_id', n.id);
    const users = (rec ?? []).map((r) => r.user_id);
    if (!users.length) return json({ ok: true, sent: 0 });
    const { data: devices } = await admin.from('device_tokens').select('token, environment').in('user_id', users).eq('active', true);

    const body = String(n.message ?? '');
    const payload = {
      aps: {
        alert: { title: (n.urgent ? '⚠️ ' : '') + n.title, body: body.length > 180 ? body.slice(0, 177) + '…' : body },
        sound: 'default', 'thread-id': 'avisos', ...(n.urgent ? { 'interruption-level': 'time-sensitive' } : {}),
      },
      rota: `/?aviso=${n.id}`,
    };

    let sent = 0, failed = 0;
    const errors: string[] = [];
    await Promise.all((devices ?? []).map(async (d) => {
      try {
        let res = await sendOne(d.token, d.environment, payload);
        if (res.status === 400 && res.reason === 'BadDeviceToken') {
          // token do outro ambiente (ex.: app instalada pelo Xcode) — tenta lá e guarda
          const other = d.environment === 'sandbox' ? 'production' : 'sandbox';
          res = await sendOne(d.token, other, payload);
          if (res.status === 200) await admin.from('device_tokens').update({ environment: other }).eq('token', d.token);
        }
        if (res.status === 200) sent++;
        else {
          failed++; errors.push(`${res.status} ${res.reason ?? ''}`.trim());
          if (res.status === 410 || res.reason === 'BadDeviceToken' || res.reason === 'Unregistered') {
            await admin.from('device_tokens').update({ active: false }).eq('token', d.token);
          }
        }
      } catch (e) { failed++; errors.push(String((e as Error).message ?? e)); }
    }));
    return json({ ok: true, devices: devices?.length ?? 0, sent, failed, errors: [...new Set(errors)].slice(0, 5) });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
