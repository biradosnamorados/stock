// Níveis de acesso: grelha Equipa × Nível → áreas da app.
// Substitui os antigos "Perfis de Acesso" (módulo × 6 ações), que na prática só controlavam o menu.
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Check, Users as UsersIcon, Info } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { AREA_GROUPS, ADMIN_ONLY } from '../../lib/access';

interface Rule { id: string; department_id: string | null; level: string; module_code: string }
interface Dept { id: string; name: string }
interface Person { full_name: string | null; department_id: string | null; access_level: string | null }

type Col = { key: string; dept: string | null; level: 'colaborador' | 'responsavel' | 'gerente'; title: string; sub: string };

const RANK: Record<string, number> = { colaborador: 1, responsavel: 2, gerente: 3 };

export default function AccessProfiles() {
  const { profile } = useAuth();
  const [rules, setRules] = useState<Rule[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const load = async () => {
    const [r, d, p] = await Promise.all([
      supabase.from('access_rules').select('id, department_id, level, module_code'),
      supabase.from('departments').select('id, name').eq('active', true).neq('name', 'Geral').order('name'),
      supabase.from('profiles').select('full_name, department_id, access_level').eq('active', true),
    ]);
    setRules((r.data as Rule[]) ?? []);
    setDepts((d.data as Dept[]) ?? []);
    setPeople((p.data as Person[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const cols: Col[] = useMemo(() => [
    { key: 'all-colab', dept: null, level: 'colaborador', title: 'Todas as equipas', sub: 'Colaborador' },
    ...depts.flatMap((d) => [
      { key: `${d.id}-colab`, dept: d.id, level: 'colaborador' as const, title: d.name, sub: 'Colaborador' },
      { key: `${d.id}-resp`, dept: d.id, level: 'responsavel' as const, title: d.name, sub: 'Responsável' },
    ]),
    { key: 'gerente', dept: null, level: 'gerente', title: 'Gerente', sub: 'qualquer equipa' },
  ], [depts]);

  const direct = (c: Col, code: string) => rules.find((r) => r.module_code === code && r.level === c.level && r.department_id === c.dept);
  // herdado: vem de "todas as equipas" ou de um nível abaixo
  const inherited = (c: Col, code: string) => rules.some((r) =>
    r.module_code === code && r !== direct(c, code) &&
    (r.department_id === null || r.department_id === c.dept) &&
    RANK[r.level] <= RANK[c.level] &&
    !(r.department_id === c.dept && r.level === c.level) &&
    (c.level !== 'gerente' || r.level === 'gerente' || r.department_id === null));

  const toggle = async (c: Col, code: string) => {
    const k = `${c.key}:${code}`;
    setBusy(k); setErr('');
    const existing = direct(c, code);
    const { error } = existing
      ? await supabase.from('access_rules').delete().eq('id', existing.id)
      : await supabase.from('access_rules').insert({ department_id: c.dept, level: c.level, module_code: code });
    setBusy(null);
    if (error) setErr(error.message);
    load();
  };

  const countFor = (c: Col) => people.filter((p) =>
    c.level === 'gerente' ? p.access_level === 'gerente'
      : c.dept === null ? p.access_level === 'colaborador' || p.access_level === 'responsavel'
        : p.department_id === c.dept && p.access_level === c.level).length;

  if (profile?.role !== 'Admin') return <div className="p-6 text-slate-600">Só o Admin pode alterar os níveis de acesso.</div>;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 flex items-center gap-2"><Shield className="w-7 h-7" /> Níveis de Acesso</h1>
          <p className="text-slate-600 text-sm mt-1">Que áreas da app cada equipa e nível vê. Admin vê sempre tudo.</p>
        </div>
        <Link to="/users" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 text-white text-sm"><UsersIcon className="w-4 h-4" /> Utilizadores</Link>
      </div>

      <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-900 flex gap-2">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <span>Os níveis acumulam: o Responsável tem também o que o Colaborador da mesma equipa tem, e o que está em "Todas as equipas".
          Os vistos cinzentos são herdados — para os tirar, desmarque na coluna de onde vêm. Exceções por pessoa fazem-se na ficha do utilizador.</span>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}

      <div className="bg-white rounded-xl border border-slate-200 overflow-auto">
        <table className="text-sm min-w-full">
          <thead className="bg-slate-50 sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 font-semibold text-slate-700 min-w-[220px]">Área</th>
              {cols.map((c) => (
                <th key={c.key} className="px-2 py-2 text-center font-semibold text-slate-700 min-w-[96px]">
                  <div>{c.title}</div>
                  <div className="text-xs font-normal text-slate-500">{c.sub}</div>
                  <div className="text-[11px] font-normal text-slate-400">{countFor(c)} pessoa(s)</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {AREA_GROUPS.map((g) => (
              <Fragment key={g.name}>
                <tr className="bg-slate-50/70"><td colSpan={cols.length + 1} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.name}</td></tr>
                {g.areas.map((a) => (
                  <tr key={a.code} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-800">{a.label}</td>
                    {cols.map((c) => {
                      if (ADMIN_ONLY.has(a.code)) return <td key={c.key} className="text-center text-xs text-slate-300">só Admin</td>;
                      const d = direct(c, a.code);
                      const inh = !d && inherited(c, a.code);
                      return (
                        <td key={c.key} className="text-center py-1.5">
                          <button
                            onClick={() => toggle(c, a.code)}
                            disabled={busy === `${c.key}:${a.code}` || inh}
                            title={inh ? 'Herdado de outra coluna' : d ? 'Tirar' : 'Dar acesso'}
                            className={`w-6 h-6 rounded border inline-flex items-center justify-center ${
                              d ? 'bg-emerald-600 border-emerald-600 text-white' : inh ? 'bg-slate-200 border-slate-200 text-slate-500 cursor-default' : 'bg-white border-slate-300 hover:border-slate-500'
                            }`}
                          >
                            {(d || inh) && <Check className="w-4 h-4" />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
