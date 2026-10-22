import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Banknote, Save, PlugZap, CheckCircle2, AlertCircle, Info } from 'lucide-react';

interface Unit { id: string; name: string; type: string }

interface Settings {
  host: string;
  port: string;
  username: string;
  password: string; // só para enviar; nunca é lida da base de dados
  enabled: boolean;
  hasPassword: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  exists: boolean;
}

const empty: Settings = {
  host: '', port: '58301', username: '', password: '', enabled: true, hasPassword: false,
  last_sync_at: null, last_sync_status: null, last_sync_error: null, exists: false,
};

export default function CashmaticSettings() {
  const { profile } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitId, setUnitId] = useState('');
  const [s, setS] = useState<Settings>(empty);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    supabase.from('units').select('id, name, type').eq('active', true).order('name').then(({ data }) => {
      const list = ((data || []) as Unit[]).filter((u) => u.type === 'restaurant' || u.type === 'events');
      setUnits(list);
      if (list.length) setUnitId(list[0].id);
    });
  }, []);

  useEffect(() => { if (unitId) load(); }, [unitId]);

  async function load() {
    setLoading(true);
    setMsg(null);
    const { data } = await supabase
      .from('unit_cashmatic_settings')
      .select('host, port, username, enabled, password_secret_id, last_sync_at, last_sync_status, last_sync_error')
      .eq('unit_id', unitId)
      .maybeSingle();
    setS(data ? {
      host: data.host ?? '', port: String(data.port ?? 58301), username: data.username ?? '', password: '',
      enabled: !!data.enabled, hasPassword: !!data.password_secret_id,
      last_sync_at: data.last_sync_at, last_sync_status: data.last_sync_status, last_sync_error: data.last_sync_error, exists: true,
    } : empty);
    setLoading(false);
  }

  async function save() {
    if (!s.host.trim() || !s.username.trim() || !s.port) {
      setMsg({ ok: false, text: 'Preencha o IP público, a porta e o utilizador.' });
      return false;
    }
    if (!s.hasPassword && !s.password) {
      setMsg({ ok: false, text: 'Indique a palavra-passe do utilizador da máquina.' });
      return false;
    }
    setBusy('save');
    const { error } = await supabase.rpc('set_cashmatic_settings', {
      p_unit_id: unitId,
      p_host: s.host.trim(),
      p_port: Number(s.port),
      p_use_https: true,
      p_username: s.username.trim(),
      p_password: s.password || null,
      p_enabled: s.enabled,
    });
    setBusy(null);
    if (error) { setMsg({ ok: false, text: error.message }); return false; }
    setMsg({ ok: true, text: 'Configuração guardada.' });
    await load();
    return true;
  }

  async function test() {
    if (s.password || !s.exists) {
      const ok = await save();
      if (!ok) return;
    }
    setBusy('test');
    setMsg(null);
    const { data, error } = await supabase.functions.invoke('cashmatic-sync', { body: { unit_id: unitId, test: true } });
    let detail = data?.error as string | undefined;
    if (error) {
      detail = error.message;
      try { const body = await (error as any).context?.json?.(); if (body?.error) detail = body.error; } catch { /* */ }
    }
    setBusy(null);
    setMsg(data?.ok ? { ok: true, text: 'Ligação à máquina de trocos OK.' } : { ok: false, text: `Falhou: ${detail ?? 'sem resposta'}` });
    load();
  }

  if (profile?.role !== 'Admin') {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">Apenas administradores podem aceder a esta página.</div>
      </div>
    );
  }

  const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Banknote className="w-7 h-7" /> Máquina de trocos (Cashmatic)</h1>
        <p className="text-slate-600 mt-1 text-sm">Ligação usada pelo botão "Ver recebimentos da máquina de trocos" no fecho de caixa.</p>
      </div>

      {msg && (
        <div className={`p-3 rounded-lg flex items-start gap-2 text-sm border ${msg.ok ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
          {msg.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <AlertCircle className="w-4 h-4 mt-0.5" />}
          <span>{msg.text}</span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Unidade</label>
          <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className={inputCls}>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="py-6 text-center"><div className="inline-block w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">IP público do restaurante</label>
                <input value={s.host} onChange={(e) => setS({ ...s, host: e.target.value })} className={inputCls} placeholder="94.132.192.230" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Porta externa</label>
                <input value={s.port} inputMode="numeric" onChange={(e) => setS({ ...s, port: e.target.value.replace(/\D/g, '') })} className={inputCls} />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Utilizador (só relatórios)</label>
                <input value={s.username} onChange={(e) => setS({ ...s, username: e.target.value })} className={inputCls} placeholder="bira-app" autoComplete="off" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Palavra-passe</label>
                <input type="password" value={s.password} onChange={(e) => setS({ ...s, password: e.target.value })} className={inputCls} autoComplete="new-password"
                  placeholder={s.hasPassword ? '•••••••• (guardada — deixe vazio para manter)' : 'Palavra-passe do utilizador'} />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} className="rounded border-slate-300" />
              Integração ativa
            </label>

            {s.last_sync_at && (
              <div className={`text-sm rounded-lg p-3 ${s.last_sync_status === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                Última ligação: {new Date(s.last_sync_at).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' })} —{' '}
                {s.last_sync_status === 'ok' ? 'OK' : `erro: ${s.last_sync_error ?? 'desconhecido'}`}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button onClick={save} disabled={busy !== null} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                <Save className="w-4 h-4" /> {busy === 'save' ? 'A guardar…' : 'Guardar'}
              </button>
              <button onClick={test} disabled={busy !== null} className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
                <PlugZap className="w-4 h-4" /> {busy === 'test' ? 'A testar…' : 'Testar ligação'}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-600 space-y-2">
        <p className="font-medium text-slate-800 flex items-center gap-2"><Info className="w-4 h-4" /> Como funciona</p>
        <p>• O router do restaurante reencaminha a porta externa para a máquina (10.0.0.10:50301). A ligação é feita por HTTPS e só aceita o certificado da própria máquina.</p>
        <p>• Use um utilizador da máquina só com permissão de relatórios — nunca o admin.</p>
        <p>• A palavra-passe fica guardada encriptada e não volta a ser mostrada.</p>
        <p>• Se o IP público do restaurante mudar, atualize-o aqui.</p>
      </div>
    </div>
  );
}
