import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Truck as TruckIcon, Plus, Package, CheckCircle, XCircle, Eye,
  Search, ChevronRight, ArrowLeft, Check, RefreshCw, X,
} from 'lucide-react';
import InternalOrderPreparation from '../components/InternalOrderPreparation';
import InternalOrderDetails from '../components/InternalOrderDetails';
import ReceptionConfirmation from '../components/ReceptionConfirmation';

interface InternalOrder {
  id: string;
  order_number: string;
  status: string;
  requested_date: string;
  delivery_date: string | null;
  from_unit_id: string;
  to_unit_id: string;
  from_unit: { name: string };
  to_unit: { name: string };
}

interface Unit { id: string; name: string }

interface Product {
  id: string;
  name: string;
  code: string;
  unit: string;
  current_stock?: number;
}

interface OrderLine {
  product: Product;
  quantity: string;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  pending:    { label: 'Pendente',       bg: 'bg-amber-100',  text: 'text-amber-700'  },
  preparing:  { label: 'Em preparação',  bg: 'bg-blue-100',   text: 'text-blue-700'   },
  shipped:    { label: 'Expedida',       bg: 'bg-teal-100',   text: 'text-teal-700'   },
  received:   { label: 'Recebida',       bg: 'bg-emerald-100',text: 'text-emerald-700'},
  cancelled:  { label: 'Anulada',        bg: 'bg-red-100',    text: 'text-red-700'    },
};

// ─── New Order Modal (2-step) ──────────────────────────────────────────────────

interface NewOrderModalProps {
  units: Unit[];
  products: Product[];
  fromUnitId: string;
  onClose: () => void;
  onCreated: () => void;
}

function NewOrderModal({ units, products, fromUnitId, onClose, onCreated }: NewOrderModalProps) {
  const { profile } = useAuth();
  const [step, setStep] = useState<'select' | 'quantities'>('select');
  const [search, setSearch] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [toUnitId, setToUnitId] = useState(units[0]?.id || '');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.code.toLowerCase().includes(search.toLowerCase())
  );

  const toggleProduct = (p: Product) => {
    const next = new Set(selectedProducts);
    if (next.has(p.id)) {
      next.delete(p.id);
    } else {
      next.add(p.id);
    }
    setSelectedProducts(next);
  };

  const goToQuantities = () => {
    const ordered = products.filter(p => selectedProducts.has(p.id));
    setLines(ordered.map(p => ({ product: p, quantity: '' })));
    setStep('quantities');
  };

  const updateQty = (productId: string, value: string) => {
    setLines(prev => prev.map(l => l.product.id === productId ? { ...l, quantity: value } : l));
  };

  const handleSubmit = async () => {
    if (!profile?.unit_id || !profile?.id) return;
    if (!toUnitId) { setError('Selecione o destino.'); return; }

    const validLines = lines.filter(l => parseFloat(l.quantity) > 0);
    if (validLines.length === 0) { setError('Introduza pelo menos uma quantidade.'); return; }

    setSubmitting(true);
    setError(null);

    try {
      const { data: orderNumber, error: numErr } = await supabase.rpc('generate_internal_order_number', {
        p_from_unit_id: toUnitId,
        p_to_unit_id: profile.unit_id,
      });
      if (numErr) throw numErr;

      const { data: newOrder, error: orderErr } = await supabase
        .from('internal_orders')
        .insert({
          order_number: orderNumber,
          from_unit_id: toUnitId,
          to_unit_id: profile.unit_id,
          delivery_date: deliveryDate || null,
          notes: notes || null,
          status: 'pending',
          requested_by: profile.id,
          requested_date: new Date().toISOString().split('T')[0],
        })
        .select()
        .single();
      if (orderErr) throw orderErr;

      const linesToInsert = validLines.map(l => ({
        order_id: newOrder.id,
        product_id: l.product.id,
        quantity: parseFloat(l.quantity),
        unit: l.product.unit,
      }));

      const { error: linesErr } = await supabase.from('internal_order_lines').insert(linesToInsert);
      if (linesErr) throw linesErr;

      onCreated();
    } catch (err: any) {
      setError(err.message || 'Erro ao criar encomenda.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
          {step === 'quantities' && (
            <button onClick={() => setStep('select')} className="p-2 hover:bg-slate-100 rounded-xl transition">
              <ArrowLeft className="w-5 h-5 text-slate-500" />
            </button>
          )}
          <div className="flex-1">
            <h2 className="text-base font-bold text-slate-800">
              {step === 'select' ? 'Selecionar produtos' : 'Definir quantidades'}
            </h2>
            <p className="text-xs text-slate-400">
              {step === 'select'
                ? `${selectedProducts.size} produto${selectedProducts.size !== 1 ? 's' : ''} selecionado${selectedProducts.size !== 1 ? 's' : ''}`
                : `${lines.length} produto${lines.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 flex-shrink-0">
          <div className={`flex items-center gap-1.5 text-xs font-semibold ${step === 'select' ? 'text-blue-600' : 'text-emerald-600'}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === 'select' ? 'bg-blue-600 text-white' : 'bg-emerald-500 text-white'}`}>
              {step === 'quantities' ? <Check className="w-3 h-3" /> : '1'}
            </div>
            Produtos
          </div>
          <div className="flex-1 h-px bg-slate-200" />
          <div className={`flex items-center gap-1.5 text-xs font-semibold ${step === 'quantities' ? 'text-blue-600' : 'text-slate-400'}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === 'quantities' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
              2
            </div>
            Quantidades
          </div>
        </div>

        {/* Step 1: Product selection */}
        {step === 'select' && (
          <>
            <div className="px-5 pt-4 pb-2 flex-shrink-0">
              {/* Destination & date */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Pedir ao CDP</label>
                  <select
                    value={toUnitId}
                    onChange={e => setToUnitId(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Data entrega</label>
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={e => setDeliveryDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Pesquisar produto..."
                  className="w-full border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-2">
              {filtered.length === 0 && (
                <p className="text-center text-sm text-slate-400 py-8">Nenhum produto encontrado.</p>
              )}
              {filtered.map(p => {
                const isSelected = selectedProducts.has(p.id);
                const stock = p.current_stock ?? 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleProduct(p)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition active:scale-[0.99] ${
                      isSelected
                        ? 'bg-blue-50 border-blue-400'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition ${
                      isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                    }`}>
                      {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-sm ${isSelected ? 'text-blue-700' : 'text-slate-800'}`}>{p.name}</p>
                      <p className="text-xs text-slate-400">{p.code}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-xs font-medium ${stock < 1 ? 'text-red-500' : 'text-slate-500'}`}>
                        Stock: {stock.toFixed(1)} {p.unit}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="px-5 py-4 border-t border-slate-100 flex-shrink-0">
              <button
                type="button"
                onClick={goToQuantities}
                disabled={selectedProducts.size === 0}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-base"
              >
                Continuar com {selectedProducts.size} produto{selectedProducts.size !== 1 ? 's' : ''}
              </button>
            </div>
          </>
        )}

        {/* Step 2: Quantities */}
        {step === 'quantities' && (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {lines.map(l => (
                <div key={l.product.id} className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm">{l.product.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Stock atual: {(l.product.current_stock ?? 0).toFixed(1)} {l.product.unit}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min="0"
                      value={l.quantity}
                      onChange={e => updateQty(l.product.id, e.target.value)}
                      placeholder="0"
                      className="flex-1 border-2 border-slate-200 rounded-xl px-4 py-3 text-xl font-bold text-center focus:border-blue-400 outline-none bg-white"
                    />
                    <span className="text-sm font-medium text-slate-500 w-10">{l.product.unit}</span>
                  </div>
                </div>
              ))}

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Notas (opcional)</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Informação adicional..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-slate-100 flex-shrink-0">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition active:scale-95 disabled:opacity-50 text-base"
              >
                {submitting ? 'A enviar...' : 'Enviar encomenda'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function InternalOrders() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<InternalOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [preparingOrderId, setPreparingOrderId] = useState<string | null>(null);
  const [viewingOrderId, setViewingOrderId] = useState<string | null>(null);
  const [receivingOrderId, setReceivingOrderId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [units, setUnits] = useState<Unit[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [isCdpUnit, setIsCdpUnit] = useState(false);

  const loadData = useCallback(async () => {
    if (!profile?.unit_id) { setLoading(false); return; }
    setLoading(true);

    const [ordersRes, unitsRes, productsRes, unitTypeRes] = await Promise.all([
      supabase
        .from('internal_orders')
        .select('*, from_unit:units!from_unit_id(name), to_unit:units!to_unit_id(name)')
        .or(`from_unit_id.eq.${profile.unit_id},to_unit_id.eq.${profile.unit_id}`)
        .order('created_at', { ascending: false }),

      supabase.from('units').select('id, name').eq('type', 'cdp').eq('active', true).order('name'),

      supabase.from('products').select('id, name, code, unit').eq('active', true).eq('product_type', 'cdp_produced').order('name'),

      supabase.from('units').select('type').eq('id', profile.unit_id).maybeSingle(),
    ]);

    if (ordersRes.data) setOrders(ordersRes.data as any);
    if (unitsRes.data) setUnits(unitsRes.data);
    if (productsRes.data) setProducts(productsRes.data);
    if (unitTypeRes.data) setIsCdpUnit(unitTypeRes.data.type === 'cdp');

    setLoading(false);
  }, [profile]);

  useEffect(() => { loadData(); }, [loadData]);

  const activeStatuses = ['pending', 'preparing', 'shipped'];

  const filtered = orders.filter(o => {
    if (statusFilter === 'active') return activeStatuses.includes(o.status);
    if (statusFilter === 'history') return !activeStatuses.includes(o.status);
    return true;
  });

  const actionNeeded = orders.filter(o => {
    const isFrom = o.from_unit_id === profile?.unit_id;
    const isTo = o.to_unit_id === profile?.unit_id;
    return (
      (o.status === 'pending' && isFrom) ||
      (o.status === 'preparing' && isFrom) ||
      (o.status === 'shipped' && isTo)
    );
  });

  const handleCancel = async (orderId: string) => {
    if (!profile?.id) return;
    if (!confirm('Anular esta encomenda?')) return;

    const { data: pkgs } = await supabase.from('internal_order_packages').select('packaged_unit_id').eq('order_id', orderId);
    const pkgIds = (pkgs || []).map(p => p.packaged_unit_id);
    if (pkgIds.length > 0) {
      await supabase.from('packaged_units').update({ status: 'available' }).in('id', pkgIds);
    }
    await supabase.from('internal_orders').update({
      status: 'cancelled', cancelled_by: profile.id, cancelled_at: new Date().toISOString(),
    }).eq('id', orderId);
    loadData();
  };

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center">
              <TruckIcon className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Pedidos ao CDP / CDO</h1>
              <p className="text-xs text-slate-500">Encomendas internas dos restaurantes ao Centro de Produção e ao Centro de Operações</p>
              {actionNeeded.length > 0 && (
                <p className="text-xs text-amber-600 font-medium">{actionNeeded.length} a requerer ação</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => loadData()} className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 transition">
              <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {!isCdpUnit && (
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition active:scale-95"
              >
                <Plus className="w-4 h-4" />
                Nova
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4 pb-24">

        {/* Action needed banner */}
        {actionNeeded.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Package className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-sm font-medium text-amber-800">
              {actionNeeded.length === 1
                ? '1 encomenda requer a sua atenção'
                : `${actionNeeded.length} encomendas requerem a sua atenção`}
            </p>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2">
          {[
            { key: 'active', label: 'Ativas', count: orders.filter(o => activeStatuses.includes(o.status)).length },
            { key: 'history', label: 'Histórico', count: orders.filter(o => !activeStatuses.includes(o.status)).length },
            { key: 'all', label: 'Todas', count: orders.length },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition ${
                statusFilter === f.key
                  ? 'bg-slate-800 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f.label}
              {f.count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                  statusFilter === f.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Orders list */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <TruckIcon className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500 font-medium">Sem encomendas</p>
            {!isCdpUnit && (
              <button onClick={() => setShowCreate(true)}
                className="mt-4 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition">
                Criar primeira encomenda
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(order => {
              const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
              const isFrom = order.from_unit_id === profile?.unit_id;
              const isTo = order.to_unit_id === profile?.unit_id;
              const needsAction = (
                (order.status === 'pending' && isFrom) ||
                (order.status === 'preparing' && isFrom) ||
                (order.status === 'shipped' && isTo)
              );

              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-2xl border-2 overflow-hidden transition ${
                    needsAction ? 'border-blue-400' : 'border-slate-200'
                  }`}
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-bold text-slate-700">{order.order_number}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.text}`}>
                            {cfg.label}
                          </span>
                          {needsAction && (
                            <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-medium">
                              Ação necessária
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          {order.from_unit.name} → {order.to_unit.name}
                          {order.delivery_date && ` · ${new Date(order.delivery_date).toLocaleDateString('pt-PT')}`}
                        </p>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => setViewingOrderId(order.id)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm rounded-xl transition font-medium"
                      >
                        <Eye className="w-4 h-4" />
                        Ver
                      </button>

                      {(order.status === 'pending' || order.status === 'preparing') && isFrom && (
                        <button
                          onClick={() => setPreparingOrderId(order.id)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-xl transition font-medium"
                        >
                          <Package className="w-4 h-4" />
                          {order.status === 'pending' ? 'Preparar' : 'Continuar / Expedir'}
                        </button>
                      )}

                      {order.status === 'shipped' && isTo && (
                        <button
                          onClick={() => setReceivingOrderId(order.id)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-xl transition font-medium"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Receber
                        </button>
                      )}

                      {['pending', 'preparing', 'shipped', 'received'].includes(order.status) && (isFrom || isTo) &&
                        order.status !== 'received' && (
                        <button
                          onClick={() => handleCancel(order.id)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm rounded-xl transition font-medium"
                        >
                          <XCircle className="w-4 h-4" />
                          Anular
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <NewOrderModal
          units={units}
          products={products}
          fromUnitId={profile?.unit_id || ''}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadData(); }}
        />
      )}

      {preparingOrderId && (
        <InternalOrderPreparation
          orderId={preparingOrderId}
          onClose={() => setPreparingOrderId(null)}
          onSuccess={() => { setPreparingOrderId(null); loadData(); }}
        />
      )}

      {viewingOrderId && (
        <InternalOrderDetails
          orderId={viewingOrderId}
          onClose={() => setViewingOrderId(null)}
        />
      )}

      {receivingOrderId && (
        <ReceptionConfirmation
          orderId={receivingOrderId}
          onClose={() => setReceivingOrderId(null)}
          onSuccess={() => { setReceivingOrderId(null); loadData(); }}
        />
      )}
    </div>
  );
}
