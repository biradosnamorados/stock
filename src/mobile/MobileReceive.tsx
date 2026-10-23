// Receber mercadoria na app: começa pela câmara (foto da fatura), depois escolhe a encomenda
// e abre o registo da receção já com as fotos anexadas.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, Plus, X, ChevronRight, CheckCircle2, PackageOpen } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import GoodsReceiptForm from '../components/GoodsReceiptForm';

interface Order { id: string; order_number: string | null; expected_delivery_date: string | null; status: string; suppliers: { name: string } | null }

const fmtDay = (d: string) => d.split('-').reverse().slice(0, 2).join('/');
const card = 'bg-white rounded-xl shadow-[0_1px_2px_rgba(1,89,57,0.06),0_4px_12px_rgba(1,89,57,0.08)]';

export default function MobileReceive() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderId, setOrderId] = useState<string | null>(params.get('order'));
  const [form, setForm] = useState(false);
  const [done, setDone] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (!profile?.unit_id) return;
    supabase.from('purchase_orders').select('id, order_number, expected_delivery_date, status, suppliers(name)')
      .eq('unit_id', profile.unit_id).in('status', ['sent', 'confirmed', 'partially_received'])
      .order('expected_delivery_date', { ascending: true, nullsFirst: false }).limit(30)
      .then(({ data }) => setOrders((data as any) ?? []));
  }, [profile?.unit_id]);

  // abre logo a câmara ao entrar
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    setTimeout(() => input.current?.click(), 250);
  }, []);

  const add = (list: FileList | null) => {
    if (!list?.length) return;
    setFiles((f) => [...f, ...Array.from(list).map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    if (input.current) input.current.value = '';
  };

  if (done) {
    return (
      <div className="px-5 pt-16 flex flex-col items-center gap-4 text-center text-[#1F2420]">
        <CheckCircle2 className="w-16 h-16 text-[#015939]" />
        <h1 className="text-2xl font-extrabold">Receção registada</h1>
        <p className="text-[#5B635E]">O stock já foi atualizado.</p>
        <button onClick={() => navigate('/', { replace: true })} className="mt-4 h-14 w-full rounded-2xl bg-[#015939] text-white text-[17px] font-extrabold">Voltar ao início</button>
        <button onClick={() => { setDone(false); setFiles([]); setOrderId(null); }} className="h-12 font-bold text-[#015939]">Receber outra</button>
      </div>
    );
  }

  return (
    <div className="px-5 pt-4 pb-6 flex flex-col gap-5 text-[#1F2420]">
      <div>
        <h1 className="text-2xl font-extrabold">Receber mercadoria</h1>
        <p className="text-[15px] text-[#5B635E] mt-1">Fotografe a fatura ou a guia, escolha a encomenda e confirme o que chegou.</p>
      </div>

      <input ref={input} type="file" accept="image/*,application/pdf" capture="environment" multiple className="hidden" onChange={(e) => add(e.target.files)} />

      {files.length === 0 ? (
        <button onClick={() => input.current?.click()} className="h-48 rounded-2xl border-2 border-dashed border-[#8E978F] bg-white flex flex-col items-center justify-center gap-3">
          <Camera className="w-12 h-12 text-[#015939]" />
          <span className="text-lg font-extrabold">Fotografar a fatura</span>
          <span className="text-[13px] text-[#5B635E]">Uma foto por página</span>
        </button>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {files.map((f, i) => (
            <div key={f.url} className="relative w-24 h-32 shrink-0 rounded-lg overflow-hidden bg-[#ECE8DF]">
              {f.file.type.startsWith('image/') ? <img src={f.url} alt={`Página ${i + 1}`} className="w-full h-full object-cover" /> : <span className="p-2 text-xs font-bold">PDF</span>}
              <button aria-label="Remover foto" onClick={() => setFiles((x) => x.filter((y) => y !== f))} className="absolute top-1 right-1 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
          ))}
          <button onClick={() => input.current?.click()} aria-label="Mais uma página" className="w-24 h-32 shrink-0 rounded-lg border-2 border-dashed border-[#8E978F] bg-white flex flex-col items-center justify-center gap-1 text-sm font-bold"><Plus className="w-6 h-6" />Página</button>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-extrabold">De que encomenda?</h2>
        <div className={`${card} divide-y divide-[#ECE8DF]`}>
          {orders.map((o) => (
            <button key={o.id} onClick={() => setOrderId(o.id)} className="w-full flex items-center gap-3 px-4 py-3 min-h-[60px] text-left">
              <span className={`w-6 h-6 rounded-full border-2 shrink-0 ${orderId === o.id ? 'border-[#015939] bg-[#015939] shadow-[inset_0_0_0_3px_white]' : 'border-[#CFC9BC]'}`} />
              <span className="flex-1 min-w-0">
                <span className="block font-extrabold truncate">{o.suppliers?.name ?? 'Fornecedor'}</span>
                <span className="block text-[13px] text-[#5B635E]">{o.order_number ? `${o.order_number} · ` : ''}{o.expected_delivery_date ? `entrega ${fmtDay(o.expected_delivery_date)}` : 'sem data'}{o.status === 'partially_received' ? ' · parcial' : ''}</span>
              </span>
            </button>
          ))}
          <button onClick={() => setOrderId('')} className="w-full flex items-center gap-3 px-4 py-3 min-h-[60px] text-left">
            <span className={`w-6 h-6 rounded-full border-2 shrink-0 ${orderId === '' ? 'border-[#015939] bg-[#015939] shadow-[inset_0_0_0_3px_white]' : 'border-[#CFC9BC]'}`} />
            <span className="flex-1"><span className="block font-extrabold">Sem encomenda</span><span className="block text-[13px] text-[#5B635E]">Compra avulsa ou entrega não prevista</span></span>
            <PackageOpen className="w-5 h-5 text-[#5B635E]" />
          </button>
        </div>
      </section>

      <button disabled={orderId === null} onClick={() => setForm(true)}
        className="h-14 rounded-2xl bg-[#015939] text-white text-[17px] font-extrabold flex items-center justify-center gap-2 disabled:opacity-40">
        Confirmar o que chegou <ChevronRight className="w-5 h-5" />
      </button>
      {files.length === 0 && <p className="text-[12px] text-[#5B635E] text-center -mt-3">Pode continuar sem foto, mas a fatura fica por anexar.</p>}

      {form && (
        <GoodsReceiptForm
          initialOrderId={orderId || undefined}
          initialFiles={files.map((f) => f.file)}
          onClose={() => setForm(false)}
          onSuccess={() => { setForm(false); setDone(true); }}
        />
      )}
    </div>
  );
}
