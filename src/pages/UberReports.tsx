import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Bike, RefreshCw, Send, AlertCircle, CheckCircle2, Clock } from 'lucide-react';

interface Req {
  id: string;
  workflow_id: string | null;
  report_type: string;
  start_date: string;
  end_date: string;
  status: 'requested' | 'done' | 'error';
  requested_at: string;
  completed_at: string | null;
  row_count: number | null;
  error: string | null;
}
interface RowData { id: number; request_id: string | null; order_id: string | null; store_uuid: string | null; data: Record<string, string> }
interface Store { store_uuid: string; name: string }

const TYPES: { v: string; label: string; maxDays?: number }[] = [
  { v: 'PAYMENT_DETAILS_REPORT', label: 'Detalhe de pagamentos (por pedido)', maxDays: 30 },
  { v: 'ORDER_ERRORS_TRANSACTION_REPORT', label: 'Erros de pedido / reembolsos' },
  { v: 'FINANCE_SUMMARY_REPORT', label: 'Resumo financeiro', maxDays: 30 },
  { v: 'ORDERS_AND_ITEMS_REPORT', label: 'Pedidos e artigos', maxDays: 15 },
  { v: 'ORDER_HISTORY_REPORT', label: 'Histórico de pedidos' },
  { v: 'DOWNTIME_REPORT', label: 'Tempo offline da loja' },
];
const typeLabel = (v: string) => TYPES.find((t) => t.v === v)?.label ?? v;

const lisbon = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(d);
const daysAgo = (n: number) => lisbon(new Date(Date.now() - n * 86400000));
const fmtDate = (d: string) => d.split('-').reverse().join('/');
const fmtTs = (t: string | null) => (t ? new Date(t).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' }) : '—');

export default function UberReports() {
  const { profile, hasPermission } = useAuth();
  const [reqs, setReqs] = useState<Req[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [rows, setRows] = useState<RowData[]>([]);
  const [type, setType] = useState(TYPES[0].v);
  const [start, setStart] = useState(daysAgo(7));
  const [end, setEnd] = useState(daysAgo(4));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState('');

  const load = async () => {
    const [{ data: r }, { data: s }] = await Promise.all([
      supabase.from('uber_report_requests').select('*').order('requested_at', { ascending: false }).limit(50),
      supabase.from('uber_stores').select('store_uuid, name').eq('active', true),
    ]);
    setReqs((r as Req[]) ?? []);
    setStores((s as Store[]) ?? []);
  };

  useEffect(() => { load(); }, []);

  // atualizar enquanto houver pedidos à espera
  useEffect(() => {
    if (!reqs.some((r) => r.status === 'requested')) return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [reqs]);

  useEffect(() => {
    if (!selected) { setRows([]); return; }
    supabase.from('uber_report_rows').select('id, request_id, order_id, store_uuid, data').eq('request_id', selected).order('row_num').limit(2000)
      .then(({ data }) => setRows((data as RowData[]) ?? []));
  }, [selected]);

  const storeName = (u: string | null) => stores.find((s) => s.store_uuid === u)?.name ?? '';

  const columns = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => Object.keys(r.data).forEach((k) => set.add(k)));
    return [...set];
  }, [rows]);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return rows;
    return rows.filter((r) => Object.values(r.data).some((v) => v.toLowerCase().includes(f)));
  }, [rows, filter]);

  const request = async () => {
    setMsg(null);
    const t = TYPES.find((x) => x.v === type);
    const days = (new Date(end).getTime() - new Date(start).getTime()) / 86400000 + 1;
    if (days < 1) return setMsg({ ok: false, text: 'A data final tem de ser igual ou posterior à inicial.' });
    if (t?.maxDays && days > t.maxDays) return setMsg({ ok: false, text: `Este relatório aceita no máximo ${t.maxDays} dias.` });
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('uber-reports', { body: { action: 'request', report_type: type, start_date: start, end_date: end } });
    setBusy(false);
    if (error || !data?.ok) {
      let text = data?.error ?? error?.message ?? 'Erro desconhecido';
      try { const ctx = await (error as any)?.context?.json?.(); if (ctx?.error) text = ctx.error; } catch { /* */ }
      setMsg({ ok: false, text });
    } else {
      setMsg({ ok: true, text: 'Pedido enviado à Uber. O relatório aparece aqui quando estiver pronto (normalmente alguns minutos).' });
    }
    load();
  };

  const checkConn = async () => {
    setMsg(null);
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('uber-reports', { body: { action: 'check' } });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    if (!data.secrets) return setMsg({ ok: false, text: 'Faltam as credenciais da Uber no Supabase (UBER_CLIENT_ID / UBER_CLIENT_SECRET).' });
    if (!data.token) return setMsg({ ok: false, text: 'Credenciais presentes, mas a Uber recusou: ' + (data.error ?? '') });
    setMsg({ ok: true, text: 'Ligação à Uber OK.' });
  };

  if (profile && !hasPermission('uber')) {
    return <div className="p-6 text-slate-600">Sem acesso.</div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Bike className="w-7 h-7" /> Uber Eats</h1>
          <p className="text-slate-600 text-sm mt-1">
            Relatórios da Uber Eats {stores.length ? `(${stores.map((s) => s.name).join(' + ')})` : ''}. Os dados podem demorar até 72h a ficar fechados do lado da Uber.
          </p>
        </div>
        <button onClick={checkConn} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className="w-4 h-4" /> Testar ligação
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <h2 className="font-semibold text-slate-900">Pedir relatório</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <label className="text-sm sm:col-span-2">
            <span className="text-slate-600">Tipo</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2">
              {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-slate-600">De</span>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">Até</span>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2" />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={request} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50">
            <Send className="w-4 h-4" /> Pedir à Uber
          </button>
          {msg && (
            <span className={`text-sm flex items-center gap-1 ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>
              {msg.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />} {msg.text}
            </span>
          )}
        </div>
      </div>

      <OrdersSummary />

      <h2 className="font-semibold text-slate-900">Relatórios pedidos</h2>
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">Pedido em</th>
              <th className="text-left px-3 py-2">Relatório</th>
              <th className="text-left px-3 py-2">Período</th>
              <th className="text-left px-3 py-2">Estado</th>
              <th className="text-right px-3 py-2">Linhas</th>
            </tr>
          </thead>
          <tbody>
            {reqs.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Ainda não foram pedidos relatórios.</td></tr>}
            {reqs.map((r) => (
              <tr key={r.id} onClick={() => r.status === 'done' && setSelected(r.id)}
                className={`border-t border-slate-100 ${r.status === 'done' ? 'cursor-pointer hover:bg-slate-50' : ''} ${selected === r.id ? 'bg-emerald-50' : ''}`}>
                <td className="px-3 py-2">{fmtTs(r.requested_at)}</td>
                <td className="px-3 py-2">{typeLabel(r.report_type)}</td>
                <td className="px-3 py-2">{fmtDate(r.start_date)} – {fmtDate(r.end_date)}</td>
                <td className="px-3 py-2">
                  {r.status === 'done' && <span className="text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Pronto</span>}
                  {r.status === 'requested' && <span className="text-amber-700 flex items-center gap-1"><Clock className="w-4 h-4" /> A aguardar a Uber</span>}
                  {r.status === 'error' && <span className="text-red-700" title={r.error ?? ''}>Erro: {(r.error ?? '').slice(0, 80)}</span>}
                </td>
                <td className="px-3 py-2 text-right">{r.row_count ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">Linhas do relatório ({shown.length})</h2>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Procurar (n.º pedido, valor…)" className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full sm:w-72" />
          </div>
          <div className="overflow-auto max-h-[60vh]">
            <table className="text-xs whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-600 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1">Loja</th>
                  {columns.map((c) => <th key={c} className="text-left px-2 py-1">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-2 py-1">{storeName(r.store_uuid)}</td>
                    {columns.map((c) => <td key={c} className="px-2 py-1">{r.data[c] ?? ''}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

interface UberOrder {
  row_id: number;
  store_name: string | null;
  order_id: string;
  order_date: string | null;
  order_status: string;
  sales_incl_vat: number;
  offers_incl_vat: number;
  total_order: number;
  marketplace_fee: number;
  chargeback_incl_vat: number;
  price_adjustments: number;
  total_payout: number;
  payout_date: string | null;
}

const eur = (n: number) => Number(n).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
const STATUS_PT: Record<string, string> = { Completed: 'Concluído', Cancelled: 'Cancelado', Refund: 'Reembolso', Unfulfilled: 'Não entregue' };
const addDays = (d: string, n: number) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

function OrdersSummary() {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(lisbon());
  const [orders, setOrders] = useState<UberOrder[]>([]);
  const [tab, setTab] = useState<'dia' | 'problemas'>('dia');

  useEffect(() => {
    supabase.from('uber_orders').select('*').gte('order_date', from).lte('order_date', to).order('order_date', { ascending: false })
      .then(({ data }) => setOrders((data as UberOrder[]) ?? []));
  }, [from, to]);

  const byDay = useMemo(() => {
    const m = new Map<string, { n: number; total: number; sales: number; offers: number; fee: number; payout: number; issues: number }>();
    for (const o of orders) {
      const k = o.order_date ?? '?';
      const v = m.get(k) ?? { n: 0, total: 0, sales: 0, offers: 0, fee: 0, payout: 0, issues: 0 };
      if (o.order_status === 'Completed') { v.n++; v.total += +o.total_order; v.sales += +o.sales_incl_vat; v.offers += +o.offers_incl_vat; }
      v.fee += +o.marketplace_fee; v.payout += +o.total_payout;
      if (o.order_status !== 'Completed' || +o.chargeback_incl_vat !== 0 || +o.price_adjustments !== 0) v.issues++;
      m.set(k, v);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [orders]);

  const issues = useMemo(
    () => orders.filter((o) => o.order_status !== 'Completed' || +o.chargeback_incl_vat !== 0 || +o.price_adjustments !== 0),
    [orders],
  );
  const today = lisbon();
  const totals = byDay.reduce((s, [, v]) => ({ n: s.n + v.n, total: s.total + v.total, fee: s.fee + v.fee, payout: s.payout + v.payout }), { n: 0, total: 0, fee: 0, payout: 0 });

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="flex gap-2">
          <button onClick={() => setTab('dia')} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === 'dia' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>Resumo por dia</button>
          <button onClick={() => setTab('problemas')} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === 'problemas' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>
            Reembolsos e erros {issues.length > 0 && <span className="ml-1 px-1.5 rounded bg-red-600 text-white text-xs">{issues.length}</span>}
          </button>
        </div>
        <div className="flex gap-2 text-sm">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5" />
        </div>
      </div>

      {orders.length === 0 && <p className="text-sm text-slate-500">Sem dados da Uber neste período. Peça um relatório "Detalhe de pagamentos" acima.</p>}

      {orders.length > 0 && tab === 'dia' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="rounded-lg bg-slate-50 p-3"><div className="text-slate-500">Pedidos</div><div className="text-lg font-semibold">{totals.n}</div></div>
            <div className="rounded-lg bg-slate-50 p-3"><div className="text-slate-500">Total pedidos (POS)</div><div className="text-lg font-semibold">{eur(totals.total)}</div></div>
            <div className="rounded-lg bg-slate-50 p-3"><div className="text-slate-500">Comissão Uber</div><div className="text-lg font-semibold text-red-700">{eur(totals.fee)}</div></div>
            <div className="rounded-lg bg-slate-50 p-3"><div className="text-slate-500">A receber</div><div className="text-lg font-semibold text-emerald-700">{eur(totals.payout)}</div></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2">Dia</th>
                  <th className="text-right px-3 py-2">Pedidos</th>
                  <th className="text-right px-3 py-2">Vendas</th>
                  <th className="text-right px-3 py-2">Promoções</th>
                  <th className="text-right px-3 py-2" title="Valor que deve bater com a linha Uber do POS">Total pedidos</th>
                  <th className="text-right px-3 py-2">Comissão</th>
                  <th className="text-right px-3 py-2">A receber</th>
                  <th className="text-right px-3 py-2">Problemas</th>
                </tr>
              </thead>
              <tbody>
                {byDay.map(([d, v]) => (
                  <tr key={d} className="border-t border-slate-100">
                    <td className="px-3 py-2">{fmtDate(d)}</td>
                    <td className="px-3 py-2 text-right">{v.n}</td>
                    <td className="px-3 py-2 text-right">{eur(v.sales)}</td>
                    <td className="px-3 py-2 text-right">{eur(v.offers)}</td>
                    <td className="px-3 py-2 text-right font-medium">{eur(v.total)}</td>
                    <td className="px-3 py-2 text-right text-red-700">{eur(v.fee)}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">{eur(v.payout)}</td>
                    <td className="px-3 py-2 text-right">{v.issues ? <span className="text-red-700 font-medium">{v.issues}</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {orders.length > 0 && tab === 'problemas' && (
        issues.length === 0 ? <p className="text-sm text-emerald-700">Sem reembolsos nem erros neste período.</p> : (
          <div className="overflow-x-auto">
            <p className="text-xs text-slate-500 mb-2">A contestação faz-se no Uber Eats Manager (Pedidos → pedido → Contestar), até 30 dias após o pedido, com fotos.</p>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2">Dia</th>
                  <th className="text-left px-3 py-2">Pedido</th>
                  <th className="text-left px-3 py-2">Loja</th>
                  <th className="text-left px-3 py-2">Estado</th>
                  <th className="text-right px-3 py-2">Reembolso</th>
                  <th className="text-right px-3 py-2">Ajuste preço</th>
                  <th className="text-right px-3 py-2">Efeito no pagamento</th>
                  <th className="text-left px-3 py-2">Contestar até</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((o) => {
                  const deadline = o.order_date ? addDays(o.order_date, 30) : null;
                  const left = deadline ? Math.round((new Date(deadline).getTime() - new Date(today).getTime()) / 86400000) : null;
                  return (
                    <tr key={o.row_id} className="border-t border-slate-100">
                      <td className="px-3 py-2">{o.order_date ? fmtDate(o.order_date) : '—'}</td>
                      <td className="px-3 py-2 font-mono">{o.order_id}</td>
                      <td className="px-3 py-2">{o.store_name}</td>
                      <td className="px-3 py-2">{STATUS_PT[o.order_status] ?? o.order_status}</td>
                      <td className="px-3 py-2 text-right text-red-700">{+o.chargeback_incl_vat ? eur(o.chargeback_incl_vat) : '—'}</td>
                      <td className="px-3 py-2 text-right">{+o.price_adjustments ? eur(o.price_adjustments) : '—'}</td>
                      <td className="px-3 py-2 text-right">{eur(o.total_payout)}</td>
                      <td className={`px-3 py-2 ${left != null && left < 0 ? 'text-slate-400 line-through' : left != null && left <= 7 ? 'text-red-700 font-semibold' : ''}`}>
                        {deadline ? `${fmtDate(deadline)}${left != null && left >= 0 ? ` (${left} dias)` : ' (expirado)'}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
