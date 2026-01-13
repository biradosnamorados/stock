import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ClipboardCheck, Plus, Search, FileText, Package } from 'lucide-react';
import ReceptionForm from '../components/ReceptionForm';

interface Reception {
  id: string;
  invoice_number: string;
  supplier_id: string;
  store_id: string;
  order_id: string | null;
  reception_date: string;
  total_amount: number;
  notes: string | null;
  status: 'draft' | 'completed';
  created_at: string;
}

interface Supplier {
  id: string;
  name: string;
}

interface Store {
  id: string;
  name: string;
}

interface Order {
  id: string;
  order_number: string;
  supplier_id: string;
  store_id: string;
  status: string;
  total_amount: number;
}

export default function Receptions() {
  const [receptions, setReceptions] = useState<Reception[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showReceptionForm, setShowReceptionForm] = useState(false);
  const [receptionOrderId, setReceptionOrderId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [receptionsRes, suppliersRes, storesRes, ordersRes] = await Promise.all([
        supabase
          .from('receptions')
          .select('*')
          .order('reception_date', { ascending: false }),
        supabase.from('suppliers').select('id, name').order('name'),
        supabase.from('stores').select('id, name').order('name'),
        supabase
          .from('orders')
          .select('*')
          .eq('status', 'sent')
          .order('created_at', { ascending: false }),
      ]);

      setReceptions(receptionsRes.data || []);
      setSuppliers(suppliersRes.data || []);
      setStores(storesRes.data || []);
      setOrders(ordersRes.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSupplierName = (supplierId: string) => {
    return suppliers.find((s) => s.id === supplierId)?.name || 'N/A';
  };

  const getStoreName = (storeId: string) => {
    return stores.find((s) => s.id === storeId)?.name || 'N/A';
  };

  const filteredReceptions = receptions.filter(
    (reception) =>
      reception.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getSupplierName(reception.supplier_id).toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-[#F20519] to-[#038C5A] rounded-xl">
            <ClipboardCheck className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Receções</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowOrderModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Package className="w-5 h-5" />
            Importar Encomenda
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#F20519] to-[#048ABF] text-white rounded-lg hover:shadow-lg transition"
          >
            <Plus className="w-5 h-5" />
            Nova Receção Manual
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Pesquisar por nº fatura ou fornecedor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#048ABF]"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-600">A carregar...</div>
        ) : filteredReceptions.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-800 mb-2">
              Nenhuma receção encontrada
            </h2>
            <p className="text-slate-600 mb-4">
              Comece por importar uma encomenda ou criar uma receção manual
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">
                    Nº Fatura
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">
                    Data
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">
                    Fornecedor
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">
                    Loja
                  </th>
                  <th className="text-right px-6 py-3 text-sm font-semibold text-slate-700">
                    Total
                  </th>
                  <th className="text-center px-6 py-3 text-sm font-semibold text-slate-700">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredReceptions.map((reception) => (
                  <tr key={reception.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-6 py-4 text-slate-800 font-medium">
                      {reception.invoice_number}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {new Date(reception.reception_date).toLocaleDateString('pt-PT')}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {getSupplierName(reception.supplier_id)}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {getStoreName(reception.store_id)}
                    </td>
                    <td className="px-6 py-4 text-right text-slate-800 font-medium">
                      {reception.total_amount.toFixed(2)}€
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          reception.status === 'completed'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {reception.status === 'completed' ? 'Concluída' : 'Rascunho'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showOrderModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-xl font-bold text-slate-800">Importar Encomenda</h2>
              <p className="text-sm text-slate-600 mt-1">
                Selecione uma encomenda enviada para criar uma receção
              </p>
            </div>

            <div className="p-6">
              {orders.length === 0 ? (
                <div className="text-center py-8">
                  <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-600">Nenhuma encomenda enviada disponível</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className="p-4 border border-slate-200 rounded-lg hover:border-[#048ABF] cursor-pointer transition"
                      onClick={() => setSelectedOrder(order)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-slate-800">
                            Encomenda: {order.order_number}
                          </div>
                          <div className="text-sm text-slate-600 mt-1">
                            Fornecedor: {getSupplierName(order.supplier_id)}
                          </div>
                          <div className="text-sm text-slate-600">
                            Loja: {getStoreName(order.store_id)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium text-slate-800">
                            {order.total_amount?.toFixed(2) || '0.00'}€
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-200 flex gap-3">
              <button
                onClick={() => {
                  setShowOrderModal(false);
                  setSelectedOrder(null);
                }}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition"
              >
                Cancelar
              </button>
              <button
                disabled={!selectedOrder}
                onClick={() => {
                  if (selectedOrder) {
                    setReceptionOrderId(selectedOrder.id);
                    setShowOrderModal(false);
                    setShowReceptionForm(true);
                    setSelectedOrder(null);
                  }
                }}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-[#F20519] to-[#048ABF] text-white rounded-lg hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Criar Receção
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div>
          <ReceptionForm
            orderId={null}
            onClose={() => setShowModal(false)}
            onSave={() => {
              setShowModal(false);
              loadData();
            }}
          />
        </div>
      )}

      {showReceptionForm && (
        <div>
          <ReceptionForm
            orderId={receptionOrderId}
            onClose={() => {
              setShowReceptionForm(false);
              setReceptionOrderId(null);
            }}
            onSave={() => {
              setShowReceptionForm(false);
              setReceptionOrderId(null);
              loadData();
            }}
          />
        </div>
      )}
    </div>
  );
}
