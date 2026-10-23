import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Wallet, FileUp, Camera, HandCoins, RefreshCw, Save, Send, CheckCircle2, RotateCcw, Plus, Trash2,
  AlertTriangle, AlertCircle, Banknote, Image as ImageIcon, FileText, Lock, History,
} from 'lucide-react';
import { parseFechoPdf, familyFor, round2, PaymentFamily } from '../lib/cash/fechoParser';

// ───────────────────────── tipos ─────────────────────────

type Status = 'draft' | 'submitted' | 'validated' | 'reopened';
type AttachmentKind = 'pos_pdf' | 'tpa_receipt' | 'cashmatic' | 'uber' | 'other';

interface Unit { id: string; name: string; type: string }

interface Closing {
  id: string;
  unit_id: string;
  closing_date: string;
  status: Status;
  pos_theoretical_total: number | null;
  declared_total: number | null;
  cashmatic_total: number | null;
  notes: string | null;
  submitted_at: string | null;
  validated_at: string | null;
  reopen_reason: string | null;
  submitter?: { full_name: string | null } | null;
  validator?: { full_name: string | null } | null;
}

interface Line {
  key: string;
  payment_method: string;
  family: PaymentFamily;
  theoretical: string; // texto para permitir edição com vírgula
  declared: string;
  source: 'pos_pdf' | 'manual' | 'cashmatic' | 'tpa';
}

interface Attachment {
  id: string;
  kind: AttachmentKind;
  storage_path: string;
  label: string | null;
  created_at: string;
  url?: string;
}

interface CashmaticTx {
  device_tx_id: number;
  started_at: string | null;
  reference: string | null;
  requested_cents: number | null;
  inserted_cents: number | null;
  dispensed_cents: number | null;
  income_cents: number | null;
  end_type: string | null;
  success: boolean | null;
}

interface Tip {
  id: string;
  amount: number;
  payment_method: string;
  invoice_ref: string | null;
  storage_path: string | null;
  created_at: string;
  url?: string;
}

interface HistoryRow {
  id: string;
  closing_date: string;
  status: Status;
  pos_theoretical_total: number | null;
  declared_total: number | null;
  cashmatic_total: number | null;
}

// ───────────────────────── constantes ─────────────────────────

const TOLERANCE = 2; // € — diferença a partir da qual o fecho fica assinalado

const FAMILY_LABEL: Record<PaymentFamily, string> = {
  dinheiro: 'Dinheiro',
  cartoes: 'Cartões (TPA)',
  plataformas: 'Plataformas (Uber, …)',
  comissoes: 'Comissões TPA',
  outro: 'Outros',
};
const FAMILY_ORDER: PaymentFamily[] = ['dinheiro', 'cartoes', 'plataformas', 'outro', 'comissoes'];

const DEFAULT_METHODS: Array<[string, PaymentFamily]> = [
  ['Numerário', 'dinheiro'],
  ['Cash', 'dinheiro'],
  ['Multibanco', 'cartoes'],
  ['Visa', 'cartoes'],
  ['Uber', 'plataformas'],
];

const STATUS_LABEL: Record<Status, { text: string; cls: string }> = {
  draft: { text: 'Rascunho', cls: 'bg-slate-100 text-slate-700' },
  submitted: { text: 'Submetido', cls: 'bg-blue-50 text-blue-700' },
  validated: { text: 'Validado', cls: 'bg-green-50 text-green-700' },
  reopened: { text: 'Reaberto', cls: 'bg-amber-50 text-amber-700' },
};

const KIND_LABEL: Record<AttachmentKind, string> = {
  pos_pdf: 'Fecho POS (PDF)',
  tpa_receipt: 'Talão TPA',
  cashmatic: 'Talão Cashmatic',
  uber: 'Uber',
  other: 'Outro',
};

const CLOSING_SELECT =
  'id, unit_id, closing_date, status, pos_theoretical_total, declared_total, cashmatic_total, notes, submitted_at, validated_at, reopen_reason, ' +
  'submitter:profiles!cash_closings_submitted_by_fkey(full_name), validator:profiles!cash_closings_validated_by_fkey(full_name)';

// ───────────────────────── utilitários ─────────────────────────

const eur = (n: number | null | undefined) =>
  n == null || isNaN(n) ? '—' : n.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });

const num = (s: string) => {
  const v = Number(String(s).replace(/\s/g, '').replace(',', '.'));
  return isNaN(v) ? 0 : v;
};

const todayLisbon = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());

const newKey = () => Math.random().toString(36).slice(2);

const toLine = (payment_method: string, family: PaymentFamily, theoretical = 0, declared: number | null = null, source: Line['source'] = 'manual'): Line => ({
  key: newKey(),
  payment_method,
  family,
  theoretical: theoretical ? String(theoretical).replace('.', ',') : '0',
  declared: declared == null ? '' : String(declared).replace('.', ','),
  source,
});

const diffClass = (d: number) =>
  Math.abs(d) < 0.005 ? 'text-slate-500' : Math.abs(d) <= TOLERANCE ? 'text-amber-600' : 'text-red-600 font-semibold';

// ───────────────────────── página ─────────────────────────

export default function CashClosing() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'Admin';
  const isManager = isAdmin || profile?.role === 'Chefe';
  // Fecho cego: a equipa indica só o apurado; teórico e diferenças só para Gerente/Admin
  const showTheo = isManager;

  const [params] = useSearchParams();
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitId, setUnitId] = useState<string>('');
  const [date, setDate] = useState<string>(params.get('date') || todayLisbon());

  const [closing, setClosing] = useState<Closing | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [notes, setNotes] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [txs, setTxs] = useState<CashmaticTx[]>([]);
  const [tips, setTips] = useState<Tip[]>([]);
  const [tipForm, setTipForm] = useState<{ amount: string; method: string; invoice: string; file: File | null }>({ amount: '', method: '', invoice: '', file: null });
  const tipFile = useRef<HTMLInputElement>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err' | 'warn'; text: string } | null>(null);
  const [photoKind, setPhotoKind] = useState<AttachmentKind>('tpa_receipt');

  const pdfInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  const editable = !closing || closing.status !== 'validated' || isAdmin;

  // ── unidades ──
  useEffect(() => {
    if (!profile) return;
    (async () => {
      if (isAdmin) {
        const { data } = await supabase.from('units').select('id, name, type').eq('active', true).order('name');
        const list = (data || []).filter((u: Unit) => u.type === 'restaurant' || u.type === 'events') as Unit[];
        setUnits(list);
        const own = list.find((u) => u.id === profile.unit_id);
        const fromLink = list.find((u) => u.id === params.get('unit'));
        setUnitId((prev) => prev || fromLink?.id || own?.id || list[0]?.id || '');
      } else if (profile.unit_id) {
        setUnits([{ id: profile.unit_id, name: profile.units?.name ?? 'A minha unidade', type: '' }]);
        setUnitId(profile.unit_id);
      }
    })();
  }, [profile?.id]);

  useEffect(() => {
    if (unitId && date) loadAll();
  }, [unitId, date]);

  // ── carregar ──
  async function loadAll() {
    setLoading(true);
    setMsg(null);
    try {
      const { data: raw } = await supabase
        .from('cash_closings')
        .select(CLOSING_SELECT)
        .eq('unit_id', unitId)
        .eq('closing_date', date)
        .maybeSingle();
      const c = (raw as unknown as Closing | null) ?? null;

      setClosing(c);
      setNotes(c?.notes ?? '');

      if (c) {
        const [{ data: l }, { data: a }] = await Promise.all([
          supabase.from('cash_closing_lines').select('payment_method, family, theoretical, declared, source').eq('closing_id', c.id).order('created_at'),
          supabase.from('cash_closing_attachments').select('id, kind, storage_path, label, created_at').eq('closing_id', c.id).order('created_at'),
        ]);
        setLines((l || []).map((x: any) => toLine(x.payment_method, x.family, Number(x.theoretical), x.declared == null ? null : Number(x.declared), x.source)));
        await loadAttachmentUrls((a as Attachment[]) || []);
        await loadTips(c.id);
      } else {
        setLines(DEFAULT_METHODS.map(([m, f]) => toLine(m, f)));
        setAttachments([]);
        setTips([]);
      }

      const { data: t } = await supabase
        .from('cashmatic_transactions')
        .select('device_tx_id, started_at, reference, requested_cents, inserted_cents, dispensed_cents, income_cents, end_type, success')
        .eq('unit_id', unitId)
        .eq('business_date', date)
        .eq('operation', 'payment')
        .order('started_at');
      setTxs((t as CashmaticTx[]) || []);

      const { data: h } = await supabase
        .from('cash_closings')
        .select('id, closing_date, status, pos_theoretical_total, declared_total, cashmatic_total')
        .eq('unit_id', unitId)
        .order('closing_date', { ascending: false })
        .limit(30);
      setHistory((h as HistoryRow[]) || []);
      setDirty(false);
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message || 'Erro ao carregar o fecho.' });
    } finally {
      setLoading(false);
    }
  }

  async function loadTips(closingId: string) {
    const { data } = await supabase
      .from('cash_tips')
      .select('id, amount, payment_method, invoice_ref, storage_path, created_at')
      .eq('closing_id', closingId)
      .order('created_at');
    const list = ((data || []) as Tip[]).map((t) => ({ ...t, amount: Number(t.amount) }));
    const paths = list.filter((t) => t.storage_path).map((t) => t.storage_path!) ;
    if (paths.length) {
      const { data: urls } = await supabase.storage.from('cash-closings').createSignedUrls(paths, 3600);
      const byPath = new Map((urls || []).map((u) => [u.path, u.signedUrl]));
      list.forEach((t) => { if (t.storage_path) t.url = byPath.get(t.storage_path) ?? undefined; });
    }
    setTips(list);
  }

  async function loadAttachmentUrls(list: Attachment[]) {
    if (!list.length) { setAttachments([]); return; }
    const { data } = await supabase.storage.from('cash-closings').createSignedUrls(list.map((a) => a.storage_path), 3600);
    setAttachments(list.map((a, i) => ({ ...a, url: data?.[i]?.signedUrl })));
  }

  // ── criar o fecho se ainda não existe ──
  async function ensureClosing(): Promise<Closing> {
    if (closing) return closing;
    const { data, error } = await supabase
      .from('cash_closings')
      .insert({ unit_id: unitId, closing_date: date, created_by: profile?.id, status: 'draft' })
      .select(CLOSING_SELECT)
      .single();
    if (error) {
      // pode já ter sido criado noutro dispositivo
      const { data: existing } = await supabase.from('cash_closings').select(CLOSING_SELECT).eq('unit_id', unitId).eq('closing_date', date).maybeSingle();
      if (existing) { setClosing(existing as unknown as Closing); return existing as unknown as Closing; }
      throw error;
    }
    setClosing(data as unknown as Closing);
    return data as unknown as Closing;
  }

  const cardMethods = useMemo(() => {
    const names = lines.filter((l) => l.family === 'cartoes' && l.payment_method.trim()).map((l) => l.payment_method.trim());
    return names.length ? names : ['Multibanco', 'Visa'];
  }, [lines]);

  // ── cálculos ──
  const summary = useMemo(() => {
    const fam = new Map<PaymentFamily, { theo: number; decl: number }>();
    for (const l of lines) {
      const f = fam.get(l.family) ?? { theo: 0, decl: 0 };
      f.theo += num(l.theoretical);
      f.decl += num(l.declared);
      fam.set(l.family, f);
    }
    const rows = FAMILY_ORDER.filter((f) => fam.has(f)).map((f) => {
      const v = fam.get(f)!;
      return { family: f, theo: round2(v.theo), decl: round2(v.decl), diff: round2(v.decl - v.theo) };
    });
    // Gorjetas em cartão: o POS regista-as como troco em numerário (o TPA fica certo,
    // o teórico do numerário desce), mas o dinheiro continua na caixa / máquina de trocos.
    // Por isso a sobra de dinheiro tem de ser igual às gorjetas registadas.
    const tipsByFamily = new Map<PaymentFamily, number>();
    for (const t of tips) {
      tipsByFamily.set('dinheiro', (tipsByFamily.get('dinheiro') ?? 0) + t.amount);
    }
    for (const r of rows) {
      const tip = round2(tipsByFamily.get(r.family) ?? 0);
      (r as any).tips = tip;
      r.diff = round2(r.decl - r.theo - tip);
    }
    const tipsTotal = round2(tips.reduce((s, t) => s + t.amount, 0));
    const real = rows.filter((r) => r.family !== 'comissoes');
    const theo = round2(real.reduce((s, r) => s + r.theo, 0));
    const decl = round2(real.reduce((s, r) => s + r.decl, 0));
    const cash = rows.find((r) => r.family === 'dinheiro');
    return { rows: rows as Array<typeof rows[number] & { tips: number }>, theo, decl, diff: round2(decl - theo - tipsTotal), cash, tipsTotal };
  }, [lines, tips]);

  const cashmaticTotal = useMemo(() => {
    if (!txs.length) return closing?.cashmatic_total ?? null;
    return round2(txs.filter((t) => t.success !== false && t.end_type === 'normal').reduce((s, t) => s + (t.income_cents ?? 0), 0) / 100);
  }, [txs, closing?.cashmatic_total]);

  const alerts = useMemo(() => {
    const a: string[] = [];
    for (const r of summary.rows) {
      if (r.family === 'comissoes') continue;
      if (Math.abs(r.diff) > TOLERANCE) a.push(`${FAMILY_LABEL[r.family]}: diferença de ${eur(r.diff)}`);
    }
    if (cashmaticTotal != null && summary.cash && Math.abs(cashmaticTotal - summary.cash.decl) > TOLERANCE) {
      a.push(`Dinheiro declarado (${eur(summary.cash.decl)}) não bate com a máquina de trocos (${eur(cashmaticTotal)})`);
    }
    if (cashmaticTotal != null && summary.cash && summary.tipsTotal > 0) {
      const sobra = round2(cashmaticTotal - summary.cash.theo);
      if (Math.abs(sobra - summary.tipsTotal) > TOLERANCE) {
        a.push(`Sobra na máquina de trocos (${eur(sobra)}) não bate com as gorjetas registadas (${eur(summary.tipsTotal)})`);
      }
    }
    return a;
  }, [summary, cashmaticTotal]);

  // ── edição de linhas ──
  const updateLine = (key: string, patch: Partial<Line>) => {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch, ...(patch.payment_method ? { family: familyFor(patch.payment_method) } : {}) } : l)));
    setDirty(true);
  };
  const removeLine = (key: string) => { setLines((ls) => ls.filter((l) => l.key !== key)); setDirty(true); };
  const addLine = () => { setLines((ls) => [...ls, toLine('', 'outro')]); setDirty(true); };

  // ── guardar ──
  async function save(extra: Record<string, unknown> = {}, quiet = false) {
    setBusy('save');
    try {
      const c = await ensureClosing();
      const { error: delErr } = await supabase.from('cash_closing_lines').delete().eq('closing_id', c.id);
      if (delErr) throw delErr;
      const rows = lines
        .filter((l) => l.payment_method.trim())
        .map((l) => ({
          closing_id: c.id,
          payment_method: l.payment_method.trim(),
          family: l.family,
          theoretical: num(l.theoretical),
          declared: l.declared.trim() === '' ? null : num(l.declared),
          source: l.source,
        }));
      if (rows.length) {
        const { error } = await supabase.from('cash_closing_lines').insert(rows);
        if (error) throw error;
      }
      const { data, error } = await supabase
        .from('cash_closings')
        .update({ pos_theoretical_total: summary.theo, declared_total: summary.decl, notes: notes || null, ...extra })
        .eq('id', c.id)
        .select(CLOSING_SELECT)
        .single();
      if (error) throw error;
      setClosing(data as unknown as Closing);
      setDirty(false);
      if (!quiet) setMsg({ type: 'ok', text: 'Fecho guardado.' });
      return data as unknown as Closing;
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message || 'Erro ao guardar.' });
      return null;
    } finally {
      setBusy(null);
    }
  }

  // ── PDF do POS ──
  async function onPdf(file: File) {
    setBusy('pdf');
    setMsg(null);
    try {
      const parsed = await parseFechoPdf(file);
      if (!parsed.lines.length) throw new Error('Não foram encontrados métodos de pagamento no PDF.');
      if (parsed.date && parsed.date !== date) {
        const ok = confirm(`O PDF é do dia ${parsed.date.split('-').reverse().join('/')}, mas está aberto o fecho de ${date.split('-').reverse().join('/')}.\n\nQuer importar mesmo assim para este dia?`);
        if (!ok) return;
      }
      const current = new Map(lines.map((l) => [l.payment_method.toLowerCase(), l]));
      const newLines = parsed.lines.map((l) => {
        const prev = current.get(l.payment_method.toLowerCase());
        const theo = l.theoretical ?? (prev ? num(prev.theoretical) : 0);
        return toLine(l.payment_method, l.family, theo, l.declared, 'pos_pdf');
      });
      setLines(newLines);
      setDirty(true);

      const c = await ensureClosing();
      const path = `${unitId}/${date}/pos-${Date.now()}.pdf`;
      const up = await supabase.storage.from('cash-closings').upload(path, file, { contentType: 'application/pdf' });
      if (up.error) throw up.error;
      await supabase.from('cash_closing_attachments').insert({ closing_id: c.id, kind: 'pos_pdf', storage_path: path, label: file.name, uploaded_by: profile?.id });

      const check = showTheo && parsed.totalTheoretical != null
        ? ` Totais do PDF: teórico ${eur(parsed.totalTheoretical)}, apurado ${eur(parsed.totalDeclared)}.`
        : parsed.totalDeclared != null ? ` Total apurado no PDF: ${eur(parsed.totalDeclared)}.` : '';
      setMsg({ type: 'ok', text: `PDF importado: ${parsed.lines.length} métodos de pagamento.${check} Reveja os valores e carregue em Guardar.` });
      const { data: a } = await supabase.from('cash_closing_attachments').select('id, kind, storage_path, label, created_at').eq('closing_id', c.id).order('created_at');
      await loadAttachmentUrls((a as Attachment[]) || []);
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message || 'Não foi possível ler o PDF.' });
    } finally {
      setBusy(null);
      if (pdfInput.current) pdfInput.current.value = '';
    }
  }

  // ── fotos ──
  async function onPhotos(files: FileList) {
    setBusy('photo');
    try {
      const c = await ensureClosing();
      for (const f of Array.from(files)) {
        const ext = (f.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `${unitId}/${date}/${photoKind}-${Date.now()}-${newKey()}.${ext}`;
        const up = await supabase.storage.from('cash-closings').upload(path, f, { contentType: f.type || 'image/jpeg' });
        if (up.error) throw up.error;
        const { error } = await supabase.from('cash_closing_attachments').insert({ closing_id: c.id, kind: photoKind, storage_path: path, label: f.name, uploaded_by: profile?.id });
        if (error) throw error;
      }
      const { data: a } = await supabase.from('cash_closing_attachments').select('id, kind, storage_path, label, created_at').eq('closing_id', c.id).order('created_at');
      await loadAttachmentUrls((a as Attachment[]) || []);
      setMsg({ type: 'ok', text: files.length === 1 ? 'Foto adicionada.' : `${files.length} fotos adicionadas.` });
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message || 'Erro ao enviar a foto.' });
    } finally {
      setBusy(null);
      if (photoInput.current) photoInput.current.value = '';
    }
  }

  async function addTip() {
    const amount = num(tipForm.amount);
    if (amount <= 0) { setMsg({ type: 'err', text: 'Indique o valor da gorjeta.' }); return; }
    const method = tipForm.method || cardMethods[0] || 'Multibanco';
    setBusy('tip');
    try {
      const c = await ensureClosing();
      let storage_path: string | null = null;
      if (tipForm.file) {
        const ext = (tipForm.file.name.split('.').pop() || 'jpg').toLowerCase();
        storage_path = `${unitId}/${date}/tip-${Date.now()}-${newKey()}.${ext}`;
        const up = await supabase.storage.from('cash-closings').upload(storage_path, tipForm.file, { contentType: tipForm.file.type || 'image/jpeg' });
        if (up.error) throw up.error;
      }
      const { error } = await supabase.from('cash_tips').insert({
        closing_id: c.id, unit_id: unitId, amount, payment_method: method,
        invoice_ref: tipForm.invoice.trim() || null, storage_path, created_by: profile?.id,
      });
      if (error) throw error;
      setTipForm({ amount: '', method, invoice: '', file: null });
      if (tipFile.current) tipFile.current.value = '';
      await loadTips(c.id);
      setMsg({ type: 'ok', text: `Gorjeta de ${eur(amount)} registada.` });
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message || 'Erro ao registar a gorjeta.' });
    } finally {
      setBusy(null);
    }
  }

  async function removeTip(t: Tip) {
    if (!confirm(`Remover a gorjeta de ${eur(t.amount)}?`)) return;
    const { error } = await supabase.from('cash_tips').delete().eq('id', t.id);
    if (error) { setMsg({ type: 'err', text: error.message }); return; }
    if (t.storage_path) await supabase.storage.from('cash-closings').remove([t.storage_path]);
    setTips((l) => l.filter((x) => x.id !== t.id));
  }

  async function removeAttachment(a: Attachment) {
    if (!confirm('Remover este anexo?')) return;
    await supabase.storage.from('cash-closings').remove([a.storage_path]);
    await supabase.from('cash_closing_attachments').delete().eq('id', a.id);
    setAttachments((l) => l.filter((x) => x.id !== a.id));
  }

  // ── Cashmatic ──
  async function syncCashmatic() {
    setBusy('cashmatic');
    setMsg(null);
    try {
      await ensureClosing();
      const { data, error } = await supabase.functions.invoke('cashmatic-sync', { body: { unit_id: unitId, date } });
      if (error) {
        let detail = error.message;
        try { const body = await (error as any).context?.json?.(); if (body?.error) detail = body.error; } catch { /* */ }
        throw new Error(detail);
      }
      if (!data?.ok) throw new Error(data?.error || 'A máquina não respondeu.');
      setTxs((data.transactions || []).filter((t: any) => t.operation === 'payment'));
      setClosing((c) => (c ? { ...c, cashmatic_total: data.total } : c));
      setMsg({ type: 'ok', text: `Máquina de trocos: ${data.count} pagamentos, total ${eur(data.total)}.` });
    } catch (e: any) {
      setMsg({ type: 'err', text: `Não foi possível obter os recebimentos da máquina: ${e.message}` });
    } finally {
      setBusy(null);
    }
  }

  // ── estados ──
  async function submit() {
    if (!summary.rows.length) return;
    if (showTheo && alerts.length && !confirm(`Este fecho tem diferenças:\n\n• ${alerts.join('\n• ')}\n\nSubmeter mesmo assim?`)) return;
    const c = await save({ status: 'submitted', submitted_at: new Date().toISOString(), submitted_by: profile?.id }, true);
    if (c) { setMsg({ type: 'ok', text: 'Fecho submetido para validação.' }); loadAll(); }
  }

  async function validate() {
    const c = await save({ status: 'validated', validated_at: new Date().toISOString(), validated_by: profile?.id }, true);
    if (c) { setMsg({ type: 'ok', text: 'Fecho validado e bloqueado.' }); loadAll(); }
  }

  async function reopen() {
    if (!closing) return;
    const reason = prompt('Motivo da reabertura:');
    if (!reason) return;
    setBusy('reopen');
    const { error } = await supabase
      .from('cash_closings')
      .update({ status: 'reopened', reopen_reason: reason, reopened_at: new Date().toISOString(), reopened_by: profile?.id })
      .eq('id', closing.id);
    setBusy(null);
    if (error) setMsg({ type: 'err', text: error.message });
    else { setMsg({ type: 'ok', text: 'Fecho reaberto.' }); loadAll(); }
  }

  // ───────────────────────── interface ─────────────────────────

  const st = closing ? STATUS_LABEL[closing.status] : STATUS_LABEL.draft;
  const inputCls = 'w-full px-2 py-1.5 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-500';

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Wallet className="w-7 h-7" /> Fecho de Caixa
          </h1>
          <p className="text-slate-600 mt-1 text-sm">Fecho Z do POS, TPAs, máquina de trocos e plataformas.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {units.length > 1 && (
            <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
          <input type="date" value={date} max={todayLisbon()} onChange={(e) => e.target.value && setDate(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
        </div>
      </div>

      {!unitId && !loading && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800 text-sm">
          O seu utilizador não está associado a nenhuma unidade com faturação.
        </div>
      )}

      {msg && (
        <div className={`p-3 rounded-lg flex items-start gap-2 text-sm ${msg.type === 'ok' ? 'bg-green-50 text-green-800 border border-green-200' : msg.type === 'warn' ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {msg.type === 'ok' ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : unitId && (
        <>
          {/* Estado */}
          <div className="flex flex-wrap items-center gap-3">
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${st.cls}`}>{st.text}</span>
            {closing?.status === 'validated' && <span className="text-xs text-slate-500 flex items-center gap-1"><Lock className="w-3 h-3" /> Bloqueado{isAdmin ? ' (Admin pode editar)' : ''}</span>}
            {closing?.status === 'reopened' && closing.reopen_reason && <span className="text-xs text-amber-700">Motivo: {closing.reopen_reason}</span>}
            {closing?.submitted_at && (
              <span className="text-xs text-slate-500">
                Fechado por {closing.submitter?.full_name ?? '—'} · {new Date(closing.submitted_at).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', dateStyle: 'short', timeStyle: 'short' })}
              </span>
            )}
            {closing?.status === 'validated' && closing.validated_at && (
              <span className="text-xs text-green-700">
                Validado por {closing.validator?.full_name ?? '—'} · {new Date(closing.validated_at).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', dateStyle: 'short', timeStyle: 'short' })}
              </span>
            )}
            {dirty && <span className="text-xs text-amber-600">Alterações por guardar</span>}
          </div>

          {!showTheo && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              Fecho cego: indique os valores que contou e os totais dos TPAs. O gerente compara-os depois com o faturado e valida o fecho.
            </div>
          )}
          {showTheo && closing?.status === 'submitted' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              Este fecho aguarda validação. Confirme os valores, as fotos e as diferenças antes de validar.
            </div>
          )}

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Coluna principal */}
            <div className="lg:col-span-2 space-y-6">
              {/* 1. PDF */}
              <section className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="font-semibold text-slate-900">1. Fecho do POS</h2>
                    <p className="text-sm text-slate-500">Carregue o PDF "Fecho cego" para preencher os valores automaticamente.</p>
                  </div>
                  <input ref={pdfInput} type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && onPdf(e.target.files[0])} />
                  <button disabled={!editable || busy !== null} onClick={() => pdfInput.current?.click()} className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                    <FileUp className="w-4 h-4" /> {busy === 'pdf' ? 'A ler…' : 'Carregar PDF'}
                  </button>
                </div>
              </section>

              {/* 2. Linhas */}
              <section className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
                <h2 className="font-semibold text-slate-900 mb-1">2. Métodos de pagamento</h2>
                <p className="text-sm text-slate-500 mb-4">
                  {showTheo
                    ? 'Teórico = faturado no POS. Apurado = o que a equipa contou ou leu nos TPAs.'
                    : 'Indique o valor apurado de cada método: o total de cada TPA, o dinheiro e as plataformas (Uber…).'}
                </p>
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <table className={`w-full text-sm ${showTheo ? 'min-w-[560px]' : 'min-w-[380px]'}`}>
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-200">
                        <th className="py-2 px-2 font-medium">Método</th>
                        <th className="py-2 px-2 font-medium">Família</th>
                        {showTheo && <th className="py-2 px-2 font-medium text-right">Teórico</th>}
                        <th className="py-2 px-2 font-medium text-right">Apurado</th>
                        {showTheo && <th className="py-2 px-2 font-medium text-right">Diferença</th>}
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => {
                        const d = round2(num(l.declared) - num(l.theoretical));
                        return (
                          <tr key={l.key} className="border-b border-slate-100">
                            <td className="py-1.5 px-2"><input className={inputCls} value={l.payment_method} disabled={!editable} onChange={(e) => updateLine(l.key, { payment_method: e.target.value })} placeholder="Ex.: Glovo" /></td>
                            <td className="py-1.5 px-2">
                              <select className={inputCls} value={l.family} disabled={!editable} onChange={(e) => updateLine(l.key, { family: e.target.value as PaymentFamily })}>
                                {FAMILY_ORDER.map((f) => <option key={f} value={f}>{FAMILY_LABEL[f]}</option>)}
                              </select>
                            </td>
                            {showTheo && <td className="py-1.5 px-2 w-28"><input inputMode="decimal" className={`${inputCls} text-right`} value={l.theoretical} disabled={!editable} onChange={(e) => updateLine(l.key, { theoretical: e.target.value })} /></td>}
                            <td className="py-1.5 px-2 w-28"><input inputMode="decimal" className={`${inputCls} text-right`} value={l.declared} disabled={!editable} onChange={(e) => updateLine(l.key, { declared: e.target.value })} placeholder="0,00" /></td>
                            {showTheo && <td className={`py-1.5 px-2 text-right tabular-nums ${diffClass(d)}`}>{eur(d)}</td>}
                            <td className="py-1.5 px-1">
                              {editable && <button onClick={() => removeLine(l.key)} className="p-1 text-slate-400 hover:text-red-600" title="Remover"><Trash2 className="w-4 h-4" /></button>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {editable && (
                  <button onClick={addLine} className="mt-3 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700">
                    <Plus className="w-4 h-4" /> Adicionar método
                  </button>
                )}
              </section>

              {/* 3. Gorjetas em cartão */}
              <section className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
                <h2 className="font-semibold text-slate-900 flex items-center gap-2"><HandCoins className="w-4 h-4" /> 3. Gorjetas em cartão</h2>
                <p className="text-sm text-slate-500 mb-3">
                  Quando o cliente deixa gorjeta no Multibanco, o POS dá-a como troco. Registe aqui cada gorjeta com a foto do talão do TPA e da fatura. O total das gorjetas tem de bater com o dinheiro que sobra na caixa.
                </p>
                {editable && (
                  <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end mb-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-slate-500 mb-1">Valor (€)</label>
                      <input inputMode="decimal" value={tipForm.amount} onChange={(e) => setTipForm({ ...tipForm, amount: e.target.value })} className={`${inputCls} text-right`} placeholder="4,00" />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-xs text-slate-500 mb-1">TPA / método</label>
                      <select value={tipForm.method || cardMethods[0]} onChange={(e) => setTipForm({ ...tipForm, method: e.target.value })} className={inputCls}>
                        {cardMethods.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-xs text-slate-500 mb-1">Nº fatura (opcional)</label>
                      <input value={tipForm.invoice} onChange={(e) => setTipForm({ ...tipForm, invoice: e.target.value })} className={inputCls} placeholder="FR 2026/123" />
                    </div>
                    <div className="sm:col-span-2">
                      <input ref={tipFile} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setTipForm({ ...tipForm, file: e.target.files?.[0] ?? null })} />
                      <button type="button" onClick={() => tipFile.current?.click()} className={`w-full inline-flex justify-center items-center gap-1 px-2 py-1.5 border rounded-md text-sm ${tipForm.file ? 'border-green-400 text-green-700 bg-green-50' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                        <Camera className="w-4 h-4" /> {tipForm.file ? 'Foto ✓' : 'Foto'}
                      </button>
                    </div>
                    <div className="col-span-2 sm:col-span-2">
                      <button onClick={addTip} disabled={busy !== null} className="w-full inline-flex justify-center items-center gap-1 px-2 py-1.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                        <Plus className="w-4 h-4" /> {busy === 'tip' ? '…' : 'Adicionar'}
                      </button>
                    </div>
                  </div>
                )}
                {tips.length ? (
                  <table className="w-full text-sm">
                    <tbody>
                      {tips.map((t) => (
                        <tr key={t.id} className="border-b border-slate-100">
                          <td className="py-1.5 px-1 tabular-nums font-medium">{eur(t.amount)}</td>
                          <td className="py-1.5 px-1 text-slate-600">{t.payment_method}</td>
                          <td className="py-1.5 px-1 text-slate-500">{t.invoice_ref || '—'}</td>
                          <td className="py-1.5 px-1">
                            {t.url ? <a href={t.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-xs">ver foto</a> : <span className="text-xs text-amber-600">sem foto</span>}
                          </td>
                          <td className="py-1.5 px-1 text-right">
                            {editable && <button onClick={() => removeTip(t)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
                          </td>
                        </tr>
                      ))}
                      <tr className="font-semibold">
                        <td className="pt-2 px-1 tabular-nums">{eur(summary.tipsTotal)}</td>
                        <td colSpan={4} className="pt-2 px-1 text-slate-500 font-normal text-xs">total de gorjetas neste fecho</td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-slate-400">Sem gorjetas em cartão registadas.</p>
                )}
              </section>

              {/* 4. Cashmatic */}
              <section className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                  <div>
                    <h2 className="font-semibold text-slate-900">4. Máquina de trocos</h2>
                    <p className="text-sm text-slate-500">Pagamentos registados pela Cashmatic neste dia.</p>
                  </div>
                  <button disabled={busy !== null} onClick={syncCashmatic} className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                    <RefreshCw className={`w-4 h-4 ${busy === 'cashmatic' ? 'animate-spin' : ''}`} /> {busy === 'cashmatic' ? 'A consultar…' : 'Ver recebimentos da máquina de trocos'}
                  </button>
                </div>
                {cashmaticTotal != null ? (
                  <>
                    <div className={`grid gap-3 mb-4 ${showTheo ? 'grid-cols-3' : 'grid-cols-2'}`}>
                      <Stat label="Máquina de trocos" value={eur(cashmaticTotal)} />
                      <Stat label="Dinheiro apurado" value={eur(summary.cash?.decl ?? 0)} />
                      {showTheo && <Stat label="Diferença" value={eur(round2((summary.cash?.decl ?? 0) - cashmaticTotal))} cls={diffClass(round2((summary.cash?.decl ?? 0) - cashmaticTotal))} />}
                    </div>
                    {txs.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-slate-500 border-b border-slate-200">
                              <th className="py-1.5 px-2 font-medium">Hora</th>
                              <th className="py-1.5 px-2 font-medium">Documento</th>
                              <th className="py-1.5 px-2 font-medium text-right">Valor</th>
                              <th className="py-1.5 px-2 font-medium text-right">Inserido</th>
                              <th className="py-1.5 px-2 font-medium text-right">Troco</th>
                            </tr>
                          </thead>
                          <tbody>
                            {txs.map((t) => (
                              <tr key={t.device_tx_id} className={`border-b border-slate-100 ${t.end_type !== 'normal' ? 'text-slate-400 line-through' : ''}`}>
                                <td className="py-1.5 px-2">{t.started_at ? new Date(t.started_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' }) : '—'}</td>
                                <td className="py-1.5 px-2 text-slate-600">{t.reference || '—'}</td>
                                <td className="py-1.5 px-2 text-right tabular-nums">{eur((t.requested_cents ?? 0) / 100)}</td>
                                <td className="py-1.5 px-2 text-right tabular-nums text-slate-500">{eur((t.inserted_cents ?? 0) / 100)}</td>
                                <td className="py-1.5 px-2 text-right tabular-nums text-slate-500">{eur((t.dispensed_cents ?? 0) / 100)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-400 flex items-center gap-2"><Banknote className="w-4 h-4" /> Ainda sem dados da máquina para este dia.</p>
                )}
              </section>

              {/* 4. Fotos */}
              <section className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                  <div>
                    <h2 className="font-semibold text-slate-900">5. Talões e fotos</h2>
                    <p className="text-sm text-slate-500">Fotografe os fechos dos TPAs e outros talões para conferência.</p>
                  </div>
                  <div className="flex gap-2">
                    <select value={photoKind} onChange={(e) => setPhotoKind(e.target.value as AttachmentKind)} className="px-2 py-2 border border-slate-300 rounded-lg text-sm">
                      {(['tpa_receipt', 'cashmatic', 'uber', 'other'] as AttachmentKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                    </select>
                    <input ref={photoInput} type="file" accept="image/*,application/pdf" capture="environment" multiple className="hidden" onChange={(e) => e.target.files?.length && onPhotos(e.target.files)} />
                    <button disabled={!editable || busy !== null} onClick={() => photoInput.current?.click()} className="inline-flex items-center gap-2 px-3 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-900 disabled:opacity-50">
                      <Camera className="w-4 h-4" /> {busy === 'photo' ? 'A enviar…' : 'Tirar / anexar foto'}
                    </button>
                  </div>
                </div>
                {attachments.length ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {attachments.map((a) => {
                      const isPdf = a.storage_path.endsWith('.pdf');
                      return (
                        <div key={a.id} className="group relative border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                          <a href={a.url} target="_blank" rel="noreferrer" className="block aspect-[4/3] flex items-center justify-center">
                            {isPdf || !a.url ? <FileText className="w-10 h-10 text-slate-400" /> : <img src={a.url} alt={a.label ?? ''} className="w-full h-full object-cover" />}
                          </a>
                          <div className="px-2 py-1.5 text-xs text-slate-600 flex items-center justify-between gap-1">
                            <span className="truncate">{KIND_LABEL[a.kind]}</span>
                            {editable && <button onClick={() => removeAttachment(a)} className="text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Sem anexos.</p>
                )}
              </section>
            </div>

            {/* Coluna lateral: resumo e ações */}
            <div className="space-y-6">
              <section className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 lg:sticky lg:top-4">
                <h2 className="font-semibold text-slate-900 mb-3">Resumo</h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-500 text-xs">
                      <th className="text-left font-medium pb-2">Família</th>
                      {showTheo && <th className="text-right font-medium pb-2">Teórico</th>}
                      <th className="text-right font-medium pb-2">Apurado</th>
                      {showTheo && <th className="text-right font-medium pb-2">Dif.</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.rows.map((r) => (
                      <tr key={r.family} className={r.family === 'comissoes' ? 'text-slate-400' : ''}>
                        <td className="py-1">{FAMILY_LABEL[r.family]}</td>
                        {showTheo && <td className="py-1 text-right tabular-nums">{eur(r.theo)}</td>}
                        <td className="py-1 text-right tabular-nums">{eur(r.decl)}</td>
                        {showTheo && <td className={`py-1 text-right tabular-nums ${r.family === 'comissoes' ? '' : diffClass(r.diff)}`}>{eur(r.diff)}</td>}
                      </tr>
                    ))}
                    <tr className="border-t border-slate-200 font-semibold">
                      <td className="pt-2">Total</td>
                      {showTheo && <td className="pt-2 text-right tabular-nums">{eur(summary.theo)}</td>}
                      <td className="pt-2 text-right tabular-nums">{eur(summary.decl)}</td>
                      {showTheo && <td className={`pt-2 text-right tabular-nums ${diffClass(summary.diff)}`}>{eur(summary.diff)}</td>}
                    </tr>
                  </tbody>
                </table>
                {summary.tipsTotal > 0 && (
                  <p className="text-xs text-emerald-700 mt-2">
                    {eur(summary.tipsTotal)} de gorjetas em cartão{showTheo ? ' — o dinheiro a mais na caixa deve ser igual a este valor (já descontado da diferença do dinheiro)' : ''}.
                  </p>
                )}
                {showTheo && <p className="text-xs text-slate-400 mt-1">O total não inclui as comissões dos TPAs.</p>}

                {showTheo && alerts.length > 0 && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 space-y-1">
                    <p className="font-medium flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> A verificar</p>
                    {alerts.map((a) => <p key={a}>• {a}</p>)}
                  </div>
                )}

                <label className="block text-sm font-medium text-slate-700 mt-4 mb-1">Observações</label>
                <textarea value={notes} disabled={!editable} onChange={(e) => { setNotes(e.target.value); setDirty(true); }} rows={3} className={inputCls} placeholder="Ex.: pagamento em dinheiro registado como Numerário por engano…" />

                <div className="mt-4 space-y-2">
                  {editable && (
                    <button onClick={() => save()} disabled={busy !== null} className="w-full inline-flex justify-center items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
                      <Save className="w-4 h-4" /> {busy === 'save' ? 'A guardar…' : 'Guardar'}
                    </button>
                  )}
                  {(!closing || closing.status === 'draft' || closing.status === 'reopened') && (
                    <button onClick={submit} disabled={busy !== null} className="w-full inline-flex justify-center items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                      <Send className="w-4 h-4" /> Submeter fecho
                    </button>
                  )}
                  {isManager && closing && closing.status !== 'validated' && (
                    <button onClick={validate} disabled={busy !== null} className="w-full inline-flex justify-center items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                      <CheckCircle2 className="w-4 h-4" /> Validar e bloquear
                    </button>
                  )}
                  {isManager && closing?.status === 'validated' && (
                    <button onClick={reopen} disabled={busy !== null} className="w-full inline-flex justify-center items-center gap-2 px-3 py-2 border border-amber-300 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-50 disabled:opacity-50">
                      <RotateCcw className="w-4 h-4" /> Reabrir fecho
                    </button>
                  )}
                </div>
              </section>

              {/* Histórico */}
              <section className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
                <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2"><History className="w-4 h-4" /> Últimos fechos</h2>
                {history.length ? (
                  <ul className="divide-y divide-slate-100 text-sm">
                    {history.map((h) => {
                      const d = h.declared_total != null && h.pos_theoretical_total != null ? round2(h.declared_total - h.pos_theoretical_total) : null;
                      return (
                        <li key={h.id}>
                          <button onClick={() => setDate(h.closing_date)} className={`w-full flex items-center justify-between gap-2 py-2 text-left hover:bg-slate-50 px-1 rounded ${h.closing_date === date ? 'bg-blue-50' : ''}`}>
                            <span>{h.closing_date.split('-').reverse().join('/')}</span>
                            <span className="flex items-center gap-2">
                              {showTheo && d != null && <span className={`tabular-nums text-xs ${diffClass(d)}`}>{eur(d)}</span>}
                              <span className={`px-2 py-0.5 rounded-full text-[11px] ${STATUS_LABEL[h.status].cls}`}>{STATUS_LABEL[h.status].text}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-400">Ainda não há fechos registados.</p>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, cls = '' }: { label: string; value: string; cls?: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${cls}`}>{value}</p>
    </div>
  );
}
