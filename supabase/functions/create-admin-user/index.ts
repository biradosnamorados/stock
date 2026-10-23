// Cria um utilizador (conta + perfil). Só Admin, ou Gerente para a sua unidade (até Responsável).
// Antes aceitava pedidos com a chave pública do site — qualquer pessoa podia criar um Admin.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const LEVELS = ['colaborador', 'responsavel', 'gerente', 'admin'];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });

    // quem está a pedir?
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false },
    });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ success: false, error: 'Sessão inválida.' }, 401);
    const { data: me } = await admin.from('profiles').select('id, role, access_level, unit_id, active').eq('id', caller.id).maybeSingle();
    if (!me?.active) return json({ success: false, error: 'Sem permissão.' }, 403);

    const body = await req.json();
    const { email, password, full_name, username, unit_id, department_id } = body;
    const level: string = LEVELS.includes(body.access_level) ? body.access_level : 'colaborador';

    if (me.role !== 'Admin') {
      const ok = me.access_level === 'gerente' && !!me.unit_id && unit_id === me.unit_id && ['colaborador', 'responsavel'].includes(level);
      if (!ok) return json({ success: false, error: 'Sem permissão para criar este utilizador.' }, 403);
    }
    if (!email || !password || String(password).length < 8) {
      return json({ success: false, error: 'Email e palavra-passe (mínimo 8 caracteres) são obrigatórios.' }, 400);
    }

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name },
    });
    if (authError) throw authError;

    const { error: profileError } = await admin.from('profiles').insert({
      id: authData.user.id,
      email,
      full_name,
      username: username || null,
      access_level: level, // o papel (Staff/Chefe/Admin) é derivado automaticamente
      unit_id: unit_id || null,
      department_id: department_id || null,
      active: true,
      password_reset_required: true,
      created_by: me.id,
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(authData.user.id);
      throw profileError;
    }

    await admin.from('audit_logs').insert({
      user_id: me.id,
      action: 'create_user',
      entity: 'profiles',
      entity_id: authData.user.id,
      changes: { email, access_level: level, unit_id, department_id },
    });

    return json({ success: true, user_id: authData.user.id, email });
  } catch (error: any) {
    return json({ success: false, error: error.message }, 400);
  }
});
