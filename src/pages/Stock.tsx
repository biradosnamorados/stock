import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Warehouse, Search, AlertCircle, Edit2 } from 'lucide-react';
import type { Database } from '../lib/database.types';

type Stock = Database['public']['Tables']['stock']['Row'] & {
  products: { name: string; unit: string };
  stores: { name: string };
};

export default function Stock() {
  const { profile } = useAuth();
  const [stockItems, setStockItems] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [locationFilter, setLocationFilter] = useState<'all' | 'kitchen' | 'room'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingStock, setEditingStock] = useState<Stock | null>(null);
  const [formData, setFormData] = useState({
    quantity: 0,
    minimum_stock: 0,
  });

  useEffect(() => {
    loadStock();
  }, [profile, locationFilter]);

  const loadStock = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('stock')
        .select('*, products(name, unit), stores(name)')
        .order('updated_at', { ascending: false });

      if (profile?.role === 'store_user' && profile.store_id) {
        query = query.eq('store_id', profile.store_id);
      }

      if (locationFilter !== 'all') {
        query = query.eq('location', locationFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setStockItems((data as Stock[]) || []);
    } catch (error) {
      console.error('Error loading stock:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStock) return;

    try {
      const { error } = await supabase
        .from('stock')
        .update({
          quantity: formData.quantity,
          minimum_stock: formData.minimum_stock,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingStock.id);

      if (error) throw error;

      setShowModal(false);
      setEditingStock(null);
      loadStock();
    } catch (error) {
      console.error('Error updating stock:', error);
      alert('Erro ao atualizar stock');
    }
  };

  const handleEdit = (stock: Stock) => {
    setEditingStock(stock);
    setFormData({
      quantity: stock.quantity,
      minimum_stock: stock.minimum_stock,
    });
    setShowModal(true);
  };

  const filteredStock = stockItems.filter((item) =>
    item.products.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getLocationLabel = (location: string) => {
    return location === 'kitchen' ? 'Cozinha' : 'Sala';
  };

  const isLowStock = (item: Stock) => {
    return item.quantity < item.minimum_stock;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-[#F2B705] to-[#048ABF] rounded-xl">
            <Warehouse className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Stock</h1>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Pesquisar produtos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#048ABF]"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setLocationFilter('all')}
              className={`px-4 py-2 rounded-lg transition ${
                locationFilter === 'all'
                  ? 'bg-[#048ABF] text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setLocationFilter('kitchen')}
              className={`px-4 py-2 rounded-lg transition ${
                locationFilter === 'kitchen'
                  ? 'bg-[#048ABF] text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Cozinha
            </button>
            <button
              onClick={() => setLocationFilter('room')}
              className={`px-4 py-2 rounded-lg transition ${
                locationFilter === 'room'
                  ? 'bg-[#048ABF] text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Sala
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-600">A carregar...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">
                    Produto
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">
                    Localização
                  </th>
                  {profile?.role === 'admin' && (
                    <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">
                      Loja
                    </th>
                  )}
                  <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">
                    Quantidade
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">
                    Mínimo
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">
                    Estado
                  </th>
                  <th className="text-right px-6 py-3 text-sm font-semibold text-slate-700">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredStock.map((item) => (
                  <tr
                    key={item.id}
                    className={`border-b border-slate-100 hover:bg-slate-50 ${
                      isLowStock(item) ? 'bg-red-50' : ''
                    }`}
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-800">{item.products.name}</div>
                      <div className="text-sm text-slate-600">{item.products.unit}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {getLocationLabel(item.location)}
                    </td>
                    {profile?.role === 'admin' && (
                      <td className="px-6 py-4 text-slate-600">{item.stores.name}</td>
                    )}
                    <td className="px-6 py-4">
                      <span className="font-semibold text-slate-800">{item.quantity}</span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{item.minimum_stock}</td>
                    <td className="px-6 py-4">
                      {isLowStock(item) ? (
                        <div className="flex items-center gap-2 text-red-600">
                          <AlertCircle className="w-4 h-4" />
                          <span className="text-sm font-medium">Baixo</span>
                        </div>
                      ) : (
                        <span className="text-sm text-green-600 font-medium">OK</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleEdit(item)}
                          className="p-2 hover:bg-slate-200 rounded-lg transition"
                        >
                          <Edit2 className="w-4 h-4 text-slate-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && editingStock && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-xl font-bold text-slate-800">Editar Stock</h2>
              <p className="text-sm text-slate-600 mt-1">{editingStock.products.name}</p>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Quantidade Atual
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.quantity}
                  onChange={(e) =>
                    setFormData({ ...formData, quantity: parseFloat(e.target.value) })
                  }
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#048ABF]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Stock Mínimo
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.minimum_stock}
                  onChange={(e) =>
                    setFormData({ ...formData, minimum_stock: parseFloat(e.target.value) })
                  }
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#048ABF]"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingStock(null);
                  }}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-[#F2B705] to-[#048ABF] text-white rounded-lg hover:shadow-lg transition"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
