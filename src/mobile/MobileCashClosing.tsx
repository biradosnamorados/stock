// Fecho de caixa na app: um passo por ecrã (POS → TPA → Dinheiro → Gorjetas → Enviar).
// Usa as mesmas tabelas e funções do ecrã completo; o teórico nunca é mostrado a quem não gere a caixa.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Mail, FileUp, Camera, CheckCircle2, AlertCircle, RefreshCw, Plus, Trash2, Lock, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { parseFechoPdf, familyFor, round2, type PaymentFamily, type ParsedFecho } from '../lib/cash/fechoParser';
import { businessDateLisbon } from '../lib/native';
import { compressImage } from '../lib/images';
import CashClosing from '../pages/CashClosing';

interface Line { payment_method: string; family: PaymentFamily; theoretical: number; declared: string; source: string }
interface Photo { id: string; storage_path: string; label: string | null; url?: string }
interface Tip { id: string; amount: number; payment_method: string; invoice_ref: string | null }
interface Closing { id: string; status: string; cashmatic_total: number | null; notes: string | null }

const STEPS = ['POS', 'TPA', 'Dinheiro', 'Gorjetas', 'Enviar'] as const;
const DEFAULTS: [string, PaymentFamily][] = [['Numerário', 'dinheiro'], ['Multibanco', 'cartoes'], ['Visa', 'cartoes'], ['Uber', 'plataformas']];
const eur = (n: number | null | undefined) => (n == null || isNaN(n) ? '—' : n.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' }));
const num = (s: string) => { const v = Number(String(s).replace(/\s/g, '').replace(',', '.')); return isNaN(v) ? 0 : v; };
const fmtDay = (d: string) => d.split('-').reverse().slice(0, 2).join('/');
const rid = () => Math.random().toString(36).slice(2);
const card = 'bg-white rounded-xl shadow-[0_1px_2px_rgba(1,89,57,0.06),0_4px_12px_rgba(1,89,57,0.08)]';

function MoneyInput({ id, value, onChange, strong }: { id: string; value: string; onChange: (v: string) => void; strong?: boolean }) {
  return (
    <div className={`flex items-center h-12 rounded-[10px] px-3 bg-white border-2 ${strong ? 'border-[#015939]' : 'border-[#CFC9BC]'}`}>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.,-]/g, ''))} inputMode="decimal" placeholder="0,00"
        className="flex-1 min-w-0 bg-transparent outline-none text-xl font-extrabold text-[#1F2420]" />
      <span className="text-lg font-bold text-[#5B635E]">€</span>
    </div>
  );
}

export default function MobileCashClosing() {
  const [params] = useSearchParams();
  if (params.get('full') === '1') return <CashClosing />;
  return <Wizard />;
}

function Wizard() {
  const { profile, hasPermission } = useAuth();
  const [params] = useSearchParams();
  const isManager = profile?.role === 'Admin' || hasPermission('cash_closing_manage');
  const unitId = params.get('unit') || profile?.unit_id || '';
  const date = params.get('date') || businessDateLisbon();

  const [step, setStep] = useState(0);
  const [closing, setClosing] = useState<Closing | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [tips, setTips] = useState<Tip[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [imported, setImported] = useState(false);
  const [tipForm, setTipForm] = useState({ amount: '', method: '', invoice: '' });
  const pdfInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [photoFor, setPhotoFor] = useState('');

  const locked = closing?.status === 'submitted' || closing?.status === 'validated';

  // ── carregar ──
  async function load() {
    if (!unitId) return;
    const { data: c } = await supabase.from('cash_closings').select('id, status, cashmatic_total, notes').eq('unit_id', unitId).eq('closing_date', date).maybeSingle();
    setClosing((c as Closing) ?? null);
    setNotes(c?.notes ?? '');
    if (c) {
      const [{ data: l }, { data: a }, { data: t }] = await Promise.all([
        supabase.from('cash_closing_lines').select('payment_method, family, theoretical, declared, source').eq('closing_id', c.id).order('created_at'),
        supabase.from('cash_closing_attachments').select('id, kind, storage_path, label').eq('closing_id', c.id).order('created_at'),
        supabase.from('cash_tips').select('id, amount, payment_method, invoice_ref').eq('closing_id', c.id).order('created_at'),
      ]);
      const ls = (l ?? []).map((x: any) => ({ payment_method: x.payment_method, family: x.family, theoretical: Number(x.theoretical) || 0, declared: x.declared == null ? '' : String(x.declared).replace('.', ','), source: x.source }));
      setLines(ls.length ? ls : DEFAULTS.map(([m, f]) => ({ payment_method: m, family: f, theoretical: 0, declared: '', source: 'manual' })));
      setImported((a ?? []).some((x: any) => x.kind === 'pos_pdf'));
      const tpa = (a ?? []).filter((x: any) => x.kind === 'tpa_receipt') as Photo[];
      if (tpa.length) {
        const { data: urls } = await supabase.storage.from('cash-closings').createSignedUrls(tpa.map((p) => p.storage_path), 3600);
        tpa.forEach((p, i) => { p.url = urls?.[i]?.signedUrl ?? undefined; });
      }
      setPhotos(tpa);
      setTips(((t ?? []) as any[]).map((x) => ({ ...x, amount: Number(x.amount) })));
      // retomar no primeiro passo por fazer
      const hasDecl = ls.some((x) => x.declared !== '');
      setStep(c.status === 'submitted' || c.status === 'validated' ? 4 : !hasDecl ? 0 : !tpa.length ? 1 : c.cashmatic_total == null ? 2 : 3);
    } else {
      setLines(DEFAULTS.map(([m, f]) => ({ payment_method: m, family: f, theoretical: 0, declared: '', source: 'manual' })));
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [unitId, date]);

  async function ensureClosing(): Promise<Closing> {
    if (closing) return closing;
    const { data, error } = await supabase.from('cash_closings').insert({ unit_id: unitId, closing_date: date, created_by: profile?.id, status: 'draft' })
      .select('id, status, cashmatic_total, notes').single();
    if (error) {
      const { data: ex } = await supabase.from('cash_closings').select('id, status, cashmatic_total, notes').eq('unit_id', unitId).eq('closing_date', date).maybeSingle();
      if (ex) { setClosing(ex as Closing); return ex as Closing; }
      throw error;
    }
    setClosing(data as Closing);
    return data as Closing;
  }

  const totals = useMemo(() => {
    const real = lines.filter((l) => l.family !== 'comissoes');
    return {
      theo: round2(real.reduce((s, l) => s + (l.theoretical || 0), 0)),
      decl: round2(real.reduce((s, l) => s + num(l.declared), 0)),
      byFam: (f: PaymentFamily) => lines.filter((l) => l.family === f),
      tips: round2(tips.reduce((s, t) => s + t.amount, 0)),
    };
  }, [lines, tips]);

  async function saveLines(extra: Record<string, unknown> = {}) {
    const c = await ensureClosing();
    const { error: delErr } = await supabase.from('cash_closing_lines').delete().eq('closing_id', c.id);
    if (delErr) throw delErr;
    const rows = lines.filter((l) => l.payment_method.trim()).map((l) => ({
      closing_id: c.id, payment_method: l.payment_method.trim(), family: l.family, theoretical: l.theoretical || 0,
      declared: l.declared.trim() === '' ? null : num(l.declared), source: l.source,
    }));
    if (rows.length) { const { error } = await supabase.from('cash_closing_lines').insert(rows); if (error) throw error; }
    const { data, error } = await supabase.from('cash_closings')
      .update({ pos_theoretical_total: totals.theo, declared_total: totals.decl, notes: notes || null, ...extra })
      .eq('id', c.id).select('id, status, cashmatic_total, notes').single();
    if (error) throw error;
    setClosing(data as Closing);
  }

  async function next() {
    setBusy('next'); setMsg(null);
    try { await saveLines(); setStep((s) => Math.min(s + 1, 4)); window.scrollTo(0, 0); }
    catch (e: any) { setMsg({ ok: false, text: e.message || 'Erro ao guardar.' }); }
    finally { setBusy(null); }
  }

  // ── passo 1: POS ──
  async function applyPdf(file: File, parsed?: ParsedFecho) {
    const p = parsed ?? await parseFechoPdf(file);
    if (!p.lines.length) throw new Error('O PDF não tem métodos de pagamento.');
    if (p.date && p.date !== date) throw new Error(`Este PDF é do dia ${fmtDay(p.date)}, mas o fecho aberto é de ${fmtDay(date)}.`);
    const prev = new Map(lines.map((l) => [l.payment_method.toLowerCase(), l]));
    setLines(p.lines.map((l) => ({
      payment_method: l.payment_method, family: l.family,
      theoretical: l.theoretical ?? prev.get(l.payment_method.toLowerCase())?.theoretical ?? 0,
      declared: String(l.declared).replace('.', ','), source: 'pos_pdf',
    })));
    const c = await ensureClosing();
    const path = `${unitId}/${date}/pos-${Date.now()}.pdf`;
    const up = await supabase.storage.from('cash-closings').upload(path, file, { contentType: 'application/pdf' });
    if (up.error) throw up.error;
    await supabase.from('cash_closing_attachments').insert({ closing_id: c.id, kind: 'pos_pdf', storage_path: path, label: file.name, uploaded_by: profile?.id });
    setImported(true);
    setMsg({ ok: true, text: `Fecho do POS importado: ${p.lines.length} métodos de pagamento.` });
  }

  async function fromEmail() {
    setBusy('email'); setMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke('pos-fecho-fetch', { body: { unit_id: unitId, date } });
      let err = data?.error as string | undefined;
      if (error && !err) { try { err = (await (error as any).context?.json?.())?.error; } catch { /* */ } err = err ?? error.message; }
      if (err) throw new Error(err);
      const files: { name: string; base64: string }[] = data?.files ?? [];
      if (!files.length) throw new Error(data?.message ?? 'Ainda não chegou o fecho do POS. Tente daqui a 1 minuto.');
      for (const f of files) {
        const bin = atob(f.base64); const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const file = new File([bytes], f.name || 'fecho-pos.pdf', { type: 'application/pdf' });
        try { const p = await parseFechoPdf(file); if (p.date === date && p.lines.length) { await applyPdf(file, p); return; } } catch { /* outro PDF */ }
      }
      throw new Error('Chegaram emails, mas nenhum é o fecho deste dia.');
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(null); }
  }

  async function fromFile(f: File) {
    setBusy('pdf'); setMsg(null);
    try { await applyPdf(f); } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(null); if (pdfInput.current) pdfInput.current.value = ''; }
  }

  // ── passo 2: fotos dos talões ──
  async function addPhoto(files: FileList | null) {
    if (!files?.length) return;
    setBusy('photo'); setMsg(null);
    try {
      const c = await ensureClosing();
      for (const raw of Array.from(files)) {
        const f = raw.type.startsWith('image/') ? await compressImage(raw, 1600, 0.8) : raw;
        const path = `${unitId}/${date}/tpa_receipt-${Date.now()}-${rid()}.jpg`;
        const up = await supabase.storage.from('cash-closings').upload(path, f, { contentType: f.type || 'image/jpeg' });
        if (up.error) throw up.error;
        const { data, error } = await supabase.from('cash_closing_attachments')
          .insert({ closing_id: c.id, kind: 'tpa_receipt', storage_path: path, label: photoFor || f.name, uploaded_by: profile?.id }).select('id, storage_path, label').single();
        if (error) throw error;
        setPhotos((ps) => [...ps, { ...(data as Photo), url: URL.createObjectURL(f) }]);
      }
    } catch (e: any) { setMsg({ ok: false, text: e.message || 'Erro ao enviar a foto.' }); }
    finally { setBusy(null); if (photoInput.current) photoInput.current.value = ''; }
  }

  // ── passo 3: máquina de trocos ──
  async function syncMachine() {
    setBusy('cm'); setMsg(null);
    try {
      await ensureClosing();
      const { data, error } = await supabase.functions.invoke('cashmatic-sync', { body: { unit_id: unitId, date } });
      if (error) { let d = error.message; try { const b = await (error as any).context?.json?.(); if (b?.error) d = b.error; } catch { /* */ } throw new Error(d); }
      if (!data?.ok) throw new Error(data?.error || 'A máquina não respondeu.');
      setClosing((c) => (c ? { ...c, cashmatic_total: data.total } : c));
      setMsg({ ok: true, text: `Máquina de trocos: ${data.count} pagamentos.` });
    } catch (e: any) { setMsg({ ok: false, text: `Não foi possível ler a máquina: ${e.message}` }); }
    finally { setBusy(null); }
  }

  // ── passo 4: gorjetas ──
  const cardMethods = lines.filter((l) => l.family === 'cartoes').map((l) => l.payment_method);
  async function addTip() {
    const amount = num(tipForm.amount);
    if (amount <= 0) return setMsg({ ok: false, text: 'Indique o valor da gorjeta.' });
    setBusy('tip'); setMsg(null);
    try {
      const c = await ensureClosing();
      const { data, error } = await supabase.from('cash_tips').insert({
        closing_id: c.id, unit_id: unitId, amount, payment_method: tipForm.method || cardMethods[0] || 'Multibanco',
        invoice_ref: tipForm.invoice.trim() || null, created_by: profile?.id,
      }).select('id, amount, payment_method, invoice_ref').single();
      if (error) throw error;
      setTips((ts) => [...ts, { ...(data as any), amount: Number((data as any).amount) }]);
      setTipForm({ amount: '', method: tipForm.method, invoice: '' });
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(null); }
  }
  async function removeTip(t: Tip) {
    const { error } = await supabase.from('cash_tips').delete().eq('id', t.id);
    if (!error) setTips((ts) => ts.filter((x) => x.id !== t.id));
  }

  // ── passo 5: enviar ──
  async function submit() {
    setBusy('submit'); setMsg(null);
    try {
      await saveLines({ status: 'submitted', submitted_at: new Date().toISOString(), submitted_by: profile?.id });
      setMsg({ ok: true, text: 'Fecho enviado. A gerência vai validar.' });
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(null); }
  }

  const setDecl = (method: string, v: string) => setLines((ls) => ls.map((l) => (l.payment_method === method ? { ...l, declared: v } : l)));
  const addMethod = (family: PaymentFamily) => {
    const name = prompt(family === 'cartoes' ? 'Nome do terminal / cartão (ex.: Amex)' : 'Nome do método (ex.: Glovo)');
    if (name?.trim()) setLines((ls) => [...ls, { payment_method: name.trim(), family: familyFor(name) === 'outro' ? family : familyFor(name), theoretical: 0, declared: '', source: 'manual' }]);
  };

  if (!unitId) return <div className="p-6 text-[#5B635E]">O seu utilizador não está associado a uma unidade com caixa.</div>;

  const cashLines = totals.byFam('dinheiro');
  const cashDecl = round2(cashLines.reduce((s, l) => s + num(l.declared), 0));
  const cashTheo = round2(cashLines.reduce((s, l) => s + (l.theoretical || 0), 0));
  const machine = closing?.cashmatic_total ?? null;

  return (
    <div className="flex flex-col min-h-[calc(100vh-140px)] text-[#1F2420]">
      <header className="px-4 pt-2 pb-3 flex flex-col gap-3">
        <div className="px-1">
          <p className="text-lg font-extrabold">Fecho de caixa</p>
          <p className="text-[13px] text-[#5B635E]">Dia de trabalho {fmtDay(date)}{profile?.units?.name ? ` · ${profile.units.name}` : ''}</p>
        </div>
        <ol aria-label="Passos do fecho" className="grid grid-cols-5 gap-1.5 px-1">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button onClick={() => !locked && setStep(i)} className="w-full flex flex-col gap-1.5 text-left" aria-current={i === step ? 'step' : undefined}>
                <span className={`h-1.5 rounded ${i <= step || locked ? 'bg-[#015939]' : 'bg-[#D9D4C8]'}`} />
                <span className={`text-[11px] ${i === step ? 'font-extrabold text-[#1F2420]' : i < step ? 'font-bold text-[#015939]' : 'font-bold text-[#5B635E]'}`}>{s}</span>
              </button>
            </li>
          ))}
        </ol>
      </header>

      <main className="flex-1 px-5 flex flex-col gap-4 pb-4">
        {msg && (
          <div className={`p-3 rounded-xl text-sm flex gap-2 ${msg.ok ? 'bg-[#E3F1EA] text-[#015939]' : 'bg-red-50 text-red-800'}`}>
            {msg.ok ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}<span className="font-bold">{msg.text}</span>
          </div>
        )}

        {locked && (
          <div className={`${card} p-4 flex items-center gap-3`}>
            <Lock className="w-6 h-6 text-[#015939]" />
            <div><p className="font-extrabold">Fecho enviado</p><p className="text-[13px] text-[#5B635E]">{closing?.status === 'validated' ? 'Já foi validado pela gerência.' : 'À espera de validação da gerência.'}</p></div>
          </div>
        )}

        {step === 0 && (
          <>
            <div><h1 className="text-2xl font-extrabold leading-tight">Fecho do POS</h1>
              <p className="text-[15px] text-[#5B635E] mt-1">Vai buscar o fecho que o POS enviou por email e preenche os valores sozinho.</p></div>
            <button disabled={locked || !!busy} onClick={fromEmail} className="h-14 rounded-2xl bg-[#015939] text-white text-[17px] font-extrabold flex items-center justify-center gap-2 disabled:opacity-50">
              <Mail className="w-5 h-5" /> {busy === 'email' ? 'A procurar no email…' : imported ? 'Ir buscar outra vez' : 'Ir buscar ao email'}
            </button>
            <input ref={pdfInput} type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && fromFile(e.target.files[0])} />
            <button disabled={locked || !!busy} onClick={() => pdfInput.current?.click()} className="h-12 rounded-2xl border-2 border-[#CFC9BC] bg-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
              <FileUp className="w-5 h-5" /> {busy === 'pdf' ? 'A ler…' : 'Ou escolher o PDF'}
            </button>
            {imported && (
              <div className={`${card} divide-y divide-[#ECE8DF]`}>
                {lines.filter((l) => l.family !== 'comissoes').map((l) => (
                  <div key={l.payment_method} className="flex items-center justify-between px-4 py-3">
                    <span className="font-bold">{l.payment_method}</span><span className="font-extrabold tabular-nums">{eur(num(l.declared))}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <div><h1 className="text-2xl font-extrabold leading-tight">Talões dos TPA</h1>
              <p className="text-[15px] text-[#5B635E] mt-1">Fotografe o talão de fecho de cada terminal e confirme o total que lá aparece.</p></div>
            <input ref={photoInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => addPhoto(e.target.files)} />
            <div className={`${card} p-4 flex flex-col gap-4`}>
              {totals.byFam('cartoes').map((l, i) => {
                const ph = photos.filter((p) => p.label === l.payment_method);
                return (
                  <div key={l.payment_method} className={`flex items-center gap-3 ${i ? 'pt-4 border-t border-[#ECE8DF]' : ''}`}>
                    <button disabled={locked || !!busy} onClick={() => { setPhotoFor(l.payment_method); photoInput.current?.click(); }}
                      aria-label={`Fotografar o talão ${l.payment_method}`}
                      className={`w-14 h-[72px] rounded-lg shrink-0 flex items-center justify-center overflow-hidden ${ph.length ? 'bg-[#ECE8DF]' : 'border-2 border-dashed border-[#8E978F] bg-white'}`}>
                      {ph[0]?.url ? <img src={ph[0].url} alt="" className="w-full h-full object-cover" /> : <Camera className="w-6 h-6" />}
                    </button>
                    <div className="flex-1 flex flex-col gap-1.5">
                      <label htmlFor={`d-${i}`} className="text-[15px] font-extrabold">{l.payment_method}</label>
                      <MoneyInput id={`d-${i}`} value={l.declared} onChange={(v) => setDecl(l.payment_method, v)} strong={!!ph.length} />
                    </div>
                  </div>
                );
              })}
              {!locked && <button onClick={() => addMethod('cartoes')} className="h-11 rounded-xl border-2 border-dashed border-[#CFC9BC] font-bold text-[#3E4541] flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Outro terminal</button>}
            </div>
            <div className="bg-[#FFF6D6] rounded-xl p-4 flex gap-2.5 text-sm text-[#4A3A00]"><Info className="w-5 h-5 shrink-0" />Houve gorjetas em cartão? Registe-as no passo 4 — o valor sai em dinheiro da caixa.</div>
          </>
        )}

        {step === 2 && (
          <>
            <div><h1 className="text-2xl font-extrabold leading-tight">Dinheiro e plataformas</h1>
              <p className="text-[15px] text-[#5B635E] mt-1">Leia os recebimentos da máquina de trocos e confirme o dinheiro e a Uber.</p></div>
            <button disabled={locked || !!busy} onClick={syncMachine} className="h-14 rounded-2xl bg-[#015939] text-white text-[17px] font-extrabold flex items-center justify-center gap-2 disabled:opacity-50">
              <RefreshCw className={`w-5 h-5 ${busy === 'cm' ? 'animate-spin' : ''}`} /> {busy === 'cm' ? 'A ler a máquina…' : 'Ler a máquina de trocos'}
            </button>
            <div className={`${card} p-4 grid grid-cols-2 gap-3`}>
              <div><p className="text-xs text-[#5B635E]">Máquina de trocos</p><p className="text-xl font-extrabold tabular-nums">{eur(machine)}</p></div>
              <div><p className="text-xs text-[#5B635E]">Dinheiro apurado</p><p className="text-xl font-extrabold tabular-nums">{eur(cashDecl)}</p></div>
              {machine != null && (
                <p className={`col-span-2 text-sm font-bold ${Math.abs(machine - cashDecl) < 0.01 ? 'text-[#015939]' : 'text-[#B3141F]'}`}>
                  {Math.abs(machine - cashDecl) < 0.01 ? '✓ Bate certo com a máquina' : `Diferença de ${eur(round2(cashDecl - machine))} para a máquina`}
                </p>
              )}
            </div>
            <div className={`${card} p-4 flex flex-col gap-4`}>
              {[...cashLines, ...totals.byFam('plataformas'), ...totals.byFam('outro')].map((l, i) => (
                <div key={l.payment_method} className="flex flex-col gap-1.5">
                  <label htmlFor={`c-${i}`} className="text-[15px] font-extrabold">{l.payment_method}</label>
                  <MoneyInput id={`c-${i}`} value={l.declared} onChange={(v) => setDecl(l.payment_method, v)} />
                </div>
              ))}
              {!locked && <button onClick={() => addMethod('plataformas')} className="h-11 rounded-xl border-2 border-dashed border-[#CFC9BC] font-bold text-[#3E4541] flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Outro método</button>}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div><h1 className="text-2xl font-extrabold leading-tight">Gorjetas em cartão</h1>
              <p className="text-[15px] text-[#5B635E] mt-1">Cada gorjeta paga no TPA sai em dinheiro da caixa. Registe-as aqui; se não houve, passe à frente.</p></div>
            {tips.length > 0 && (
              <div className={`${card} divide-y divide-[#ECE8DF]`}>
                {tips.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1"><p className="font-extrabold">{eur(t.amount)}</p><p className="text-[13px] text-[#5B635E]">{t.payment_method}{t.invoice_ref ? ` · fatura ${t.invoice_ref}` : ''}</p></div>
                    {!locked && <button aria-label="Remover" onClick={() => removeTip(t)} className="w-11 h-11 flex items-center justify-center text-[#B3141F]"><Trash2 className="w-5 h-5" /></button>}
                  </div>
                ))}
                <div className="flex justify-between px-4 py-3 bg-[#F6F4EF] rounded-b-xl"><span className="font-bold">Total</span><span className="font-extrabold">{eur(totals.tips)}</span></div>
              </div>
            )}
            {!locked && (
              <div className={`${card} p-4 flex flex-col gap-3`}>
                <label htmlFor="tip" className="text-[15px] font-extrabold">Nova gorjeta</label>
                <MoneyInput id="tip" value={tipForm.amount} onChange={(v) => setTipForm({ ...tipForm, amount: v })} />
                <div className="grid grid-cols-2 gap-2">
                  <select value={tipForm.method} onChange={(e) => setTipForm({ ...tipForm, method: e.target.value })} className="h-12 rounded-[10px] border-2 border-[#CFC9BC] bg-white px-2 font-bold">
                    {(cardMethods.length ? cardMethods : ['Multibanco']).map((m) => <option key={m}>{m}</option>)}
                  </select>
                  <input value={tipForm.invoice} onChange={(e) => setTipForm({ ...tipForm, invoice: e.target.value })} placeholder="N.º fatura" className="h-12 rounded-[10px] border-2 border-[#CFC9BC] bg-white px-3 font-bold" />
                </div>
                <button onClick={addTip} disabled={!!busy} className="h-12 rounded-xl bg-[#1F2420] text-white font-extrabold flex items-center justify-center gap-2 disabled:opacity-50"><Plus className="w-5 h-5" /> Adicionar gorjeta</button>
              </div>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <div><h1 className="text-2xl font-extrabold leading-tight">{locked ? 'Resumo do fecho' : 'Confirmar e enviar'}</h1>
              {!locked && <p className="text-[15px] text-[#5B635E] mt-1">Confira os valores. Depois de enviar, só a gerência pode alterar.</p>}</div>
            <div className={`${card} divide-y divide-[#ECE8DF]`}>
              {lines.filter((l) => l.family !== 'comissoes').map((l) => (
                <div key={l.payment_method} className="flex items-center justify-between px-4 py-3">
                  <span className="font-bold">{l.payment_method}</span>
                  <span className="text-right">
                    <span className="font-extrabold tabular-nums">{eur(num(l.declared))}</span>
                    {isManager && <span className="block text-xs text-[#5B635E] tabular-nums">teórico {eur(l.theoretical)}</span>}
                  </span>
                </div>
              ))}
              <div className="flex justify-between px-4 py-3"><span className="font-bold">Gorjetas em cartão</span><span className="font-extrabold">{eur(totals.tips)}</span></div>
              <div className="flex justify-between px-4 py-3"><span className="font-bold">Máquina de trocos</span><span className="font-extrabold">{eur(machine)}</span></div>
              <div className="flex justify-between px-4 py-3 bg-[#F6F4EF] rounded-b-xl"><span className="font-extrabold">Total apurado</span><span className="font-extrabold text-lg">{eur(totals.decl)}</span></div>
            </div>
            {isManager && (
              <div className={`${card} p-4 text-sm flex flex-col gap-1`}>
                <p><span className="text-[#5B635E]">Teórico do POS:</span> <b>{eur(totals.theo)}</b></p>
                <p><span className="text-[#5B635E]">Diferença (já com gorjetas):</span> <b className={Math.abs(totals.decl - totals.theo - totals.tips) > 2 ? 'text-[#B3141F]' : 'text-[#015939]'}>{eur(round2(totals.decl - totals.theo - totals.tips))}</b></p>
                {machine != null && cashTheo > 0 && <p><span className="text-[#5B635E]">Sobra na máquina vs gorjetas:</span> <b>{eur(round2(machine - cashTheo))} / {eur(totals.tips)}</b></p>}
              </div>
            )}
            {!locked && (
              <label className="flex flex-col gap-1.5">
                <span className="text-[15px] font-extrabold">Notas (opcional)</span>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="px-3 py-2.5 rounded-xl border-2 border-[#CFC9BC] bg-white" placeholder="Algo de diferente hoje?" />
              </label>
            )}
            {isManager && <Link to={`/cash-closing?unit=${unitId}&date=${date}&full=1`} className="text-center text-[#015939] font-bold py-2">Abrir a versão completa (validar, histórico…)</Link>}
          </>
        )}
      </main>

      {!locked && (
        <footer className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] bg-[#F6F4EF] px-5 pt-3 pb-3 flex flex-col gap-1.5 border-t border-[#ECE8DF]">
          {step < 4 ? (
            <button onClick={next} disabled={!!busy} className="h-14 rounded-2xl bg-[#015939] text-white text-[17px] font-extrabold disabled:opacity-50">
              {busy === 'next' ? 'A guardar…' : `Seguinte: ${STEPS[step + 1].toLowerCase()}`}
            </button>
          ) : (
            <button onClick={submit} disabled={!!busy} className="h-14 rounded-2xl bg-[#015939] text-white text-[17px] font-extrabold disabled:opacity-50">
              {busy === 'submit' ? 'A enviar…' : 'Enviar fecho'}
            </button>
          )}
          <span className="text-[12px] text-[#5B635E] text-center">Fica guardado a cada passo — pode continuar mais tarde</span>
        </footer>
      )}
    </div>
  );
}
