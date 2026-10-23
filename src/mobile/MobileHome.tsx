// "Hoje": só o que a pessoa tem de fazer, com botões grandes.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { QrCode, Truck, Thermometer, Package, Megaphone, ChevronRight, CheckCircle2, X, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { businessDateLisbon } from '../lib/native';

interface Todo { key: string; title: string; sub: string; href: string; tone: 'red' | 'yellow' | 'blue' }
interface Notice { id: string; title: string; message: string; urgent: boolean; require_ack: boolean; created_at: string; read: boolean }
interface ClosingState { date: string; status: string | null; steps: boolean[] }

const STEP_LABELS = ['POS', 'TPA', 'Dinheiro', 'Gorjetas', 'Enviar'];
const fmtDay = (d: string) => d.split('-').reverse().slice(0, 2).join('/');
const todayLong = () => new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
const greeting = () => {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', hour12: false }).format(new Date())) % 24;
  return h < 13 ? 'Bom dia' : h < 20 ? 'Boa tarde' : 'Boa noite';
};
const TONE: Record<Todo['tone'], string> = { red: 'bg-[#E60717]', yellow: 'bg-[#FED420]', blue: 'bg-[#1982C1]' };

export default function MobileHome() {
  const { profile, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [closing, setClosing] = useState<ClosingState | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [open, setOpen] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);

  const firstName = (profile?.full_name || '').split(' ')[0];
  const unitId = profile?.unit_id ?? null;

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());
    const list: Todo[] = [];

    // ── fecho de caixa do dia de trabalho ──
    if (hasPermission('cash_closing') && unitId) {
      const date = businessDateLisbon();
      const { data: c } = await supabase.from('cash_closings').select('id, status, cashmatic_total').eq('unit_id', unitId).eq('closing_date', date).maybeSingle();
      if (c) {
        const [{ count: nLines }, { count: nTpa }, { count: nTips }] = await Promise.all([
          supabase.from('cash_closing_lines').select('id', { count: 'exact', head: true }).eq('closing_id', c.id).not('declared', 'is', null),
          supabase.from('cash_closing_attachments').select('id', { count: 'exact', head: true }).eq('closing_id', c.id).eq('kind', 'tpa_receipt'),
          supabase.from('cash_tips').select('id', { count: 'exact', head: true }).eq('closing_id', c.id),
        ]);
        const sent = c.status === 'submitted' || c.status === 'validated';
        setClosing({ date, status: c.status, steps: [!!nLines, !!nTpa, c.cashmatic_total != null, sent || !!nTips, sent] });
      } else {
        setClosing({ date, status: null, steps: [false, false, false, false, false] });
      }
    } else setClosing(null);

    // ── HACCP e tarefas obrigatórias de hoje ──
    if (hasPermission('haccp') && unitId) {
      const dow = new Date().getDay();
      const [{ data: tasks }, { data: sessions }] = await Promise.all([
        supabase.from('haccp_tasks').select('id, name, frequency, scheduled_days').eq('active', true).or(`unit_id.eq.${unitId},unit_id.is.null`),
        supabase.from('haccp_task_sessions').select('task_id, status').eq('session_date', today).eq('unit_id', unitId),
      ]);
      const done = new Set((sessions ?? []).filter((s: any) => s.status === 'completed' || s.status === 'non_compliant').map((s: any) => s.task_id));
      const due = (tasks ?? []).filter((t: any) => (t.frequency !== 'specific_days' || (Array.isArray(t.scheduled_days) && t.scheduled_days.includes(dow))) && !done.has(t.id));
      if (due.length === 1) list.push({ key: 'haccp', title: (due[0] as any).name, sub: 'HACCP · por fazer hoje', href: '/haccp', tone: 'red' });
      else if (due.length > 1) list.push({ key: 'haccp', title: `${due.length} registos HACCP por fazer`, sub: (due as any[]).slice(0, 2).map((t) => t.name).join(' · '), href: '/haccp', tone: 'red' });
    }

    // ── mercadoria por receber ──
    if (hasPermission('goods_receipts') && unitId) {
      const { data: po } = await supabase.from('purchase_orders').select('id, expected_delivery_date, suppliers(name)')
        .eq('unit_id', unitId).in('status', ['sent', 'confirmed', 'partially_received']).order('expected_delivery_date').limit(3);
      (po ?? []).forEach((o: any) => list.push({
        key: `po-${o.id}`, title: `Encomenda ${o.suppliers?.name ?? ''} por receber`,
        sub: o.expected_delivery_date ? (o.expected_delivery_date <= today ? 'Entrega prevista hoje' : `Entrega prevista ${fmtDay(o.expected_delivery_date)}`) : 'Sem data prevista',
        href: '/purchases', tone: 'yellow',
      }));
    }
    if (hasPermission('internal_orders') && unitId) {
      const { count } = await supabase.from('internal_orders').select('id', { count: 'exact', head: true }).eq('to_unit_id', unitId).eq('status', 'shipped');
      if (count) list.push({ key: 'io', title: count === 1 ? 'Pedido do CDP a caminho' : `${count} pedidos do CDP a caminho`, sub: 'Confirme quando chegar', href: '/internal-orders', tone: 'yellow' });
    }

    // ── Uber: reembolsos ainda a tempo de contestar ──
    if (hasPermission('uber')) {
      const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const { data: issues } = await supabase.from('uber_orders').select('order_date, order_status, chargeback_incl_vat').gte('order_date', since);
      const open = (issues ?? []).filter((o: any) => o.order_status !== 'Completed' || Number(o.chargeback_incl_vat) !== 0);
      if (open.length) {
        const oldest = open.map((o: any) => o.order_date).sort()[0];
        const left = 30 - Math.round((Date.now() - new Date(oldest + 'T12:00:00Z').getTime()) / 86400000);
        list.push({ key: 'uber', title: open.length === 1 ? '1 reembolso Uber para contestar' : `${open.length} reembolsos Uber para contestar`, sub: `O mais antigo tem ${Math.max(left, 0)} dias de prazo`, href: '/uber', tone: 'blue' });
      }
    }
    setTodos(list);

    // ── avisos ──
    const [{ data: n }, { data: reads }] = await Promise.all([
      supabase.from('dashboard_notices').select('id, title, message, urgent, require_ack, created_at, end_date, audience, target_unit_id, target_department_id')
        .gte('end_date', today).order('created_at', { ascending: false }).limit(20),
      supabase.from('notice_recipients').select('notice_id, read_at').eq('user_id', profile.id),
    ]);
    const readMap = new Map((reads ?? []).map((r: any) => [r.notice_id, r.read_at]));
    let dismissed = new Set<string>();
    try { dismissed = new Set(JSON.parse(localStorage.getItem('bn_dismissed_notices') || '[]')); } catch { /* */ }
    setNotices((n ?? [])
      .filter((x: any) => x.audience ? readMap.has(x.id) : ((!x.target_unit_id || x.target_unit_id === unitId) && (!x.target_department_id || x.target_department_id === profile.department_id)))
      .map((x: any) => ({ id: x.id, title: x.title, message: x.message, urgent: !!x.urgent, require_ack: !!x.require_ack, created_at: x.created_at,
        read: x.audience ? !!readMap.get(x.id) : dismissed.has(x.id) }))
      .sort((a, b) => Number(a.read) - Number(b.read)));
    setLoading(false);
  }, [profile, unitId, hasPermission]);

  useEffect(() => { load(); }, [load]);

  const openNotice = async (n: Notice) => {
    setOpen(n);
    if (n.read) return;
    const { error } = await supabase.rpc('mark_notice_read', { p_notice: n.id });
    if (error) {
      try {
        const s = new Set(JSON.parse(localStorage.getItem('bn_dismissed_notices') || '[]')); s.add(n.id);
        localStorage.setItem('bn_dismissed_notices', JSON.stringify([...s]));
      } catch { /* */ }
    }
    setNotices((ns) => ns.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
  };

  const tiles = useMemo(() => [
    hasPermission('scanner') && { href: '/scanner', label: 'Ler QR', icon: QrCode, color: '#1982C1' },
    hasPermission('goods_receipts') && { href: '/purchases?tab=rececoes', label: 'Receber mercadoria', icon: Truck, color: '#015939' },
    hasPermission('haccp') && { href: '/haccp', label: 'Registo HACCP', icon: Thermometer, color: '#B3141F' },
    hasPermission('internal_orders') && { href: '/internal-orders', label: 'Pedido ao CDP', icon: Package, color: '#8A6A00' },
    hasPermission('notices') && { href: '/avisos/novo', label: 'Enviar aviso', icon: Megaphone, color: '#015939' },
  ].filter(Boolean) as { href: string; label: string; icon: any; color: string }[], [hasPermission]);

  const doneSteps = closing?.steps.filter(Boolean).length ?? 0;
  const closed = closing?.status === 'submitted' || closing?.status === 'validated';
  const nextStep = closing ? STEP_LABELS[closing.steps.findIndex((s) => !s)] : null;
  const unread = notices.filter((n) => !n.read).length;

  return (
    <div className="px-5 pb-6">
      <header className="pt-4 pb-3 flex items-center gap-3">
        <img src="/app-icon.png" alt="" className="w-10 h-10 rounded-[10px]" />
        <div className="flex-1 min-w-0">
          <p className="text-xl font-extrabold leading-tight truncate">{greeting()}{firstName ? `, ${firstName}` : ''}</p>
          <p className="text-[13px] text-[#5B635E] first-letter:uppercase">{profile?.units?.name ? `${profile.units.name} · ` : ''}{todayLong()}</p>
        </div>
        <button onClick={load} aria-label="Atualizar" className="w-11 h-11 rounded-full bg-white shadow-[0_1px_2px_rgba(1,89,57,0.06),0_4px_12px_rgba(1,89,57,0.08)] flex items-center justify-center">
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      <div className="flex flex-col gap-4">
        {closing && !closed && (
          <section className="bg-[#015939] text-white rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-wider uppercase bg-white/15 px-2 py-1 rounded-md">Por fechar</span>
              <span className="text-[13px] opacity-90">Dia de trabalho {fmtDay(closing.date)}</span>
            </div>
            <p className="text-[22px] font-extrabold leading-tight">Fechar a caixa</p>
            <div className="flex gap-1.5">
              {closing.steps.map((s, i) => <span key={i} className={`flex-1 h-1.5 rounded ${s ? 'bg-[#FED420]' : 'bg-white/30'}`} />)}
            </div>
            <p className="text-sm opacity-95">{doneSteps} de 5 passos{nextStep ? ` · a seguir: ${nextStep}` : ''}</p>
            <Link to={`/cash-closing?unit=${unitId}&date=${closing.date}`} className="mt-1 h-[52px] rounded-xl bg-white text-[#015939] text-[17px] font-extrabold flex items-center justify-center">
              {doneSteps ? 'Continuar o fecho' : 'Começar o fecho'}
            </Link>
          </section>
        )}
        {closing && closed && (
          <section className="bg-white rounded-xl p-4 flex items-center gap-3 shadow-[0_1px_2px_rgba(1,89,57,0.06),0_4px_12px_rgba(1,89,57,0.08)]">
            <CheckCircle2 className="w-7 h-7 text-[#015939]" />
            <div className="flex-1">
              <p className="font-extrabold">Caixa de {fmtDay(closing.date)} fechada</p>
              <p className="text-[13px] text-[#5B635E]">{closing.status === 'validated' ? 'Validada pela gerência' : 'À espera de validação'}</p>
            </div>
          </section>
        )}

        {tiles.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {tiles.map((t) => {
              const Icon = t.icon;
              return (
                <Link key={t.href} to={t.href} className="bg-white rounded-xl p-4 min-h-[96px] flex flex-col justify-between shadow-[0_1px_2px_rgba(1,89,57,0.06),0_4px_12px_rgba(1,89,57,0.08)] active:scale-[0.98] transition">
                  <Icon className="w-7 h-7" style={{ color: t.color }} />
                  <span className="text-base font-bold leading-tight">{t.label}</span>
                </Link>
              );
            })}
          </div>
        )}

        {notices.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-[17px] font-extrabold mt-1">Avisos {unread > 0 && <span className="ml-1 text-xs align-middle bg-[#E60717] text-white rounded-full px-2 py-0.5">{unread}</span>}</h2>
            <div className="bg-white rounded-xl shadow-[0_1px_2px_rgba(1,89,57,0.06),0_4px_12px_rgba(1,89,57,0.08)] divide-y divide-[#ECE8DF]">
              {notices.slice(0, 4).map((n) => (
                <button key={n.id} onClick={() => openNotice(n)} className="w-full text-left flex items-center gap-3 px-4 py-3.5 min-h-[56px]">
                  <Megaphone className={`w-5 h-5 shrink-0 ${n.urgent ? 'text-[#B3141F]' : 'text-[#015939]'}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-[15px] truncate ${n.read ? 'font-semibold text-[#5B635E]' : 'font-extrabold'}`}>{n.title}</p>
                    <p className="text-[13px] text-[#5B635E] truncate">{n.message}</p>
                  </div>
                  {!n.read && <span className="w-2.5 h-2.5 rounded-full bg-[#E60717] shrink-0" />}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-[17px] font-extrabold mt-1">Por fazer hoje</h2>
          {todos.length === 0 && !loading ? (
            <div className="bg-white rounded-xl p-4 flex items-center gap-3 shadow-[0_1px_2px_rgba(1,89,57,0.06),0_4px_12px_rgba(1,89,57,0.08)]">
              <CheckCircle2 className="w-6 h-6 text-[#015939]" /><span className="font-bold">Está tudo em dia.</span>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-[0_1px_2px_rgba(1,89,57,0.06),0_4px_12px_rgba(1,89,57,0.08)] divide-y divide-[#ECE8DF]">
              {todos.map((t) => (
                <button key={t.key} onClick={() => navigate(t.href)} className="w-full text-left flex items-center gap-3 px-4 py-3.5 min-h-[56px]">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${TONE[t.tone]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-bold truncate">{t.title}</p>
                    <p className="text-[13px] text-[#5B635E] truncate">{t.sub}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[#5B635E]" />
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={() => setOpen(null)}>
          <div className="w-full bg-white rounded-t-3xl p-5 pb-8 flex flex-col gap-3" style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }} onClick={(e) => e.stopPropagation()}>
            <span className="self-center w-10 h-1.5 rounded-full bg-[#D9D4C8]" />
            <div className="flex items-start gap-3">
              <Megaphone className={`w-6 h-6 mt-1 ${open.urgent ? 'text-[#B3141F]' : 'text-[#015939]'}`} />
              <h3 className="flex-1 text-xl font-extrabold leading-tight">{open.title}</h3>
              <button aria-label="Fechar" onClick={() => setOpen(null)} className="w-10 h-10 flex items-center justify-center"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-base leading-relaxed whitespace-pre-line">{open.message}</p>
            <p className="text-[13px] text-[#5B635E]">{new Date(open.created_at).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
            <button onClick={() => setOpen(null)} className="h-14 rounded-2xl bg-[#015939] text-white text-[17px] font-extrabold">{open.require_ack ? 'Li e tomei conhecimento' : 'OK'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
