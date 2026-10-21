import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { user_id, new_password, admin_id } = await req.json();

    if (!user_id || !new_password) {
      return new Response(
        JSON.stringify({ success: false, error: 'ID do utilizador e nova palavra-passe são obrigatórios.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (new_password.length < 6) {
      return new Response(
        JSON.stringify({ success: false, error: 'A palavra-passe deve ter pelo menos 6 caracteres.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user_id,
      { password: new_password },
    );

    if (updateError) throw updateError;

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ password_reset_required: true, updated_at: new Date().toISOString() })
      .eq('id', user_id);

    if (profileError) throw profileError;

    await supabaseAdmin.from('audit_logs').insert({
      user_id: admin_id || null,
      action: 'admin_reset_password',
      entity: 'profiles',
      entity_id: user_id,
    });

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
