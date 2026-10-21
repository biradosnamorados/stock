import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { X, Package, Calendar, User, FileText, Truck as TruckIcon, CheckCircle } from 'lucide-react';

interface InternalOrderDetailsProps {
  orderId: string;
  onClose: () => void;
}

interface OrderLine {
  id: string;
  product_id: string;
  quantity: number;
  shipped_quantity: number;
  unit: string;
  products: {
    code: string;
    name: string;
  };
}

interface PackagedUnit {
  id: string;
  display_code: string;
  weight: number;
  unit: string;
  status: string;
  production_batches: {
    batch_code: string;
    production_date: string;
    expiry_date: string;
  } | null;
}

interface OrderDetails {
  id: string;
  order_number: string;
  status: string;
  requested_date: string;
  delivery_date: string | null;
  shipped_at: string | null;
  received_at: string | null;
  cancelled_at: string | null;
  notes: string | null;
  from_unit: { name: string };
  to_unit: { name: string };
  requested_by_profile: { full_name: string } | null;
  prepared_by_profile: { full_name: string } | null;
  received_by_profile: { full_name: string } | null;
  cancelled_by_profile: { full_name: string } | null;
  internal_order_lines: OrderLine[];
  internal_order_packages: Array<{ packaged_units: PackagedUnit }>;
}

export default function InternalOrderDetails({ orderId, onClose }: InternalOrderDetailsProps) {
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrderDetails();
  }, [orderId]);

  const loadOrderDetails = async () => {
    try {
      const { data, error } = await supabase
        .from('internal_orders')
        .select(`
          *,
          from_unit:units!from_unit_id(name),
          to_unit:units!to_unit_id(name),
          requested_by_profile:profiles!requested_by(full_name),
          prepared_by_profile:profiles!prepared_by(full_name),
          received_by_profile:profiles!received_by(full_name),
          cancelled_by_profile:profiles!cancelled_by(full_name),
          internal_order_lines(
            id,
            quantity,
            shipped_quantity,
            unit,
            products(code, name)
          ),
          internal_order_packages(
            packaged_units(
              id,
              display_code,
              weight,
              unit,
              status,
              production_batches(batch_code, production_date, expiry_date)
            )
          )
        `)
        .eq('id', orderId)
        .single();

      if (error) throw error;
      setOrder(data as any);
    } catch (err) {
      console.error('Error loading order details:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-slate-100 text-slate-700',
      preparing: 'bg-yellow-100 text-yellow-700',
      shipped: 'bg-blue-100 text-blue-700',
      received: 'bg-green-100 text-green-700',
      cancelled: 'bg-red-100 text-red-700',
    };
    return colors[status] || 'bg-slate-100 text-slate-700';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: 'Pendente',
      preparing: 'Em Preparação',
      shipped: 'Expedida',
      received: 'Recebida',
      cancelled: 'Cancelada',
    };
    return labels[status] || status;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-xl p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">A carregar detalhes...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-xl p-8">
          <p className="text-red-600">Encomenda não encontrada</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-slate-600 text-white rounded-lg">
            Fechar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Detalhes da Encomenda</h2>
            <p className="text-slate-600 mt-1 font-mono text-sm">{order.order_number}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div className="flex items-center space-x-2 mb-2">
                <TruckIcon className="w-5 h-5 text-slate-600" />
                <h3 className="font-semibold text-slate-700">Estado</h3>
              </div>
              <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(order.status)}`}>
                {getStatusLabel(order.status)}
              </span>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div className="flex items-center space-x-2 mb-2">
                <Package className="w-5 h-5 text-slate-600" />
                <h3 className="font-semibold text-slate-700">Origem</h3>
              </div>
              <p className="text-slate-800 font-medium">{order.from_unit.name}</p>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div className="flex items-center space-x-2 mb-2">
                <CheckCircle className="w-5 h-5 text-slate-600" />
                <h3 className="font-semibold text-slate-700">Destino</h3>
              </div>
              <p className="text-slate-800 font-medium">{order.to_unit.name}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="flex items-center space-x-2 mb-3">
                <User className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-blue-900">Solicitado por</h3>
              </div>
              <p className="text-blue-800 font-medium">{order.requested_by_profile?.full_name || 'Desconhecido'}</p>
              <p className="text-blue-700 text-sm mt-1">
                {new Date(order.requested_date).toLocaleDateString('pt-PT')}
              </p>
            </div>

            {order.prepared_by_profile && (
              <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                <div className="flex items-center space-x-2 mb-3">
                  <Package className="w-5 h-5 text-yellow-600" />
                  <h3 className="font-semibold text-yellow-900">Preparado por</h3>
                </div>
                <p className="text-yellow-800 font-medium">{order.prepared_by_profile.full_name}</p>
              </div>
            )}

            {order.received_by_profile && order.received_at && (
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <div className="flex items-center space-x-2 mb-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <h3 className="font-semibold text-green-900">Recebido por</h3>
                </div>
                <p className="text-green-800 font-medium">{order.received_by_profile.full_name}</p>
                <p className="text-green-700 text-sm mt-1">
                  {new Date(order.received_at).toLocaleDateString('pt-PT')}
                </p>
              </div>
            )}

            {order.cancelled_by_profile && order.cancelled_at && (
              <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                <div className="flex items-center space-x-2 mb-3">
                  <X className="w-5 h-5 text-red-600" />
                  <h3 className="font-semibold text-red-900">Cancelado por</h3>
                </div>
                <p className="text-red-800 font-medium">{order.cancelled_by_profile.full_name}</p>
                <p className="text-red-700 text-sm mt-1">
                  {new Date(order.cancelled_at).toLocaleDateString('pt-PT')}
                </p>
              </div>
            )}

            {order.delivery_date && (
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="flex items-center space-x-2 mb-3">
                  <Calendar className="w-5 h-5 text-slate-600" />
                  <h3 className="font-semibold text-slate-700">Data de Entrega Prevista</h3>
                </div>
                <p className="text-slate-800 font-medium">
                  {new Date(order.delivery_date).toLocaleDateString('pt-PT')}
                </p>
              </div>
            )}

            {order.shipped_at && (
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="flex items-center space-x-2 mb-3">
                  <TruckIcon className="w-5 h-5 text-slate-600" />
                  <h3 className="font-semibold text-slate-700">Data de Expedição</h3>
                </div>
                <p className="text-slate-800 font-medium">
                  {new Date(order.shipped_at).toLocaleDateString('pt-PT')}
                </p>
              </div>
            )}
          </div>

          {order.notes && (
            <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
              <div className="flex items-center space-x-2 mb-2">
                <FileText className="w-5 h-5 text-amber-600" />
                <h3 className="font-semibold text-amber-900">Observações</h3>
              </div>
              <p className="text-amber-800">{order.notes}</p>
            </div>
          )}

          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Produtos Solicitados</h3>
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Código</th>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Produto</th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700">Qtd. Pedida</th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700">Qtd. Enviada</th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {order.internal_order_lines.map((line) => {
                    const shippedQty = line.shipped_quantity || 0;
                    const isComplete = shippedQty >= line.quantity;
                    const isPartial = shippedQty > 0 && shippedQty < line.quantity;

                    return (
                      <tr key={line.id}>
                        <td className="px-4 py-3 text-sm font-mono">{line.products.code}</td>
                        <td className="px-4 py-3 text-sm">{line.products.name}</td>
                        <td className="px-4 py-3 text-sm text-right font-medium">
                          {line.quantity} {line.unit}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-medium">
                          {shippedQty} {line.unit}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isComplete ? (
                            <span className="inline-flex px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                              Completo
                            </span>
                          ) : isPartial ? (
                            <span className="inline-flex px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-medium">
                              Parcial
                            </span>
                          ) : (
                            <span className="inline-flex px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                              Pendente
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {order.internal_order_packages.length > 0 && (
            <div className="border-t border-slate-200 pt-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">
                Embalagens Expedidas ({order.internal_order_packages.length})
              </h3>
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Código</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Lote</th>
                      <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700">Peso</th>
                      <th className="text-center px-4 py-3 text-sm font-semibold text-slate-700">Data Produção</th>
                      <th className="text-center px-4 py-3 text-sm font-semibold text-slate-700">Validade</th>
                      <th className="text-center px-4 py-3 text-sm font-semibold text-slate-700">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {order.internal_order_packages.map((pkg) => {
                      const pu = pkg.packaged_units;
                      return (
                        <tr key={pu.id}>
                          <td className="px-4 py-3 text-sm font-mono font-semibold">{pu.display_code}</td>
                          <td className="px-4 py-3 text-sm">{pu.production_batches?.batch_code || '-'}</td>
                          <td className="px-4 py-3 text-sm text-right">{pu.weight} {pu.unit}</td>
                          <td className="px-4 py-3 text-sm text-center">
                            {pu.production_batches?.production_date
                              ? new Date(pu.production_batches.production_date).toLocaleDateString('pt-PT')
                              : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-center">
                            {pu.production_batches?.expiry_date
                              ? new Date(pu.production_batches.expiry_date).toLocaleDateString('pt-PT')
                              : '-'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                              pu.status === 'received'
                                ? 'bg-green-100 text-green-700'
                                : pu.status === 'shipped'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {pu.status === 'received' ? 'Recebida' : pu.status === 'shipped' ? 'Expedida' : 'Disponível'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 p-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
