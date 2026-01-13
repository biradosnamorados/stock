import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Plus, Trash2, Save } from 'lucide-react';

interface ReceptionFormProps {
  orderId?: string | null;
  onClose: () => void;
  onSave: () => void;
}

interface Product {
  id: string;
  name: string;
  unit: string;
}

interface ReceptionItem {
  product_id: string;
  product_name?: string;
  ordered_quantity: number;
  received_quantity: number;
  unit_price: number;
}

interface FormData {
  invoice_number: string;
  supplier_id: string;
  store_id: string;
  reception_date: string;
  notes: string;
  items: ReceptionItem[];
}

export default function ReceptionForm({ orderId, onClose, onSave }: ReceptionFormProps) {
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [formData, setFormData] = useState<FormData>({
    invoice_number: '',
    supplier_id: '',
    store_id: '',
    reception_date: new Date().toISOString().split('T')[0],
    notes: '',
    items: [],
  });

  useEffect(() => {
    loadInitialData();
  }, [orderId]);

  const loadInitialData = async () => {
    try {
      const [productsRes, suppliersRes, storesRes] = await Promise.all([
        supabase.from('products').select('id, name, unit').order('name'),
        supabase.from('suppliers').select('*').order('name'),
        supabase.from('stores').select('*').order('name'),
      ]);

      setProducts(productsRes.data || []);
      setSuppliers(suppliersRes.data || []);
      setStores(storesRes.data || []);

      if (orderId) {
        const { data: order } = await supabase
          .from('orders')
          .select(`
            *,
            order_items(*, products(name, unit))
          `)
          .eq('id', orderId)
          .single();

        if (order) {
          setFormData({
            invoice_number: '',
            supplier_id: order.supplier_id,
            store_id: order.store_id,
            reception_date: new Date().toISOString().split('T')[0],
            notes: order.notes || '',
            items: order.order_items.map((item: any) => ({
              product_id: item.product_id,
              product_name: item.products.name,
              ordered_quantity: item.quantity,
              received_quantity: item.quantity,
              unit_price: item.unit_price,
            })),
          });
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const handleAddItem = () => {
    setFormData({
      ...formData,
      items: [
        ...formData.items,
        {
          product_id: '',
          ordered_quantity: 0,
          received_quantity: 0,
          unit_price: 0,
        },
      ],
    });
  };

  const handleRemoveItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index),
    });
  };

  const handleItemChange = (index: number, field: keyof ReceptionItem, value: any) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData({ ...formData, items: newItems });
  };

  const calculateTotal = () => {
    return formData.items.reduce((sum, item) => {
      return sum + item.received_quantity * item.unit_price;
    }, 0);
  };

  const handleSubmit = async (status: 'draft' | 'completed') => {
    if (!formData.invoice_number || !formData.supplier_id || !formData.store_id) {
      alert('Preencha todos os campos obrigatórios');
      return;
    }

    if (formData.items.length === 0) {
      alert('Adicione pelo menos um artigo');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const totalAmount = calculateTotal();

      const { data: reception, error: receptionError } = await supabase
        .from('receptions')
        .insert({
          invoice_number: formData.invoice_number,
          supplier_id: formData.supplier_id,
          store_id: formData.store_id,
          order_id: orderId || null,
          reception_date: formData.reception_date,
          total_amount: totalAmount,
          notes: formData.notes,
          status,
          received_by: user.id,
        })
        .select()
        .single();

      if (receptionError) throw receptionError;

      const receptionItems = formData.items.map((item) => ({
        reception_id: reception.id,
        product_id: item.product_id,
        ordered_quantity: item.ordered_quantity,
        received_quantity: item.received_quantity,
        unit_price: item.unit_price,
        location: 'kitchen',
      }));

      const { error: itemsError } = await supabase
        .from('reception_items')
        .insert(receptionItems);

      if (itemsError) throw itemsError;

      if (status === 'completed') {
        for (const item of formData.items) {
          await supabase.from('product_suppliers').upsert(
            {
              product_id: item.product_id,
              supplier_id: formData.supplier_id,
              store_id: formData.store_id,
              price: item.unit_price,
              last_price_update: new Date().toISOString(),
            },
            {
              onConflict: 'product_id,supplier_id,store_id',
            }
          );
        }

        if (orderId) {
          await supabase
            .from('orders')
            .update({
              status: 'received',
              received_at: new Date().toISOString(),
            })
            .eq('id', orderId);
        }
      }

      onSave();
      onClose();
    } catch (error) {
      console.error('Error saving reception:', error);
      alert('Erro ao guardar receção');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl max-w-6xl w-full my-8">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              {orderId ? 'Nova Receção de Encomenda' : 'Nova Receção Manual'}
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Registe os artigos recebidos e atualize o stock
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[calc(90vh-200px)] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Nº Fatura *
              </label>
              <input
                type="text"
                value={formData.invoice_number}
                onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#048ABF]"
                placeholder="Ex: FAT-2024-001"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Data de Receção *
              </label>
              <input
                type="date"
                value={formData.reception_date}
                onChange={(e) => setFormData({ ...formData, reception_date: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#048ABF]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Fornecedor *
              </label>
              <select
                value={formData.supplier_id}
                onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
                disabled={!!orderId}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#048ABF] disabled:bg-slate-100"
              >
                <option value="">Selecionar fornecedor</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Loja *
              </label>
              <select
                value={formData.store_id}
                onChange={(e) => setFormData({ ...formData, store_id: e.target.value })}
                disabled={!!orderId}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#048ABF] disabled:bg-slate-100"
              >
                <option value="">Selecionar loja</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Observações
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#048ABF]"
              placeholder="Notas adicionais sobre a receção..."
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">Artigos</h3>
              <button
                onClick={handleAddItem}
                className="flex items-center gap-2 px-3 py-1 text-sm bg-[#048ABF] text-white rounded-lg hover:bg-[#037199] transition"
              >
                <Plus className="w-4 h-4" />
                Adicionar Artigo
              </button>
            </div>

            {formData.items.length === 0 ? (
              <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg">
                Nenhum artigo adicionado
              </div>
            ) : (
              <div className="space-y-3">
                {formData.items.map((item, index) => (
                  <div key={index} className="p-4 border border-slate-200 rounded-lg">
                    <div className="grid grid-cols-5 gap-3 items-start">
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Produto *
                        </label>
                        <select
                          value={item.product_id}
                          onChange={(e) => handleItemChange(index, 'product_id', e.target.value)}
                          disabled={!!orderId}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#048ABF] disabled:bg-slate-50"
                        >
                          <option value="">Selecionar</option>
                          {products.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Qtd Recebida *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.received_quantity}
                          onChange={(e) =>
                            handleItemChange(index, 'received_quantity', parseFloat(e.target.value) || 0)
                          }
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#048ABF]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Preço Un. *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.unit_price}
                          onChange={(e) =>
                            handleItemChange(index, 'unit_price', parseFloat(e.target.value) || 0)
                          }
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#048ABF]"
                        />
                      </div>

                      <div className="flex items-end justify-end">
                        <button
                          onClick={() => handleRemoveItem(index)}
                          className="p-2 hover:bg-red-100 rounded-lg transition"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-slate-50 rounded-lg p-4">
            <div className="flex items-center justify-between text-lg font-semibold text-slate-800">
              <span>Total da Fatura:</span>
              <span>{calculateTotal().toFixed(2)}€</span>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-200 flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => handleSubmit('draft')}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition disabled:opacity-50"
          >
            Guardar Rascunho
          </button>
          <button
            onClick={() => handleSubmit('completed')}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-gradient-to-r from-[#F20519] to-[#048ABF] text-white rounded-lg hover:shadow-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Save className="w-5 h-5" />
            Concluir Receção
          </button>
        </div>
      </div>
    </div>
  );
}
