// Define uma palavra-passe temporária para outro utilizador.
// Só Admin, ou Gerente para colaboradores/responsáveis da sua unidade.
// Antes aceitava pedidos com a chave pública do site — qualquer pessoa podia trocar a palavra-passe de qualquer conta.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });

    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false },
    });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ success: false, error: 'Sessão inválida.' }, 401);
    const { data: me } = await admin.from('profiles').select('id, role, access_level, unit_id, active').eq('id', caller.id).maybeSingle();
    if (!me?.active) return json({ success: false, error: 'Sem permissão.' }, 403);

    const { user_id, new_password } = await req.json();
    if (!user_id || !new_password) return json({ success: false, error: 'ID do utilizador e nova palavra-passe são obrigatórios.' }, 400);
    if (String(new_password).length < 8) return json({ success: false, error: 'A palavra-passe deve ter pelo menos 8 caracteres.' }, 400);

    const { data: target } = await admin.from('profiles').select('id, role, access_level, unit_id').eq('id', user_id).maybeSingle();
    if (!target) return json({ success: false, error: 'Utilizador não encontrado.' }, 404);

    if (me.role !== 'Admin') {
      const ok = me.access_level === 'gerente' && !!me.unit_id && target.unit_id === me.unit_id
        && target.role !== 'Admin' && target.access_level !== 'gerente' && target.id !== me.id;
      if (!ok) return json({ success: false, error: 'Sem permissão para alterar a palavra-passe deste utilizador.' }, 403);
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(user_id, { password: new_password });
    if (updateError) throw updateError;

    const { error: profileError } = await admin.from('profiles')
      .update({ password_reset_required: true, updated_at: new Date().toISOString() }).eq('id', user_id);
    if (profileError) throw profileError;

    await admin.from('audit_logs').insert({ user_id: me.id, action: 'admin_reset_password', entity: 'profiles', entity_id: user_id });

    return json({ success: true });
  } catch (error: any) {
    return json({ success: false, error: error.message }, 400);
  }
});
