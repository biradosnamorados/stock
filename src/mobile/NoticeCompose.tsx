// Enviar aviso (administração / gerentes): para todos, unidades, equipas ou pessoas escolhidas.
import { useEffect, useMemo, useState } from 'react';
import { Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { pushNotice } from '../lib/push';

type Mode = 'all' | 'units' | 'teams' | 'people';
interface Unit { id: string; name: string }
interface Dept { id: string; name: string }
interface Person { id: string; full_name: string | null; unit_id: string | null; department_id: string | null }

export default function NoticeCompose() {
  const { profile, hasPermission } = useAuth();
  const isAdmin = profile?.role === 'Admin';
  const [mode, setMode] = useState<Mode>('all');
  const [units, setUnits] = useState<Unit[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [selUnits, setSelUnits] = useState<string[]>([]);
  const [selTeams, setSelTeams] = useState<string[]>([]); // "unit|dept"
  const [selPeople, setSelPeople] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [ack, setAck] = useState(false);
  const [days, setDays] = useState(7);
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([
      supabase.from('units').select('id, name').eq('active', true).order('name'),
      supabase.from('departments').select('id, name').eq('active', true).neq('name', 'Geral').order('name'),
      supabase.from('profiles').select('id, full_name, unit_id, department_id').eq('active', true).order('full_name'),
    ]).then(([u, d, p]) => {
      const myUnit = profile?.unit_id;
      setUnits(((u.data as Unit[]) ?? []).filter((x) => isAdmin || x.id === myUnit));
      setDepts((d.data as Dept[]) ?? []);
      setPeople(((p.data as Person[]) ?? []).filter((x) => isAdmin || x.unit_id === myUnit));
    });
  }, [isAdmin, profile?.unit_id]);

  // equipas que existem mesmo (unidade + equipa com pessoas)
  const teams = useMemo(() => {
    const keys = new Set(people.filter((p) => p.unit_id && p.department_id).map((p) => `${p.unit_id}|${p.department_id}`));
    return [...keys].map((k) => {
      const [u, d] = k.split('|');
      return { key: k, unit: u, dept: d, label: `${depts.find((x) => x.id === d)?.name ?? '?'} · ${units.find((x) => x.id === u)?.name ?? '?'}` };
    }).filter((t) => !t.label.includes('?')).sort((a, b) => a.label.localeCompare(b.label));
  }, [people, depts, units]);

  const audience = useMemo(() => {
    if (mode === 'all') return { type: 'all' };
    if (mode === 'units') return { type: 'units', units: selUnits };
    if (mode === 'teams') return { type: 'teams', teams: selTeams.map((k) => ({ unit: k.split('|')[0], dept: k.split('|')[1] })) };
    return { type: 'people', people: selPeople };
  }, [mode, selUnits, selTeams, selPeople]);

  useEffect(() => {
    let alive = true;
    supabase.rpc('notice_audience_count', { p_audience: audience }).then(({ data }) => { if (alive) setCount((data as number) ?? 0); });
    return () => { alive = false; };
  }, [audience]);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const send = async () => {
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc('send_notice', {
      p_title: title, p_message: message, p_audience: audience, p_urgent: urgent, p_require_ack: ack, p_days: days,
    });
    if (error) { setBusy(false); return setMsg({ ok: false, text: error.message }); }
    const push = (data as any)?.id ? await pushNotice((data as any).id) : null;
    setBusy(false);
    const n = (data as any)?.recipients ?? count;
    setMsg({ ok: true, text: `Aviso enviado a ${n} pessoa${n === 1 ? '' : 's'}${push?.sent ? ` · notificação em ${push.sent} telemóve${push.sent === 1 ? 'l' : 'is'}` : ''}.` });
    setTitle(''); setMessage(''); setUrgent(false); setAck(false);
  };

  if (!hasPermission('notices')) return <div className="p-6 text-[#5B635E]">Só a administração e os gerentes podem enviar avisos.</div>;

  const chip = (on: boolean) => `h-10 px-4 rounded-full border-2 text-sm ${on ? 'border-[#015939] bg-[#E3F1EA] text-[#015939] font-extrabold' : 'border-[#CFC9BC] bg-white text-[#3E4541] font-bold'}`;
  const filteredPeople = people.filter((p) => (p.full_name ?? '').toLowerCase().includes(search.trim().toLowerCase()));
  const ready = title.trim() && message.trim() && (count ?? 0) > 0;

  return (
    <div className="px-5 pt-4 pb-6 flex flex-col gap-5 max-w-xl mx-auto text-[#1F2420]" style={{ fontFamily: "'Nunito', system-ui, sans-serif" }}>
      <h1 className="text-2xl font-extrabold">Enviar aviso</h1>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-[15px] font-extrabold mb-2">Para quem</legend>
        <div className="grid grid-cols-4 gap-1.5 bg-[#ECE8DF] p-1 rounded-xl">
          {([['all', 'Todos'], ['units', 'Unidade'], ['teams', 'Equipa'], ['people', 'Pessoas']] as [Mode, string][]).map(([m, l]) => (
            <button key={m} onClick={() => setMode(m)}
              className={`h-10 rounded-[9px] text-sm ${mode === m ? 'bg-white shadow-sm text-[#015939] font-extrabold' : 'text-[#3E4541] font-bold'}`}>{l}</button>
          ))}
        </div>

        {mode === 'units' && <div className="flex flex-wrap gap-2 mt-1">{units.map((u) => <button key={u.id} onClick={() => toggle(selUnits, setSelUnits, u.id)} className={chip(selUnits.includes(u.id))}>{u.name}</button>)}</div>}
        {mode === 'teams' && <div className="flex flex-wrap gap-2 mt-1">{teams.map((t) => <button key={t.key} onClick={() => toggle(selTeams, setSelTeams, t.key)} className={chip(selTeams.includes(t.key))}>{t.label}</button>)}</div>}
        {mode === 'people' && (
          <div className="flex flex-col gap-2 mt-1">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Procurar pessoa" className="h-11 px-3 rounded-xl border-2 border-[#CFC9BC] bg-white" />
            <div className="flex flex-wrap gap-2">{filteredPeople.map((p) => <button key={p.id} onClick={() => toggle(selPeople, setSelPeople, p.id)} className={chip(selPeople.includes(p.id))}>{p.full_name}</button>)}</div>
          </div>
        )}
        <span className="text-[13px] text-[#5B635E]">{count == null ? '…' : count === 0 ? 'Ainda não chega a ninguém' : `Vai chegar a ${count} pessoa${count === 1 ? '' : 's'}`}</span>
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className="text-[15px] font-extrabold">Título</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className="h-12 px-3 rounded-xl border-2 border-[#CFC9BC] bg-white text-base font-bold" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[15px] font-extrabold">Mensagem</span>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} className="px-3 py-2.5 rounded-xl border-2 border-[#CFC9BC] bg-white text-[15px] leading-relaxed resize-none" />
      </label>

      <div className="bg-white rounded-xl shadow-[0_1px_2px_rgba(1,89,57,0.06),0_4px_12px_rgba(1,89,57,0.08)] divide-y divide-[#ECE8DF]">
        <label className="flex items-center gap-3 px-4 py-3 min-h-[56px]">
          <span className="flex-1"><span className="block text-[15px] font-extrabold">Urgente</span><span className="block text-[13px] text-[#5B635E]">Aparece em destaque, a vermelho</span></span>
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="w-6 h-6 accent-[#015939]" />
        </label>
        <label className="flex items-center gap-3 px-4 py-3 min-h-[56px]">
          <span className="flex-1"><span className="block text-[15px] font-extrabold">Pedir confirmação de leitura</span><span className="block text-[13px] text-[#5B635E]">Vê quem já leu e quem falta</span></span>
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="w-6 h-6 accent-[#015939]" />
        </label>
        <label className="flex items-center gap-3 px-4 py-3 min-h-[56px]">
          <span className="flex-1 text-[15px] font-extrabold">Fica visível durante</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-10 px-2 rounded-lg border-2 border-[#CFC9BC] bg-white font-bold">
            {[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} dia{d > 1 ? 's' : ''}</option>)}
          </select>
        </label>
      </div>

      {msg && (
        <div className={`p-3 rounded-xl text-sm flex gap-2 ${msg.ok ? 'bg-[#E3F1EA] text-[#015939]' : 'bg-red-50 text-red-800'}`}>
          {msg.ok ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}<span className="font-bold">{msg.text}</span>
        </div>
      )}

      <button onClick={send} disabled={!ready || busy}
        className="h-14 rounded-2xl bg-[#015939] text-white text-[17px] font-extrabold flex items-center justify-center gap-2 disabled:opacity-40">
        <Send className="w-5 h-5" /> {busy ? 'A enviar…' : count ? `Enviar a ${count} pessoa${count === 1 ? '' : 's'}` : 'Enviar'}
      </button>
      <p className="text-[12px] text-[#5B635E] text-center -mt-2">O aviso aparece na app e no site, e chega como notificação a quem tem a app instalada.</p>
    </div>
  );
}
