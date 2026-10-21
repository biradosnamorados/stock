import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { X, Plus, Trash2, Save, Send } from 'lucide-react';
import type { Supplier, SupplierProduct, PurchaseOrderLine, ProductPurchaseConfig } from '../types/purchase-orders';

interface PurchaseOrderFormProps {
  orderId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function PurchaseOrderForm({ orderId, onClose, onSuccess }: PurchaseOrderFormProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<string>('');
  const [availableProducts, setAvailableProducts] = useState<SupplierProduct[]>([]);
  const [configsByProduct, setConfigsByProduct] = useState<Record<string, ProductPurchaseConfig[]>>({});
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<PurchaseOrderLine[]>([
    { product_id: '', quantity: 1, unit: 'un', current_stock: null, notes: '' }
  ]);
  const linesScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSuppliers();
    if (orderId) {
      loadOrder();
    }
  }, [orderId, profile]);

  useEffect(() => {
    if (selectedSupplier) {
      loadSupplierProducts();
    } else {
      setAvailableProducts([]);
    }
  }, [selectedSupplier]);

  const loadSuppliers = async () => {
    const isAdmin = profile?.role === 'Admin';
    if (!isAdmin && !profile?.unit_id) return;

    let query = supabase
      .from('suppliers')
      .select(`
        id, code, name, type, email, phone, contact_person, active,
        supplier_units${isAdmin ? '' : '!inner'}(unit_id)
      `)
      .eq('active', true)
      .order('name');

    if (!isAdmin && profile?.unit_id) {
      query = query.eq('supplier_units.unit_id', profile.unit_id);
    }

    const { data, error } = await query;

    if (!error && data) {
      setSuppliers(data.map((s: any) => ({
        id: s.id, code: s.code, name: s.name, type: s.type,
        email: s.email, phone: s.phone, contact_person: s.contact_person, active: s.active
      })));
    }
  };

  const loadConfigsForProducts = async (productIds: string[]) => {
    if (productIds.length === 0) return;
    const { data } = await supabase
      .from('product_purchase_configs')
      .select('*')
      .in('product_id', productIds)
      .eq('active', true)
      .order('is_default', { ascending: false });

    if (data) {
      const map: Record<string, ProductPurchaseConfig[]> = {};
      data.forEach(c => {
        if (!map[c.product_id]) map[c.product_id] = [];
        map[c.product_id].push(c as ProductPurchaseConfig);
      });
      setConfigsByProduct(prev => ({ ...prev, ...map }));
    }
  };

  const loadSupplierProducts = async () => {
    const { data, error } = await supabase
      .from('supplier_products')
      .select(`
        supplier_id, product_id, supplier_code, unit_price,
        products!inner(id, code, name, unit, product_type, purchase_unit, purchase_unit_quantity)
      `)
      .eq('supplier_id', selectedSupplier)
      .eq('active', true)
      .eq('products.product_type', 'purchased')
      .eq('products.active', true)
      .order('products(name)');

    if (!error && data) {
      setAvailableProducts(data as any);
      await loadConfigsForProducts(data.map((d: any) => d.product_id));
    }
  };

  const loadOrder = async () => {
    if (!orderId) return;

    const { data, error } = await supabase
      .from('purchase_orders')
      .select(`
        *,
        purchase_order_lines(
          id, product_id, quantity, unit, current_stock, notes,
          purchase_config_id, purchase_unit, purchase_unit_quantity,
          products(code, name, purchase_unit, unit)
        )
      `)
      .eq('id', orderId)
      .maybeSingle();

    if (!error && data) {
      setSelectedSupplier(data.supplier_id);
      setOrderDate(data.order_date);
      setExpectedDeliveryDate(data.expected_delivery_date || '');
      setNotes(data.notes || '');

      if (data.purchase_order_lines && data.purchase_order_lines.length > 0) {
        const productIds = data.purchase_order_lines.map((l: any) => l.product_id);
        await loadConfigsForProducts(productIds);

        setLines(data.purchase_order_lines.map((line: any) => ({
          id: line.id,
          product_id: line.product_id,
          quantity: line.quantity,
          unit: line.unit,
          current_stock: line.current_stock,
          notes: line.notes || '',
          product_name: line.products?.name,
          product_code: line.products?.code,
          purchase_config_id: line.purchase_config_id,
          purchase_unit: line.purchase_unit,
          purchase_unit_quantity: line.purchase_unit_quantity,
        })));
      }
    }
  };

  const loadCurrentStock = async (productId: string, lineIndex: number) => {
    if (!profile?.unit_id) return;

    const { data, error } = await supabase
      .from('product_stock')
      .select('quantity')
      .eq('product_id', productId)
      .eq('unit_id', profile.unit_id)
      .maybeSingle();

    if (!error && data) {
      setLines(prev => {
        const next = [...prev];
        next[lineIndex] = { ...next[lineIndex], current_stock: data.quantity };
        return next;
      });
    }
  };

  const addLine = () => {
    setLines([...lines, { product_id: '', quantity: 1, unit: 'un', current_stock: null, notes: '' }]);
    requestAnimationFrame(() => {
      linesScrollRef.current?.scrollTo({ top: linesScrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  };

  const removeLine = (index: number) => {
    if (lines.length > 1) {
      setLines(lines.filter((_, i) => i !== index));
    }
  };

  const applyConfigToLine = (line: PurchaseOrderLine, config: ProductPurchaseConfig | null): PurchaseOrderLine => {
    if (config) {
      return {
        ...line,
        purchase_config_id: config.id,
        purchase_unit: config.purchase_unit,
        purchase_unit_quantity: config.purchase_unit_quantity,
        unit: config.purchase_unit_measure,
      };
    }
    return {
      ...line,
      purchase_config_id: null,
      purchase_unit: null,
      purchase_unit_quantity: null,
    };
  };

  const updateLine = (index: number, field: keyof PurchaseOrderLine, value: any) => {
    const newLines = [...lines];
    newLines[index] = { ...newLines[index], [field]: value };

    if (field === 'product_id' && value) {
      const product = availableProducts.find(p => p.product_id === value);
      const configs = configsByProduct[value] || [];
      const defaultConfig = configs.find(c => c.is_default) || configs[0] || null;

      if (defaultConfig) {
        newLines[index] = applyConfigToLine(newLines[index], defaultConfig);
      } else if (product) {
        newLines[index].unit = product.products.purchase_unit || product.products.unit;
        newLines[index].purchase_config_id = null;
        newLines[index].purchase_unit = product.products.purchase_unit || null;
        newLines[index].purchase_unit_quantity = product.products.purchase_unit_quantity ?? null;
      }
      loadCurrentStock(value, index);
    }

    if (field === 'purchase_config_id') {
      const configs = configsByProduct[newLines[index].product_id] || [];
      const chosen = configs.find(c => c.id === value) || null;
      newLines[index] = applyConfigToLine(newLines[index], chosen);
    }

    setLines(newLines);
  };

  const validateForm = () => {
    if (!selectedSupplier) { alert('Selecione um fornecedor'); return false; }
    if (!orderDate) { alert('Defina a data da encomenda'); return false; }

    const validLines = lines.filter(line => line.product_id && line.quantity > 0);
    if (validLines.length === 0) { alert('Adicione pelo menos um produto'); return false; }

    return true;
  };

  const buildLinePayload = (line: PurchaseOrderLine, orderIdVal: string) => ({
    order_id: orderIdVal,
    product_id: line.product_id,
    quantity: line.quantity,
    unit: line.unit,
    current_stock: line.current_stock,
    notes: line.notes || null,
    purchase_config_id: line.purchase_config_id || null,
    purchase_unit: line.purchase_unit || null,
    purchase_unit_quantity: line.purchase_unit_quantity ?? null,
  });

  const handleSave = async (sendEmail: boolean = false) => {
    if (!validateForm() || !profile?.id || !profile?.unit_id) return;

    setLoading(true);
    try {
      const validLines = lines.filter(line => line.product_id && line.quantity > 0);
      let targetOrderId = orderId;

      if (orderId) {
        const { error: updateError } = await supabase
          .from('purchase_orders')
          .update({
            supplier_id: selectedSupplier,
            order_date: orderDate,
            expected_delivery_date: expectedDeliveryDate || null,
            notes: notes || null,
            status: sendEmail ? 'sent' : 'draft',
            updated_at: new Date().toISOString()
          })
          .eq('id', orderId);

        if (updateError) throw updateError;

        await supabase.from('purchase_order_lines').delete().eq('order_id', orderId);

        const { error: linesError } = await supabase
          .from('purchase_order_lines')
          .insert(validLines.map(line => buildLinePayload(line, orderId)));

        if (linesError) throw linesError;

        await supabase.from('audit_logs').insert({
          user_id: profile.id,
          action: 'update_purchase_order',
          entity: 'purchase_orders',
          entity_id: orderId,
          changes: { status: sendEmail ? 'sent' : 'draft', lines: validLines.length }
        });
      } else {
        const { data: orderData, error: orderError } = await supabase.rpc('generate_order_number', {
          p_unit_id: profile.unit_id
        });

        if (orderError) throw orderError;

        const { data: newOrder, error: insertError } = await supabase
          .from('purchase_orders')
          .insert({
            order_number: orderData,
            unit_id: profile.unit_id,
            supplier_id: selectedSupplier,
            status: sendEmail ? 'sent' : 'draft',
            order_date: orderDate,
            expected_delivery_date: expectedDeliveryDate || null,
            notes: notes || null,
            created_by: profile.id
          })
          .select()
          .maybeSingle();

        if (insertError || !newOrder) throw insertError;

        targetOrderId = newOrder.id;

        const { error: linesError } = await supabase
          .from('purchase_order_lines')
          .insert(validLines.map(line => buildLinePayload(line, newOrder.id)));

        if (linesError) throw linesError;

        await supabase.from('audit_logs').insert({
          user_id: profile.id,
          action: 'create_purchase_order',
          entity: 'purchase_orders',
          entity_id: newOrder.id,
          changes: { order_number: orderData, lines: validLines.length }
        });
      }

      if (sendEmail && targetOrderId) {
        try {
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();

          if (sessionError || !session) {
            alert('Encomenda guardada mas a sessão expirou. Por favor, faça login novamente.');
            return;
          }

          const { data: pdfData, error: pdfError } = await supabase.functions.invoke('generate-purchase-order-pdf', {
            body: { order_id: targetOrderId }
          });

          if (pdfError) {
            alert(`Encomenda guardada mas houve erro ao gerar PDF:\n${pdfError.message || JSON.stringify(pdfError)}`);
          } else if (pdfData?.success) {
            const { data: emailData, error: emailError } = await supabase.functions.invoke('send-purchase-order-email', {
              body: { order_id: targetOrderId }
            });

            if (emailError) {
              alert('Encomenda guardada mas houve erro ao enviar email: ' + emailError.message);
            } else if (emailData?.success) {
              alert('Encomenda guardada e enviada com sucesso!');
            } else {
              alert('Encomenda guardada mas houve erro ao enviar email: ' + (emailData?.error || 'Erro desconhecido'));
            }
          } else {
            alert('Encomenda guardada mas houve erro ao gerar PDF: ' + (pdfData?.error || 'Resposta inválida do servidor'));
          }
        } catch (emailErr: any) {
          alert('Encomenda guardada mas houve erro: ' + emailErr.message);
        }
      }

      onSuccess();
    } catch (err) {
      console.error('Erro ao guardar encomenda:', err);
      alert('Erro ao guardar encomenda');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-800">
            {orderId ? 'Editar Encomenda' : 'Nova Encomenda a Fornecedor'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Fornecedor *</label>
              <select
                required
                value={selectedSupplier}
                onChange={(e) => setSelectedSupplier(e.target.value)}
                disabled={!!orderId}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100"
              >
                <option value="">Selecione o fornecedor</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name} ({supplier.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Data da Encomenda *</label>
              <input
                type="date"
                required
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Entrega Prevista</label>
              <input
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3 sticky top-0 bg-white z-10 pb-1">
              <h3 className="text-lg font-semibold text-slate-800">Produtos</h3>
              <button
                type="button"
                onClick={addLine}
                disabled={!selectedSupplier}
                className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:text-slate-400 disabled:bg-slate-100 transition"
              >
                <Plus className="w-5 h-5" />
                <span>Adicionar Produto</span>
              </button>
            </div>

            <div ref={linesScrollRef} className="space-y-3 max-h-[45vh] overflow-y-auto pr-1 -mr-1">
              {lines.map((line, index) => {
                const configs = configsByProduct[line.product_id] || [];
                const hasMultipleConfigs = configs.length > 1;
                const showConfigSelector = line.product_id && configs.length > 0;

                return (
                  <div key={index} className="flex items-start space-x-3 p-4 bg-slate-50 rounded-lg">
                    <div className="flex-1 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                        <div className="md:col-span-5">
                          <label className="block text-xs font-medium text-slate-600 mb-1">Produto *</label>
                          <select
                            required
                            value={line.product_id}
                            onChange={(e) => updateLine(index, 'product_id', e.target.value)}
                            disabled={!selectedSupplier}
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-slate-200"
                          >
                            <option value="">Selecione</option>
                            {availableProducts.map((sp) => {
                              const pu = sp.products.purchase_unit;
                              const puq = sp.products.purchase_unit_quantity;
                              const suffix = pu ? ` — ${pu}${puq ? ` (${Number(puq)} ${sp.products.unit})` : ''}` : '';
                              return (
                                <option key={sp.product_id} value={sp.product_id}>
                                  {sp.products.code} - {sp.products.name}{suffix}
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-slate-600 mb-1">Qtd. a pedir *</label>
                          <input
                            type="number"
                            required
                            min="1"
                            step="1"
                            value={line.quantity}
                            onChange={(e) => updateLine(index, 'quantity', parseInt(e.target.value) || 0)}
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        <div className="md:col-span-3">
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            {showConfigSelector ? 'Unidade de compra' : 'Unidade'}
                          </label>
                          {showConfigSelector ? (
                            <select
                              value={line.purchase_config_id || ''}
                              onChange={(e) => updateLine(index, 'purchase_config_id', e.target.value)}
                              disabled={!hasMultipleConfigs}
                              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
                            >
                              {configs.map(c => (
                                <option key={c.id} value={c.id}>
                                  {c.purchase_unit} ({c.purchase_unit_quantity}{c.purchase_unit_measure})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={line.unit}
                              readOnly
                              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-slate-100"
                            />
                          )}
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-slate-600 mb-1">Stock Atual</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.current_stock !== null ? line.current_stock : ''}
                            onChange={(e) => updateLine(index, 'current_stock', parseFloat(e.target.value) || null)}
                            placeholder="0.00"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      {line.product_id && (line.purchase_unit || line.purchase_unit_quantity) && (
                        <div className="flex items-center gap-2 text-sm bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                          <span className="text-blue-500 font-medium">Unidade de compra:</span>
                          <span className="font-semibold text-blue-800">
                            {line.purchase_unit || '—'}
                          </span>
                          {line.purchase_unit_quantity && (
                            <>
                              <span className="text-blue-400">|</span>
                              <span className="font-semibold text-blue-800">{Number(line.purchase_unit_quantity)} {line.unit}</span>
                            </>
                          )}
                          {line.quantity > 1 && line.purchase_unit_quantity && (
                            <>
                              <span className="text-blue-400 mx-1">·</span>
                              <span className="text-blue-600">{line.quantity} × {Number(line.purchase_unit_quantity)} = <strong>{line.quantity * Number(line.purchase_unit_quantity)} {line.unit}</strong></span>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      disabled={lines.length === 1}
                      className="mt-6 text-red-600 hover:text-red-700 disabled:text-slate-400"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Notas</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Observações sobre a encomenda..."
            />
          </div>
        </div>

        <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-slate-700 hover:bg-slate-200 rounded-lg transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition disabled:bg-slate-400"
          >
            <Save className="w-5 h-5" />
            <span>Guardar Rascunho</span>
          </button>
          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:bg-blue-400"
          >
            <Send className="w-5 h-5" />
            <span>Guardar e Enviar</span>
          </button>
        </div>
      </div>
    </div>
  );
}
