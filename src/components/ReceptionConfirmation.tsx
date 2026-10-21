import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { X, Package as PackageIcon, CheckCircle, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

interface OrderLine {
  id: string;
  product_id: string;
  shipped_quantity: number;
  unit: string;
  products: {
    code: string;
    name: string;
  };
}

interface PackageDetail {
  id: string;
  display_code: string;
  weight: number;
  unit: string;
  status: string;
  product_name: string;
}

interface InternalOrder {
  id: string;
  order_number: string;
  from_unit_id: string;
  to_unit_id: string;
  shipped_at: string;
  status: string;
  internal_order_lines: OrderLine[];
  units: {
    name: string;
  };
}

interface ReceptionConfirmationProps {
  orderId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ReceptionConfirmation({ orderId, onClose, onSuccess }: ReceptionConfirmationProps) {
  const { user, profile } = useAuth();
  const [order, setOrder] = useState<InternalOrder | null>(null);
  const [packages, setPackages] = useState<PackageDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadOrderDetails();
  }, [orderId]);

  const loadOrderDetails = async () => {
    try {
      const { data: orderData, error: orderError } = await supabase
        .from('internal_orders')
        .select(`
          id,
          order_number,
          from_unit_id,
          to_unit_id,
          shipped_at,
          status,
          internal_order_lines(
            id,
            product_id,
            shipped_quantity,
            unit,
            products(code, name)
          ),
          units!from_unit_id(name)
        `)
        .eq('id', orderId)
        .single();

      if (orderError) throw orderError;
      setOrder(orderData as any);

      const { data: packageData, error: packageError } = await supabase
        .from('internal_order_packages')
        .select(`
          packaged_units(
            id,
            display_code,
            weight,
            unit,
            status,
            products(name)
          )
        `)
        .eq('order_id', orderId);

      if (packageError) throw packageError;

      const packageDetails = (packageData || [])
        .map((item: any) => item.packaged_units)
        .filter(Boolean)
        .map((pkg: any) => ({
          id: pkg.id,
          display_code: pkg.display_code,
          weight: pkg.weight,
          unit: pkg.unit,
          status: pkg.status,
          product_name: pkg.products?.name || 'N/A',
        }));

      setPackages(packageDetails);
    } catch (err) {
      console.error('Error loading order details:', err);
      setError('Erro ao carregar detalhes da encomenda');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReception = async () => {
    if (!user || !profile || !order) return;

    setSubmitting(true);
    setError('');

    try {
      const timestamp = new Date().toISOString();
      const packageIds = packages.map(p => p.id);

      await supabase
        .from('internal_orders')
        .update({
          status: 'received',
          received_by: user.id,
          received_at: timestamp,
        })
        .eq('id', orderId);

      await supabase
        .from('packaged_units')
        .update({
          status: 'available',
          location_id: order.to_unit_id,
          received_at: timestamp,
          updated_by: user.id,
        })
        .in('id', packageIds);

      await supabase
        .from('packaged_unit_transfers')
        .update({
          status: 'received',
          received_by: user.id,
          received_at: timestamp,
        })
        .eq('internal_order_id', orderId)
        .in('packaged_unit_id', packageIds);

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'confirm_reception_internal_order',
        entity: 'internal_orders',
        entity_id: orderId,
        changes: { packages_count: packageIds.length },
      });

      alert('Receção confirmada com sucesso!');
      onSuccess();
    } catch (err) {
      console.error('Error confirming reception:', err);
      setError('Erro ao confirmar receção. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      in_transit: 'bg-blue-100 text-blue-800',
      available: 'bg-green-100 text-green-800',
      shipped: 'bg-yellow-100 text-yellow-800',
    };

    const statusLabels: Record<string, string> = {
      in_transit: 'Em Trânsito',
      available: 'Disponível',
      shipped: 'Expedido',
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[status] || 'bg-gray-100 text-gray-800'}`}>
        {statusLabels[status] || status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-sm text-gray-600 mt-2">A carregar...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center">
            <PackageIcon className="h-6 w-6 text-blue-600 mr-3" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">Confirmar Receção</h2>
              <p className="text-sm text-gray-600">Encomenda: {order?.order_number}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md flex items-start">
              <AlertTriangle className="h-5 w-5 text-red-500 mr-2 mt-0.5" />
              <p className="text-red-800">{error}</p>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-blue-600 mb-1">Origem</p>
                <p className="font-medium text-blue-900">{order?.units.name}</p>
              </div>
              <div>
                <p className="text-sm text-blue-600 mb-1">Data de Expedição</p>
                <p className="font-medium text-blue-900">
                  {order?.shipped_at ? format(new Date(order.shipped_at), "dd/MM/yyyy 'às' HH:mm", { locale: pt }) : '-'}
                </p>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Resumo da Encomenda</h3>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Produto</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Código</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Quantidade Expedida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {order?.internal_order_lines.map((line) => {
                    const product = Array.isArray(line.products) ? line.products[0] : line.products;
                    return (
                      <tr key={line.id}>
                        <td className="px-4 py-3 text-gray-900">{product.name}</td>
                        <td className="px-4 py-3 text-gray-600">{product.code}</td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {line.shipped_quantity} {line.unit}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Embalagens a Receber ({packages.length})
            </h3>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Código</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Produto</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Peso</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {packages.map((pkg) => (
                    <tr key={pkg.id}>
                      <td className="px-4 py-3">
                        <span className="font-mono font-medium text-gray-900">{pkg.display_code}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-900">{pkg.product_name}</td>
                      <td className="px-4 py-3 text-right text-gray-900">
                        {pkg.weight} {pkg.unit}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {getStatusBadge(pkg.status)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>Atenção:</strong> Ao confirmar a receção, todas as embalagens serão marcadas como recebidas
              e estarão disponíveis no seu stock.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmReception}
            disabled={submitting || packages.length === 0}
            className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {submitting ? (
              'A processar...'
            ) : (
              <>
                <CheckCircle className="h-5 w-5 mr-2" />
                Confirmar Receção
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
