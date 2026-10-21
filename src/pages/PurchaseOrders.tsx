import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { ShoppingCart, Plus, Eye, Copy, Send, FileText, MoreVertical, X } from 'lucide-react';
import PurchaseOrderForm from '../components/PurchaseOrderForm';
import type { PurchaseOrder } from '../types/purchase-orders';

export default function PurchaseOrders() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<string | undefined>(undefined);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [showActions, setShowActions] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadOrders();
  }, [profile]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowActions(null);
        setMenuPosition(null);
      }
    };

    if (showActions) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showActions]);

  const loadOrders = async () => {
    if (!profile?.unit_id) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          suppliers(name, email),
          purchase_order_lines(id, product_id, quantity, unit, unit_price, purchase_unit, purchase_unit_quantity, products(name, code))
        `)
        .eq('unit_id', profile.unit_id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erro ao carregar encomendas fornecedores:', error);
      } else if (data) {
        setOrders(data as any);
      }
    } catch (err) {
      console.error('Erro inesperado:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicate = async (order: PurchaseOrder) => {
    if (!profile?.id) return;

    try {
      const { data: orderNumber, error: numberError } = await supabase.rpc('generate_order_number', {
        prefix: 'PO'
      });

      if (numberError) throw numberError;

      const { data: newOrder, error: orderError } = await supabase
        .from('purchase_orders')
        .insert({
          order_number: orderNumber,
          unit_id: order.unit_id,
          supplier_id: order.supplier_id,
          status: 'draft',
          order_date: new Date().toISOString().split('T')[0],
          expected_delivery_date: order.expected_delivery_date,
          notes: order.notes,
          created_by: profile.id,
          duplicate_of: order.id
        })
        .select()
        .single();

      if (orderError || !newOrder) throw orderError;

      if (order.purchase_order_lines && order.purchase_order_lines.length > 0) {
        const { error: linesError } = await supabase
          .from('purchase_order_lines')
          .insert(order.purchase_order_lines.map((line: any) => ({
            order_id: newOrder.id,
            product_id: line.product_id,
            quantity: line.quantity,
            unit: line.unit,
            unit_price: line.unit_price,
            notes: line.notes,
            purchase_unit: line.purchase_unit || null,
            purchase_unit_quantity: line.purchase_unit_quantity ?? null,
          })));

        if (linesError) throw linesError;
      }

      await supabase.from('audit_logs').insert({
        user_id: profile.id,
        action: 'duplicate_purchase_order',
        entity: 'purchase_orders',
        entity_id: newOrder.id,
        changes: { duplicate_of: order.id }
      });

      loadOrders();
      alert('Encomenda duplicada com sucesso');
    } catch (err) {
      console.error('Erro ao duplicar encomenda:', err);
      alert('Erro ao duplicar encomenda');
    }
  };

  const handleResend = async (order: PurchaseOrder) => {
    if (!profile?.id) return;

    try {
      const { error } = await supabase
        .from('purchase_orders')
        .update({
          status: 'sent',
          last_sent_at: new Date().toISOString(),
          resend_count: (order.resend_count || 0) + 1
        })
        .eq('id', order.id);

      if (error) throw error;

      await supabase.from('audit_logs').insert({
        user_id: profile.id,
        action: 'resend_purchase_order',
        entity: 'purchase_orders',
        entity_id: order.id,
        changes: { resend_count: (order.resend_count || 0) + 1 }
      });

      loadOrders();
      alert('Encomenda reenviada');
    } catch (err) {
      console.error('Erro ao reenviar:', err);
      alert('Erro ao reenviar encomenda');
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-slate-100 text-slate-700',
      sent: 'bg-blue-100 text-blue-700',
      confirmed: 'bg-green-100 text-green-700',
      partially_received: 'bg-yellow-100 text-yellow-700',
      received: 'bg-emerald-100 text-emerald-700',
      cancelled: 'bg-red-100 text-red-700'
    };
    return colors[status] || 'bg-slate-100 text-slate-700';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      draft: 'Rascunho',
      sent: 'Enviada',
      confirmed: 'Confirmada',
      partially_received: 'Parcialmente Recebida',
      received: 'Recebida',
      cancelled: 'Cancelada'
    };
    return labels[status] || status;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">A carregar encomendas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Encomendas Fornecedores</h1>
          <p className="text-slate-600 mt-2">Encomendas a fornecedores externos</p>
        </div>
        <button
          onClick={() => {
            setEditingOrder(undefined);
            setShowForm(true);
          }}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
        >
          <Plus className="w-5 h-5" />
          <span>Nova Encomenda</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Nº Encomenda</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Fornecedor</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Estado</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Data Encomenda</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Entrega Prevista</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Linhas</th>
                <th className="text-right px-6 py-4 text-sm font-semibold text-slate-700">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    <ShoppingCart className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                    <p>Sem encomendas a fornecedores</p>
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-mono text-sm font-medium">{order.order_number}</span>
                        {order.duplicate_of && (
                          <span className="text-xs text-slate-500">Duplicado</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">{order.suppliers?.name}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                        {getStatusLabel(order.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{order.order_date}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {order.expected_delivery_date || 'TBD'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {order.purchase_order_lines?.length || 0} produtos
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setMenuPosition({
                            top: rect.bottom + 8,
                            right: window.innerWidth - rect.right
                          });
                          setShowActions(showActions === order.id ? null : order.id);
                        }}
                        className="p-2 hover:bg-slate-200 rounded-lg transition"
                      >
                        <MoreVertical className="w-5 h-5 text-slate-600" />
                      </button>

                      {showActions === order.id && menuPosition && (
                        <div
                          ref={menuRef}
                          className="fixed bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-50 w-48"
                          style={{
                            top: `${menuPosition.top}px`,
                            right: `${menuPosition.right}px`
                          }}
                        >
                          <button
                            onClick={() => {
                              setSelectedOrder(order);
                              setShowActions(null);
                              setMenuPosition(null);
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center space-x-2"
                          >
                            <Eye className="w-4 h-4" />
                            <span>Ver Detalhes</span>
                          </button>
                          {order.status === 'draft' && (
                            <button
                              onClick={() => {
                                setEditingOrder(order.id);
                                setShowForm(true);
                                setShowActions(null);
                                setMenuPosition(null);
                              }}
                              className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center space-x-2"
                            >
                              <FileText className="w-4 h-4" />
                              <span>Editar</span>
                            </button>
                          )}
                          <button
                            onClick={() => {
                              handleDuplicate(order);
                              setShowActions(null);
                              setMenuPosition(null);
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center space-x-2"
                          >
                            <Copy className="w-4 h-4" />
                            <span>Duplicar</span>
                          </button>
                          {order.status === 'sent' && (
                            <button
                              onClick={() => {
                                handleResend(order);
                                setShowActions(null);
                                setMenuPosition(null);
                              }}
                              className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center space-x-2"
                            >
                              <Send className="w-4 h-4" />
                              <span>Reenviar</span>
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <PurchaseOrderForm
          orderId={editingOrder}
          onClose={() => {
            setShowForm(false);
            setEditingOrder(undefined);
          }}
          onSuccess={() => {
            setShowForm(false);
            setEditingOrder(undefined);
            loadOrders();
          }}
        />
      )}

      {selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-800">Detalhes da Encomenda</h2>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-slate-600">Nº Encomenda</span>
                  <p className="font-mono font-semibold">{selectedOrder.order_number}</p>
                </div>
                <div>
                  <span className="text-sm text-slate-600">Estado</span>
                  <p>
                    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedOrder.status)}`}>
                      {getStatusLabel(selectedOrder.status)}
                    </span>
                  </p>
                </div>
                <div>
                  <span className="text-sm text-slate-600">Fornecedor</span>
                  <p className="font-semibold">{selectedOrder.suppliers?.name}</p>
                </div>
                <div>
                  <span className="text-sm text-slate-600">Data Encomenda</span>
                  <p className="font-semibold">{selectedOrder.order_date}</p>
                </div>
                <div>
                  <span className="text-sm text-slate-600">Entrega Prevista</span>
                  <p className="font-semibold">{selectedOrder.expected_delivery_date || 'TBD'}</p>
                </div>
                {selectedOrder.email_sent_at && (
                  <div>
                    <span className="text-sm text-slate-600">Email Enviado</span>
                    <p className="font-semibold">
                      {new Date(selectedOrder.email_sent_at).toLocaleString('pt-PT')}
                    </p>
                  </div>
                )}
              </div>

              {selectedOrder.notes && (
                <div>
                  <span className="text-sm text-slate-600">Notas</span>
                  <p className="mt-1 text-slate-800">{selectedOrder.notes}</p>
                </div>
              )}

              <div>
                <h3 className="font-semibold text-lg mb-3">Produtos</h3>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-4 py-2 text-sm font-semibold text-slate-700">Produto</th>
                        <th className="text-center px-4 py-2 text-sm font-semibold text-slate-700">Qtd. pedida</th>
                        <th className="text-left px-4 py-2 text-sm font-semibold text-slate-700">Un. de compra</th>
                        <th className="text-right px-4 py-2 text-sm font-semibold text-slate-700">Preço Unit.</th>
                        <th className="text-right px-4 py-2 text-sm font-semibold text-slate-700">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {selectedOrder.purchase_order_lines?.map((line: any) => {
                        const pu = line.purchase_unit;
                        const puq = line.purchase_unit_quantity;
                        const unitLabel = line.unit;
                        return (
                          <tr key={line.id}>
                            <td className="px-4 py-3 text-sm font-medium text-slate-800">
                              {line.products?.name || line.product_name || line.product_id}
                            </td>
                            <td className="px-4 py-3 text-sm text-center font-semibold">
                              {line.quantity}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {pu || puq ? (
                                <span className="inline-flex items-center gap-1.5">
                                  {pu && <span className="font-semibold text-slate-800">{pu}</span>}
                                  {puq && (
                                    <>
                                      <span className="text-slate-300">|</span>
                                      <span className="text-slate-600">{Number(puq)} {unitLabel}</span>
                                    </>
                                  )}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-right">
                              {line.unit_price ? `€${Number(line.unit_price).toFixed(2)}` : '—'}
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-semibold">
                              {line.unit_price ? `€${(Number(line.quantity) * Number(line.unit_price)).toFixed(2)}` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {selectedOrder.resend_count > 0 && (
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm text-blue-800">
                    Esta encomenda foi reenviada {selectedOrder.resend_count} vez(es).
                    {selectedOrder.last_sent_at && ` Último envio: ${new Date(selectedOrder.last_sent_at).toLocaleString('pt-PT')}`}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
