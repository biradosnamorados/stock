import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { X, Package, Send } from 'lucide-react';
import PackageSelector from './PackageSelector';

interface OrderLine {
  id: string;
  product_id: string;
  quantity: number;
  unit: string;
  products: {
    code: string;
    name: string;
  };
}

interface InternalOrder {
  id: string;
  order_number: string;
  from_unit_id: string;
  to_unit_id: string;
  status: string;
  internal_order_lines: OrderLine[];
  units: {
    name: string;
  };
}

interface InternalOrderPreparationProps {
  orderId: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface LineSelection {
  lineId: string;
  productId: string;
  selectedPackages: string[];
  shippedQuantity: number;
}

export default function InternalOrderPreparation({ orderId, onClose, onSuccess }: InternalOrderPreparationProps) {
  const { profile } = useAuth();
  const [order, setOrder] = useState<InternalOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selections, setSelections] = useState<Map<string, LineSelection>>(new Map());

  useEffect(() => {
    loadOrder();
  }, [orderId]);

  const loadOrder = async () => {
    try {
      const { data, error } = await supabase
        .from('internal_orders')
        .select(`
          id,
          order_number,
          from_unit_id,
          to_unit_id,
          status,
          internal_order_lines(
            id,
            product_id,
            quantity,
            unit,
            products(code, name)
          ),
          units!to_unit_id(name)
        `)
        .eq('id', orderId)
        .single();

      if (error) throw error;
      setOrder(data as any);

      const initialSelections = new Map<string, LineSelection>();
      const orderLines = data.internal_order_lines.map((line: any) => ({
        ...line,
        products: Array.isArray(line.products) ? line.products[0] : line.products
      })) as OrderLine[];

      orderLines.forEach(line => {
        initialSelections.set(line.id, {
          lineId: line.id,
          productId: line.product_id,
          selectedPackages: [],
          shippedQuantity: 0,
        });
      });
      setSelections(initialSelections);
    } catch (err) {
      console.error('Error loading order:', err);
      alert('Erro ao carregar encomenda');
    } finally {
      setLoading(false);
    }
  };

  const handlePackagesChange = (lineId: string, packageIds: string[], totalWeight: number) => {
    setSelections(prev => {
      const newSelections = new Map(prev);
      const existing = newSelections.get(lineId);
      if (existing) {
        newSelections.set(lineId, {
          ...existing,
          selectedPackages: packageIds,
          shippedQuantity: totalWeight,
        });
      }
      return newSelections;
    });
  };

  const handleShip = async () => {
    if (!profile?.id || !order) return;

    const allPackages = Array.from(selections.values()).flatMap(s => s.selectedPackages);
    if (allPackages.length === 0) {
      alert('Selecione pelo menos uma embalagem para enviar');
      return;
    }

    setSubmitting(true);
    try {
      await supabase
        .from('internal_orders')
        .update({
          status: 'preparing',
          prepared_by: profile.id,
        })
        .eq('id', orderId);

      for (const [lineId, selection] of selections.entries()) {
        if (selection.shippedQuantity > 0) {
          await supabase
            .from('internal_order_lines')
            .update({
              shipped_quantity: selection.shippedQuantity,
            })
            .eq('id', lineId);
        }
      }

      await supabase
        .from('internal_order_packages')
        .delete()
        .eq('order_id', orderId);

      const packageInserts = [];
      for (const [lineId, selection] of selections.entries()) {
        for (const packageId of selection.selectedPackages) {
          packageInserts.push({
            order_id: orderId,
            order_line_id: lineId,
            packaged_unit_id: packageId,
            assigned_by: profile.id,
          });
        }
      }

      if (packageInserts.length > 0) {
        await supabase.from('internal_order_packages').insert(packageInserts);
      }

      await supabase
        .from('packaged_units')
        .update({
          status: 'reserved',
          updated_by: profile.id
        })
        .in('id', allPackages);

      await supabase.from('audit_logs').insert({
        user_id: profile.id,
        action: 'prepare_internal_order',
        entity: 'internal_orders',
        entity_id: orderId,
        changes: { packages_count: allPackages.length },
      });

      onSuccess();
    } catch (err) {
      console.error('Error preparing order:', err);
      alert('Erro ao preparar encomenda');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmShipment = async () => {
    if (!profile?.id || !order) return;

    const allPackages = Array.from(selections.values()).flatMap(s => s.selectedPackages);
    if (allPackages.length === 0) {
      alert('Selecione pelo menos uma embalagem para enviar');
      return;
    }

    setSubmitting(true);
    try {
      // Update order status to shipped
      await supabase
        .from('internal_orders')
        .update({
          status: 'shipped',
          prepared_by: profile.id,
          shipped_by: profile.id,
          shipped_at: new Date().toISOString(),
        })
        .eq('id', orderId);

      // Update shipped quantities
      for (const [lineId, selection] of selections.entries()) {
        if (selection.shippedQuantity > 0) {
          await supabase
            .from('internal_order_lines')
            .update({
              shipped_quantity: selection.shippedQuantity,
            })
            .eq('id', lineId);
        }
      }

      // Delete existing package assignments and create new ones
      await supabase
        .from('internal_order_packages')
        .delete()
        .eq('order_id', orderId);

      const packageInserts = [];
      for (const [lineId, selection] of selections.entries()) {
        for (const packageId of selection.selectedPackages) {
          packageInserts.push({
            order_id: orderId,
            order_line_id: lineId,
            packaged_unit_id: packageId,
            assigned_by: profile.id,
          });
        }
      }

      if (packageInserts.length > 0) {
        await supabase.from('internal_order_packages').insert(packageInserts);
      }

      const timestamp = new Date().toISOString();

      await supabase
        .from('packaged_units')
        .update({
          status: 'in_transit',
          location_id: order.to_unit_id,
          transferred_at: timestamp,
          updated_by: profile.id,
        })
        .in('id', allPackages);

      const transferInserts = allPackages.map(pkgId => ({
        packaged_unit_id: pkgId,
        internal_order_id: orderId,
        from_location_id: order.from_unit_id,
        to_location_id: order.to_unit_id,
        initiated_by: profile.id,
        shipped_by: profile.id,
        initiated_at: timestamp,
        shipped_at: timestamp,
        status: 'shipped'
      }));

      await supabase.from('packaged_unit_transfers').insert(transferInserts);

      // Generate and print PDF
      const { data: pdfData } = await supabase.functions.invoke('generate-internal-shipment-pdf', {
        body: { order_id: orderId }
      });

      if (pdfData?.success) {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(pdfData.html);
          printWindow.document.close();
          setTimeout(() => printWindow.print(), 500);
        }
      }

      // Log the action
      await supabase.from('audit_logs').insert({
        user_id: profile.id,
        action: 'ship_internal_order',
        entity: 'internal_orders',
        entity_id: orderId,
        changes: { status: 'shipped', packages_count: allPackages.length },
      });

      alert('Encomenda expedida com sucesso!');
      onSuccess();
    } catch (err) {
      console.error('Error shipping order:', err);
      alert('Erro ao expedir encomenda');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-slate-600 mt-4">A carregar...</p>
        </div>
      </div>
    );
  }

  if (!order) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">
              Preparar Encomenda {order.order_number}
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Destino: <span className="font-semibold">{order.units.name}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {order.internal_order_lines.map((line) => {
            const selection = selections.get(line.id);
            return (
              <div key={line.id} className="bg-slate-50 rounded-lg p-4">
                <PackageSelector
                  productId={line.product_id}
                  productName={`${line.products.code} - ${line.products.name}`}
                  requestedQuantity={line.quantity}
                  requestedUnit={line.unit}
                  selectedPackages={selection?.selectedPackages || []}
                  onPackagesChange={(packageIds, totalWeight) =>
                    handlePackagesChange(line.id, packageIds, totalWeight)
                  }
                  fromUnitId={order.from_unit_id}
                />
              </div>
            );
          })}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleShip}
            disabled={submitting}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50"
          >
            <Package className="w-5 h-5" />
            <span>Guardar Preparação</span>
          </button>
          <button
            onClick={handleConfirmShipment}
            disabled={submitting}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition disabled:opacity-50"
          >
            <Send className="w-5 h-5" />
            <span>Confirmar Expedição</span>
          </button>
        </div>
      </div>
    </div>
  );
}
