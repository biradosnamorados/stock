// Leitor de QR único para o dia a dia (substitui "Scanner QR" e "Ações QR").
// - lê com a câmara do telemóvel, com leitor USB/Bluetooth (escreve o código + Enter) ou à mão
// - aceita o código puro (PKG-…) ou um URL ".../scanner?code=…"
// - mostra produto, lote, validade e onde está; ações rápidas: abrir, utilizado, desperdício, bloquear
// - a leitura/ação funciona em qualquer unidade (se a embalagem estava noutra unidade passa a esta)
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../lib/supabase';
import { isApp } from '../lib/native';
import { QrCode, Camera, X, Search, PackageOpen, CheckCircle2, Trash2, Ban, Undo2, AlertTriangle, MapPin, History, RotateCcw } from 'lucide-react';

interface Pkg {
  id: string;
  unique_code: string;
  display_code: string | null;
  status: string;
  weight: number | null;
  unit: string | null;
  product_name: string | null;
  product_code: string | null;
  storage_type: string | null;
  batch_code: string | null;
  production_date: string | null;
  packaging_date: string | null;
  expiry_date: string | null;
  location_name: string | null;
  opened_at: string | null;
  final_action_reason: string | null;
  history: { at: string; action: string; by: string | null }[];
}

type Action = 'open' | 'used' | 'waste' | 'blocked' | 'returned' | 'unblock';

const STATUS: Record<string, { label: string; cls: string }> = {
  in_stock: { label: 'Em stock', cls: 'bg-emerald-100 text-emerald-800' },
  available: { label: 'Disponível', cls: 'bg-emerald-100 text-emerald-800' },
  received: { label: 'Recebida', cls: 'bg-emerald-100 text-emerald-800' },
  reserved: { label: 'Reservada', cls: 'bg-amber-100 text-amber-800' },
  in_transit: { label: 'Em trânsito', cls: 'bg-blue-100 text-blue-800' },
  shipped: { label: 'Expedida', cls: 'bg-blue-100 text-blue-800' },
  opened: { label: 'Aberta', cls: 'bg-sky-100 text-sky-800' },
  used: { label: 'Utilizada', cls: 'bg-slate-200 text-slate-700' },
  consumed: { label: 'Utilizada', cls: 'bg-slate-200 text-slate-700' },
  waste: { label: 'Desperdício', cls: 'bg-red-100 text-red-800' },
  returned: { label: 'Devolvida', cls: 'bg-violet-100 text-violet-800' },
  blocked: { label: 'Bloqueada', cls: 'bg-orange-100 text-orange-800' },
};
const ACTION_LABEL: Record<string, string> = {
  package_open: 'Aberta', package_used: 'Utilizada', package_waste: 'Desperdício', package_blocked: 'Bloqueada',
  package_returned: 'Devolvida', package_unblock: 'Desbloqueada', package_opened: 'Aberta', package_consumed: 'Utilizada',
};
const STORAGE: Record<string, string> = { frozen: 'Congelado', refrigerated: 'Refrigerado', chilled: 'Refrigerado', ambient: 'Ambiente', dry: 'Seco' };
const WASTE_REASONS = ['Fora de validade', 'Estragado', 'Caiu / contaminado', 'Sobra de serviço'];
const BLOCK_REASONS = ['Problema de qualidade', 'Embalagem danificada', 'Temperatura', 'A verificar'];

const fmtDate = (d: string | null) => (d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-PT') : '—');
const fmtTs = (d: string) => new Date(d).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());

export default function Scanner() {
  const [params, setParams] = useSearchParams();
  const [code, setCode] = useState('');
  const [pkg, setPkg] = useState<Pkg | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [camera, setCamera] = useState(false);
  const [pending, setPending] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const runningRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const lookup = async (raw: string) => {
    const c = raw.trim();
    if (!c) return;
    setLoading(true); setError(''); setOk(''); setPkg(null); setPending(null); setReason('');
    const { data, error: e } = await supabase.rpc('scan_package', { p_code: c });
    setLoading(false);
    if (e) return setError(e.message);
    if (!data) return setError('Embalagem não encontrada. Confirme o código.');
    setPkg(data as Pkg);
    setCode((data as Pkg).display_code || (data as Pkg).unique_code);
  };

  // abrir diretamente quando vem de um link ?code=
  useEffect(() => {
    const c = params.get('code');
    if (c) { lookup(c); setParams({}, { replace: true }); }
    else if (isApp()) startCamera(); // na app abre logo a câmara
    else inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { stopCamera(); }, []);

  const stopCamera = async () => {
    if (scannerRef.current && runningRef.current) {
      try { await scannerRef.current.stop(); } catch { /* */ }
    }
    runningRef.current = false;
    setCamera(false);
  };

  const startCamera = async () => {
    setError(''); setOk('');
    if (!navigator.mediaDevices?.getUserMedia) return setError('Este browser não permite usar a câmara. Escreva o código.');
    setCamera(true);
    await new Promise((r) => setTimeout(r, 50));
    try {
      if (!scannerRef.current) scannerRef.current = new Html5Qrcode('qr-reader');
      await scannerRef.current.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (text) => {
          if (!runningRef.current) return;
          if (navigator.vibrate) navigator.vibrate(80);
          await stopCamera();
          lookup(text);
        },
        () => {},
      );
      runningRef.current = true;
    } catch (err: any) {
      setCamera(false);
      const n = err?.name || '';
      setError(
        n === 'NotAllowedError' || /permission/i.test(err?.message ?? '')
          ? 'Sem permissão para a câmara. Autorize a câmara nas definições do browser e tente de novo.'
          : n === 'NotReadableError'
            ? 'A câmara está a ser usada por outra aplicação.'
            : 'Não foi possível abrir a câmara. Escreva o código à mão.',
      );
    }
  };

  const doAction = async (action: Action, why?: string) => {
    if (!pkg) return;
    setBusy(true); setError('');
    const { data, error: e } = await supabase.rpc('package_action', { p_code: pkg.unique_code, p_action: action, p_reason: why ?? null });
    setBusy(false);
    if (e) return setError(e.message);
    setPkg(data as Pkg);
    setPending(null); setReason('');
    setOk({ open: 'Embalagem aberta.', used: 'Marcada como utilizada.', waste: 'Registada como desperdício.', blocked: 'Embalagem bloqueada.', returned: 'Marcada como devolvida.', unblock: 'Embalagem desbloqueada.' }[action]);
  };

  const next = () => {
    setPkg(null); setCode(''); setOk(''); setError(''); setPending(null);
    startCamera();
  };

  const closed = pkg && ['used', 'consumed', 'waste'].includes(pkg.status);
  const expired = pkg?.expiry_date && pkg.expiry_date < todayIso();
  const st = pkg ? STATUS[pkg.status] ?? { label: pkg.status, cls: 'bg-slate-100 text-slate-700' } : null;

  return (
    <div className="p-4 sm:p-6 max-w-xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><QrCode className="w-7 h-7" /> Ler QR</h1>
        <p className="text-slate-600 text-sm mt-1">Leia a etiqueta da embalagem para ver o produto e registar o que lhe aconteceu.</p>
      </div>

      {/* leitura */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        {camera ? (
          <div className="space-y-3">
            <div id="qr-reader" className="rounded-lg overflow-hidden" />
            <button onClick={stopCamera} className="w-full py-2.5 border border-slate-300 rounded-lg text-slate-700 flex items-center justify-center gap-2">
              <X className="w-4 h-4" /> Fechar câmara
            </button>
          </div>
        ) : (
          <>
            <button onClick={startCamera} className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-lg font-semibold flex items-center justify-center gap-2">
              <Camera className="w-6 h-6" /> Ler com a câmara
            </button>
            <form onSubmit={(e) => { e.preventDefault(); lookup(code); }} className="flex gap-2">
              <input
                ref={inputRef}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Código da etiqueta (ou leitor USB)"
                className="flex-1 px-3 py-2.5 border border-slate-300 rounded-lg font-mono text-sm"
                autoCapitalize="characters"
              />
              <button type="submit" disabled={loading || !code.trim()} className="px-4 bg-slate-900 text-white rounded-lg disabled:opacity-50">
                <Search className="w-5 h-5" />
              </button>
            </form>
          </>
        )}
        {loading && <p className="text-sm text-slate-500">A procurar…</p>}
        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{error}</div>}
        {ok && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex gap-2"><CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />{ok}</div>}
      </div>

      {/* embalagem */}
      {pkg && st && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xl font-bold text-slate-900">{pkg.product_name}</p>
                <p className="text-sm font-mono text-slate-500">{pkg.display_code || pkg.unique_code}</p>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${st.cls}`}>{st.label}</span>
            </div>
            {expired && !closed && (
              <div className="mt-3 p-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Fora de validade ({fmtDate(pkg.expiry_date)}). Não utilizar.
              </div>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-sm">
            <div><dt className="text-slate-500">Validade</dt><dd className={`font-semibold ${expired ? 'text-red-700' : 'text-slate-900'}`}>{fmtDate(pkg.expiry_date)}</dd></div>
            <div><dt className="text-slate-500">Quantidade</dt><dd className="font-semibold text-slate-900">{pkg.weight != null ? `${pkg.weight} ${pkg.unit === 'units' ? 'un.' : pkg.unit ?? ''}` : '—'}</dd></div>
            <div><dt className="text-slate-500">Lote</dt><dd className="font-mono text-slate-900">{pkg.batch_code ?? '—'}</dd></div>
            <div><dt className="text-slate-500">Produzido</dt><dd className="text-slate-900">{fmtDate(pkg.production_date || pkg.packaging_date)}</dd></div>
            {pkg.storage_type && <div><dt className="text-slate-500">Conservação</dt><dd className="text-slate-900">{STORAGE[pkg.storage_type] ?? pkg.storage_type}</dd></div>}
            <div><dt className="text-slate-500">Onde está</dt><dd className="text-slate-900 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{pkg.location_name ?? '—'}</dd></div>
            {pkg.opened_at && <div><dt className="text-slate-500">Aberta em</dt><dd className="text-slate-900">{fmtTs(pkg.opened_at)}</dd></div>}
            {pkg.final_action_reason && <div className="col-span-2"><dt className="text-slate-500">Motivo</dt><dd className="text-slate-900">{pkg.final_action_reason}</dd></div>}
          </dl>

          {/* ações */}
          {!closed && !pending && (
            <div className="p-4 border-t border-slate-100 grid grid-cols-2 gap-2">
              {pkg.status === 'blocked' ? (
                <button disabled={busy} onClick={() => doAction('unblock')} className="col-span-2 py-3 rounded-xl bg-slate-800 text-white font-semibold flex items-center justify-center gap-2"><Undo2 className="w-5 h-5" /> Desbloquear</button>
              ) : (
                <>
                  {pkg.status !== 'opened' && (
                    <button disabled={busy || !!expired} onClick={() => doAction('open')} className="py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-40"><PackageOpen className="w-5 h-5" /> Abrir</button>
                  )}
                  <button disabled={busy} onClick={() => doAction('used')} className={`py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center justify-center gap-2 ${pkg.status === 'opened' ? 'col-span-2' : ''}`}><CheckCircle2 className="w-5 h-5" /> Utilizada (acabou)</button>
                  <button disabled={busy} onClick={() => { setPending('waste'); setReason(expired ? 'Fora de validade' : ''); }} className="py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold flex items-center justify-center gap-2"><Trash2 className="w-5 h-5" /> Desperdício</button>
                  <button disabled={busy} onClick={() => { setPending('blocked'); setReason(''); }} className="py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold flex items-center justify-center gap-2"><Ban className="w-5 h-5" /> Bloquear</button>
                </>
              )}
            </div>
          )}

          {pending && (
            <div className="p-4 border-t border-slate-100 space-y-3">
              <p className="font-semibold text-slate-900">{pending === 'waste' ? 'Motivo do desperdício' : 'Motivo do bloqueio'}</p>
              <div className="flex flex-wrap gap-2">
                {(pending === 'waste' ? WASTE_REASONS : BLOCK_REASONS).map((r) => (
                  <button key={r} onClick={() => setReason(r)} className={`px-3 py-1.5 rounded-full text-sm border ${reason === r ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300 text-slate-700'}`}>{r}</button>
                ))}
              </div>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ou escreva o motivo" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              <div className="flex gap-2">
                <button disabled={busy || !reason.trim()} onClick={() => doAction(pending, reason)} className={`flex-1 py-3 rounded-xl text-white font-semibold disabled:opacity-40 ${pending === 'waste' ? 'bg-red-600' : 'bg-orange-500'}`}>Confirmar</button>
                <button onClick={() => setPending(null)} className="px-4 py-3 rounded-xl border border-slate-300 text-slate-700">Cancelar</button>
              </div>
            </div>
          )}

          {pkg.history?.length > 0 && (
            <div className="p-4 border-t border-slate-100">
              <p className="text-sm font-semibold text-slate-700 flex items-center gap-1 mb-2"><History className="w-4 h-4" /> Histórico</p>
              <ul className="space-y-1 text-sm text-slate-600">
                {pkg.history.map((h, i) => (
                  <li key={i}>{fmtTs(h.at)} · {ACTION_LABEL[h.action] ?? h.action}{h.by ? ` · ${h.by}` : ''}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="p-4 border-t border-slate-100">
            <button onClick={next} className="w-full py-3 rounded-xl border-2 border-blue-600 text-blue-700 font-semibold flex items-center justify-center gap-2">
              <RotateCcw className="w-5 h-5" /> Ler outra embalagem
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
