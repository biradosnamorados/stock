// Áreas a que uma pessoa tem acesso, com exceções individuais (dar / tirar / repor).
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { AREA_GROUPS, ADMIN_ONLY } from '../lib/access';
import { Check, X, RotateCcw } from 'lucide-react';

export default function UserAreas({ userId, canEdit, isAdmin }: { userId: string; canEdit: boolean; isAdmin: boolean }) {
  const [effective, setEffective] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const load = async () => {
    const [{ data: mods, error: e1 }, { data: ov }] = await Promise.all([
      supabase.rpc('modules_for_user', { p_user: userId }),
      supabase.from('user_access_overrides').select('module_code, granted').eq('user_id', userId),
    ]);
    if (e1) { setErr(e1.message); return; }
    setEffective(new Set((mods as string[]) ?? []));
    const o: Record<string, boolean> = {};
    (ov ?? []).forEach((r: any) => { if (r.granted !== null) o[r.module_code] = r.granted; });
    setOverrides(o);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userId]);

  const set = async (code: string, granted: boolean | null) => {
    setBusy(code); setErr('');
    const { error } = await supabase.rpc('set_user_override', { p_user: userId, p_module: code, p_granted: granted });
    setBusy(null);
    if (error) { setErr(error.message); return; }
    load();
  };

  return (
    <div className="border border-slate-200 rounded-xl p-4">
      <p className="text-sm font-semibold text-slate-800">Áreas a que tem acesso</p>
      <p className="text-xs text-slate-500 mb-3">
        Vêm da equipa e do nível (grelha de níveis). Só use exceções para casos pontuais — ficam assinaladas.
        Ao mudar a equipa ou o nível, guarde primeiro para atualizar esta lista.
      </p>
      {err && <p className="text-sm text-red-600 mb-2">{err}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
        {AREA_GROUPS.map((g) => (
          <div key={g.name}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">{g.name}</p>
            <ul className="space-y-1">
              {g.areas.map((a) => {
                const on = effective.has(a.code);
                const ov = overrides[a.code];
                const locked = !canEdit || (!isAdmin && ADMIN_ONLY.has(a.code));
                return (
                  <li key={a.code} className="flex items-center gap-2 text-sm">
                    <button
                      type="button"
                      disabled={locked || busy === a.code}
                      onClick={() => set(a.code, !on)}
                      className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-300'} disabled:opacity-60`}
                      title={on ? 'Tirar o acesso (exceção)' : 'Dar acesso (exceção)'}
                    >
                      {on && <Check className="w-3.5 h-3.5" />}
                    </button>
                    <span className={on ? 'text-slate-800' : 'text-slate-400'}>{a.label}</span>
                    {ov !== undefined && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${ov ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}`}>
                        {ov ? 'exceção: dado' : 'exceção: tirado'}
                      </span>
                    )}
                    {ov !== undefined && !locked && (
                      <button type="button" onClick={() => set(a.code, null)} className="text-slate-400 hover:text-slate-700" title="Repor como na grelha">
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {!canEdit && <p className="text-xs text-slate-500 mt-3 flex items-center gap-1"><X className="w-3 h-3" /> Não pode alterar as suas próprias exceções.</p>}
    </div>
  );
}
