import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { FileSpreadsheet, BarChart3, AlertCircle } from 'lucide-react';
import type { PaymentFamily } from '../lib/cash/fechoParser';

interface Unit { id: string; name: string; type: string }

interface Row {
  id: string;
  unit_id: string;
  closing_date: string;
  status: 'draft' | 'submitted' | 'validated' | 'reopened';
  cashmatic_total: number | null;
  notes: string | null;
  submitted_at: string | null;
  validated_at: string | null;
  units: { name: string } | null;
  submitter: { full_name: string | null } | null;
  validator: { full_name: string | null } | null;
  cash_closing_lines: { payment_method: string; family: PaymentFamily; theoretical: number; declared: number | null }[];
}

const STATUS: Record<Row['status'], string> = { draft: 'Rascunho', submitted: 'Submetido', validated: 'Validado', reopened: 'Reaberto' };
const FAMS: PaymentFamily[] = ['dinheiro', 'cartoes', 'plataformas', 'outro', 'comissoes'];
const FAM_LABEL: Record<PaymentFamily, string> = { dinheiro: 'Dinheiro', cartoes: 'Cartões', plataformas: 'Plataformas', outro: 'Outros', comissoes: 'Comissões' };
const TOLERANCE = 2;

const r2 = (n: number) => Math.round(n * 100) / 100;
const eur = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' }));
const fmtDate = (d: string) => d.split('-').reverse().join('/');
const monthStart = () => {
  const t = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());
  return t.slice(0, 8) + '01';
};
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());

function totals(row: Row) {
  const fam: Record<string, { theo: number; decl: number }> = {};
  for (const l of row.cash_closing_lines) {
    fam[l.family] ??= { theo: 0, decl: 0 };
    fam[l.family].theo += Number(l.theoretical) || 0;
    fam[l.family].decl += Number(l.declared) || 0;
  }
  const real = FAMS.filter((f) => f !== 'comissoes');
  const theo = r2(real.reduce((s, f) => s + (fam[f]?.theo ?? 0), 0));
  const decl = r2(real.reduce((s, f) => s + (fam[f]?.decl ?? 0), 0));
  return { fam, theo, decl, diff: r2(decl - theo) };
}

export default function CashClosingReport() {
  const { profile } = useAuth();
  const isManager = profile?.role === 'Admin' || profile?.role === 'Chefe';
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitId, setUnitId] = useState<string>('all');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    supabase.from('units').select('id, name, type').eq('active', true).order('name').then(({ data }) => {
      setUnits(((data || []) as Unit[]).filter((u) => u.type === 'restaurant' || u.type === 'events'));
    });
  }, []);

  useEffect(() => { if (isManager) load(); }, [unitId, from, to, isManager]);

  async function load() {
    setLoading(true);
    setError(null);
    let q = supabase
      .from('cash_closings')
      .select('id, unit_id, closing_date, status, cashmatic_total, notes, submitted_at, validated_at, units(name), ' +
        'submitter:profiles!cash_closings_submitted_by_fkey(full_name), validator:profiles!cash_closings_validated_by_fkey(full_name), ' +
        'cash_closing_lines(payment_method, family, theoretical, declared)')
      .gte('closing_date', from)
      .lte('closing_date', to)
      .order('closing_date', { ascending: false });
    if (unitId !== 'all') q = q.eq('unit_id', unitId);
    const { data, error } = await q;
    if (error) setError(error.message);
    setRows((data as unknown as Row[]) || []);
    setLoading(false);
  }

  const summary = useMemo(() => {
    let theo = 0, decl = 0, cash = 0;
    for (const r of rows) {
      const t = totals(r);
      theo += t.theo; decl += t.decl; cash += r.cashmatic_total ?? 0;
    }
    return { theo: r2(theo), decl: r2(decl), diff: r2(decl - theo), cash: r2(cash), pending: rows.filter((r) => r.status === 'submitted').length };
  }, [rows]);

  async function exportExcel() {
    setExporting(true);
    try {
      const { default: writeXlsxFile } = await import('write-excel-file/browser');
      const money = { type: Number, format: '#,##0.00 €' } as const;
      const head = (v: string) => ({ value: v, fontWeight: 'bold' as const });

      const sheet1: any[][] = [[
        'Data', 'Unidade', 'Estado', 'Fechado por', 'Validado por',
        ...FAMS.flatMap((f) => [`${FAM_LABEL[f]} teórico`, `${FAM_LABEL[f]} apurado`]),
        'Total teórico', 'Total apurado', 'Diferença', 'Máquina de trocos', 'Observações',
      ].map(head)];
      for (const r of [...rows].sort((a, b) => a.closing_date.localeCompare(b.closing_date))) {
        const t = totals(r);
        sheet1.push([
          { value: new Date(r.closing_date + 'T12:00:00'), type: Date, format: 'dd/mm/yyyy' },
          r.units?.name ?? '', STATUS[r.status], r.submitter?.full_name ?? '', r.validator?.full_name ?? '',
          ...FAMS.flatMap((f) => [{ value: r2(t.fam[f]?.theo ?? 0), ...money }, { value: r2(t.fam[f]?.decl ?? 0), ...money }]),
          { value: t.theo, ...money }, { value: t.decl, ...money }, { value: t.diff, ...money },
          r.cashmatic_total == null ? null : { value: Number(r.cashmatic_total), ...money },
          r.notes ?? '',
        ]);
      }

      const sheet2: any[][] = [['Data', 'Unidade', 'Método', 'Família', 'Teórico', 'Apurado', 'Diferença'].map(head)];
      for (const r of [...rows].sort((a, b) => a.closing_date.localeCompare(b.closing_date))) {
        for (const l of r.cash_closing_lines) {
          const theo = Number(l.theoretical) || 0, decl = Number(l.declared) || 0;
          sheet2.push([
            { value: new Date(r.closing_date + 'T12:00:00'), type: Date, format: 'dd/mm/yyyy' },
            r.units?.name ?? '', l.payment_method, FAM_LABEL[l.family],
            { value: theo, ...money }, { value: decl, ...money }, { value: r2(decl - theo), ...money },
          ]);
        }
      }

      const unitName = unitId === 'all' ? 'todas' : (units.find((u) => u.id === unitId)?.name ?? 'unidade').replace(/\s+/g, '-');
      await writeXlsxFile([
        { data: sheet1, sheet: 'Fechos', columns: [{ width: 12 }, { width: 18 }, { width: 12 }, { width: 20 }, { width: 20 }, ...Array(FAMS.length * 2 + 4).fill({ width: 14 }), { width: 40 }] },
        { data: sheet2, sheet: 'Detalhe por método', columns: [{ width: 12 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }] },
      ] as any).toFile(`fechos-caixa_${unitName}_${from}_a_${to}.xlsx`);
    } catch (e: any) {
      setError(e.message || 'Erro ao exportar.');
    } finally {
      setExporting(false);
    }
  }

  if (!isManager) {
    return <div className="max-w-3xl mx-auto p-6"><div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">Apenas a gerência e a administração podem ver este relatório.</div></div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><BarChart3 className="w-7 h-7" /> Relatório de Fechos</h1>
          <p className="text-slate-600 text-sm mt-1">Histórico dos fechos de caixa, com exportação para Excel para a contabilidade.</p>
        </div>
        <button onClick={exportExcel} disabled={exporting || !rows.length} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
          <FileSpreadsheet className="w-4 h-4" /> {exporting ? 'A exportar…' : 'Exportar Excel'}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
        {units.length > 1 && (
          <div>
            <label className="block text-xs text-slate-500 mb-1">Unidade</label>
            <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
              <option value="all">Todas</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs text-slate-500 mb-1">De</label>
          <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Até</label>
          <input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
        </div>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm flex gap-2"><AlertCircle className="w-4 h-4 mt-0.5" />{error}</div>}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Kpi label="Fechos" value={String(rows.length)} />
        <Kpi label="Teórico" value={eur(summary.theo)} />
        <Kpi label="Apurado" value={eur(summary.decl)} />
        <Kpi label="Diferença" value={eur(summary.diff)} cls={Math.abs(summary.diff) > TOLERANCE ? 'text-red-600' : ''} />
        <Kpi label="Por validar" value={String(summary.pending)} cls={summary.pending ? 'text-amber-600' : ''} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        {loading ? (
          <div className="py-12 text-center"><div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-slate-400">Sem fechos neste período.</p>
        ) : (
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200 bg-slate-50">
                <th className="py-2 px-3 font-medium">Data</th>
                {unitId === 'all' && <th className="py-2 px-3 font-medium">Unidade</th>}
                <th className="py-2 px-3 font-medium">Estado</th>
                <th className="py-2 px-3 font-medium">Fechado por</th>
                <th className="py-2 px-3 font-medium">Validado por</th>
                <th className="py-2 px-3 font-medium text-right">Teórico</th>
                <th className="py-2 px-3 font-medium text-right">Apurado</th>
                <th className="py-2 px-3 font-medium text-right">Diferença</th>
                <th className="py-2 px-3 font-medium text-right">Máq. trocos</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const t = totals(r);
                return (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-3">
                      <Link to={`/cash-closing?unit=${r.unit_id}&date=${r.closing_date}`} className="text-blue-600 hover:underline">{fmtDate(r.closing_date)}</Link>
                    </td>
                    {unitId === 'all' && <td className="py-2 px-3">{r.units?.name}</td>}
                    <td className="py-2 px-3">{STATUS[r.status]}</td>
                    <td className="py-2 px-3 text-slate-600">{r.submitter?.full_name ?? '—'}</td>
                    <td className="py-2 px-3 text-slate-600">{r.validator?.full_name ?? '—'}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{eur(t.theo)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{eur(t.decl)}</td>
                    <td className={`py-2 px-3 text-right tabular-nums ${Math.abs(t.diff) > TOLERANCE ? 'text-red-600 font-semibold' : Math.abs(t.diff) >= 0.005 ? 'text-amber-600' : 'text-slate-500'}`}>{eur(t.diff)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{eur(r.cashmatic_total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, cls = '' }: { label: string; value: string; cls?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${cls}`}>{value}</p>
    </div>
  );
}
