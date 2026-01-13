import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { History, Search, Filter, TrendingUp, TrendingDown, Package, ShoppingCart, Calendar } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  unit: string;
}

interface Category {
  id: string;
  name: string;
}

interface Store {
  id: string;
  name: string;
}

interface ReceptionHistory {
  id: string;
  product_name: string;
  reception_date: string;
  invoice_number: string;
  supplier_name: string;
  store_name: string;
  received_quantity: number;
  unit_price: number;
  total: number;
  received_by_name: string;
  status: string;
}

interface PriceHistory {
  product_name: string;
  supplier_name: string;
  price: number;
  last_update: string;
  store_name: string;
}

interface StockMovement {
  id: string;
  product_name: string;
  change_type: string;
  quantity_change: number;
  previous_quantity: number;
  new_quantity: number;
  notes: string;
  created_at: string;
  user_name: string;
  location: string;
  store_name: string;
}

export default function ProductHistory() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [receptionHistory, setReceptionHistory] = useState<ReceptionHistory[]>([]);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [activeTab, setActiveTab] = useState<'receptions' | 'prices' | 'movements'>('receptions');

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      loadCategoryHistory();
    }
  }, [selectedCategory, selectedStore]);

  const loadInitialData = async () => {
    try {
      const [categoriesRes, storesRes] = await Promise.all([
        supabase.from('categories').select('id, name').order('name'),
        supabase.from('stores').select('id, name').order('name'),
      ]);

      setCategories(categoriesRes.data || []);
      setStores(storesRes.data || []);
    } catch (error) {
      console.error('Error loading initial data:', error);
    }
  };

  const loadCategoryHistory = async () => {
    if (!selectedCategory) return;

    setLoading(true);
    try {
      const { data: productsInCategory } = await supabase
        .from('products')
        .select('id')
        .eq('category_id', selectedCategory);

      const productIds = productsInCategory?.map(p => p.id) || [];

      if (productIds.length === 0) {
        setReceptionHistory([]);
        setPriceHistory([]);
        setStockMovements([]);
        setLoading(false);
        return;
      }

      let receptionsQuery = supabase
        .from('reception_items')
        .select(`
          id,
          received_quantity,
          unit_price,
          products!inner(name),
          receptions!inner(
            reception_date,
            invoice_number,
            store_id,
            status,
            received_by,
            stores(name),
            suppliers(name)
          )
        `)
        .in('product_id', productIds)
        .order('receptions(reception_date)', { ascending: false });

      if (selectedStore) {
        receptionsQuery = receptionsQuery.eq('receptions.store_id', selectedStore);
      }

      const { data: receptions } = await receptionsQuery;

      const receptionHistoryData: ReceptionHistory[] = (receptions || []).map((item: any) => ({
        id: item.id,
        product_name: item.products?.name || 'N/A',
        reception_date: item.receptions.reception_date,
        invoice_number: item.receptions.invoice_number,
        supplier_name: item.receptions.suppliers?.name || 'N/A',
        store_name: item.receptions.stores?.name || 'N/A',
        received_quantity: item.received_quantity,
        unit_price: item.unit_price,
        total: item.received_quantity * item.unit_price,
        received_by_name: 'Utilizador',
        status: item.receptions.status,
      }));

      setReceptionHistory(receptionHistoryData);

      let pricesQuery = supabase
        .from('product_suppliers')
        .select(`
          price,
          last_price_update,
          products!inner(name),
          suppliers(name),
          stores(name)
        `)
        .in('product_id', productIds)
        .order('last_price_update', { ascending: false });

      if (selectedStore) {
        pricesQuery = pricesQuery.eq('store_id', selectedStore);
      }

      const { data: prices } = await pricesQuery;

      const priceHistoryData: PriceHistory[] = (prices || []).map((item: any) => ({
        product_name: item.products?.name || 'N/A',
        supplier_name: item.suppliers?.name || 'N/A',
        price: item.price,
        last_update: item.last_price_update,
        store_name: item.stores?.name || 'N/A',
      }));

      setPriceHistory(priceHistoryData);

      let movementsQuery = supabase
        .from('stock_history')
        .select(`
          id,
          change_type,
          quantity_change,
          previous_quantity,
          new_quantity,
          notes,
          created_at,
          stock!inner(
            product_id,
            location,
            store_id,
            products!inner(name),
            stores(name)
          ),
          profiles:user_id(full_name)
        `)
        .in('stock.product_id', productIds)
        .order('created_at', { ascending: false });

      if (selectedStore) {
        movementsQuery = movementsQuery.eq('stock.store_id', selectedStore);
      }

      const { data: movements } = await movementsQuery;

      const stockMovementsData: StockMovement[] = (movements || []).map((item: any) => ({
        id: item.id,
        product_name: item.stock?.products?.name || 'N/A',
        change_type: item.change_type,
        quantity_change: item.quantity_change,
        previous_quantity: item.previous_quantity,
        new_quantity: item.new_quantity,
        notes: item.notes || '',
        created_at: item.created_at,
        user_name: item.profiles?.full_name || 'N/A',
        location: item.stock?.location || 'N/A',
        store_name: item.stock?.stores?.name || 'N/A',
      }));

      setStockMovements(stockMovementsData);
    } catch (error) {
      console.error('Error loading category history:', error);
    } finally {
      setLoading(false);
    }
  };

  const getChangeTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      reception: 'Receção',
      sale: 'Venda',
      adjustment: 'Ajuste',
      count: 'Contagem',
    };
    return types[type] || type;
  };

  const getChangeTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      reception: 'text-green-600 bg-green-100',
      sale: 'text-red-600 bg-red-100',
      adjustment: 'text-blue-600 bg-blue-100',
      count: 'text-purple-600 bg-purple-100',
    };
    return colors[type] || 'text-slate-600 bg-slate-100';
  };

  const getLocationLabel = (location: string) => {
    return location === 'kitchen' ? 'Cozinha' : location === 'room' ? 'Sala' : location;
  };

  const calculateStats = () => {
    const totalReceived = receptionHistory.reduce((sum, r) => sum + r.received_quantity, 0);
    const totalSpent = receptionHistory.reduce((sum, r) => sum + r.total, 0);
    const avgPrice = totalReceived > 0 ? totalSpent / totalReceived : 0;
    const lastPrice = receptionHistory.length > 0 ? receptionHistory[0].unit_price : 0;

    return { totalReceived, totalSpent, avgPrice, lastPrice };
  };

  const stats = calculateStats();

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-gradient-to-br from-[#F20519] to-[#038C5A] rounded-xl">
          <History className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800">Histórico de Produtos</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Categoria *
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#048ABF]"
            >
              <option value="">Selecionar categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Loja (opcional)
            </label>
            <select
              value={selectedStore}
              onChange={(e) => setSelectedStore(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#048ABF]"
            >
              <option value="">Todas as lojas</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {selectedCategory && (
        <>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center gap-3 mb-2">
                <Package className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-slate-600">Total Recebido</span>
              </div>
              <div className="text-2xl font-bold text-slate-800">
                {stats.totalReceived.toFixed(2)}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center gap-3 mb-2">
                <ShoppingCart className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-medium text-slate-600">Gasto Total</span>
              </div>
              <div className="text-2xl font-bold text-slate-800">
                {stats.totalSpent.toFixed(2)}€
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center gap-3 mb-2">
                <TrendingUp className="w-5 h-5 text-purple-600" />
                <span className="text-sm font-medium text-slate-600">Preço Médio</span>
              </div>
              <div className="text-2xl font-bold text-slate-800">
                {stats.avgPrice.toFixed(2)}€
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center gap-3 mb-2">
                <Calendar className="w-5 h-5 text-orange-600" />
                <span className="text-sm font-medium text-slate-600">Último Preço</span>
              </div>
              <div className="text-2xl font-bold text-slate-800">
                {stats.lastPrice.toFixed(2)}€
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="border-b border-slate-200">
              <div className="flex">
                <button
                  onClick={() => setActiveTab('receptions')}
                  className={`flex-1 px-6 py-4 text-sm font-medium transition ${
                    activeTab === 'receptions'
                      ? 'text-[#048ABF] border-b-2 border-[#048ABF] bg-blue-50'
                      : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  Receções ({receptionHistory.length})
                </button>
                <button
                  onClick={() => setActiveTab('prices')}
                  className={`flex-1 px-6 py-4 text-sm font-medium transition ${
                    activeTab === 'prices'
                      ? 'text-[#048ABF] border-b-2 border-[#048ABF] bg-blue-50'
                      : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  Evolução de Preços ({priceHistory.length})
                </button>
                <button
                  onClick={() => setActiveTab('movements')}
                  className={`flex-1 px-6 py-4 text-sm font-medium transition ${
                    activeTab === 'movements'
                      ? 'text-[#048ABF] border-b-2 border-[#048ABF] bg-blue-50'
                      : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  Movimentos de Stock ({stockMovements.length})
                </button>
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center text-slate-600">A carregar...</div>
            ) : (
              <div className="overflow-x-auto">
                {activeTab === 'receptions' && (
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">Produto</th>
                        <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">Data</th>
                        <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">Fatura</th>
                        <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">Fornecedor</th>
                        <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">Loja</th>
                        <th className="text-right px-6 py-3 text-sm font-semibold text-slate-700">Quantidade</th>
                        <th className="text-right px-6 py-3 text-sm font-semibold text-slate-700">Preço Un.</th>
                        <th className="text-right px-6 py-3 text-sm font-semibold text-slate-700">Total</th>
                        <th className="text-center px-6 py-3 text-sm font-semibold text-slate-700">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receptionHistory.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-6 py-8 text-center text-slate-500">
                            Nenhuma receção encontrada
                          </td>
                        </tr>
                      ) : (
                        receptionHistory.map((reception) => (
                          <tr key={reception.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="px-6 py-4 text-slate-800 font-medium">{reception.product_name}</td>
                            <td className="px-6 py-4 text-slate-600">
                              {new Date(reception.reception_date).toLocaleDateString('pt-PT')}
                            </td>
                            <td className="px-6 py-4 text-slate-800 font-medium">
                              {reception.invoice_number}
                            </td>
                            <td className="px-6 py-4 text-slate-600">{reception.supplier_name}</td>
                            <td className="px-6 py-4 text-slate-600">{reception.store_name}</td>
                            <td className="px-6 py-4 text-right text-slate-800">{reception.received_quantity}</td>
                            <td className="px-6 py-4 text-right text-slate-800">{reception.unit_price.toFixed(2)}€</td>
                            <td className="px-6 py-4 text-right text-slate-800 font-medium">
                              {reception.total.toFixed(2)}€
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
                        ))
                      )}
                    </tbody>
                  </table>
                )}

                {activeTab === 'prices' && (
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">Produto</th>
                        <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">Fornecedor</th>
                        <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">Loja</th>
                        <th className="text-right px-6 py-3 text-sm font-semibold text-slate-700">Preço</th>
                        <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">Última Atualização</th>
                      </tr>
                    </thead>
                    <tbody>
                      {priceHistory.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                            Nenhum histórico de preços encontrado
                          </td>
                        </tr>
                      ) : (
                        priceHistory.map((price, index) => (
                          <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="px-6 py-4 text-slate-800 font-medium">{price.product_name}</td>
                            <td className="px-6 py-4 text-slate-800">{price.supplier_name}</td>
                            <td className="px-6 py-4 text-slate-600">{price.store_name}</td>
                            <td className="px-6 py-4 text-right text-slate-800 font-medium">
                              {price.price.toFixed(2)}€
                            </td>
                            <td className="px-6 py-4 text-slate-600">
                              {new Date(price.last_update).toLocaleDateString('pt-PT')}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}

                {activeTab === 'movements' && (
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">Produto</th>
                        <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">Data</th>
                        <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">Tipo</th>
                        <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">Loja</th>
                        <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">Localização</th>
                        <th className="text-right px-6 py-3 text-sm font-semibold text-slate-700">Alteração</th>
                        <th className="text-right px-6 py-3 text-sm font-semibold text-slate-700">Stock Anterior</th>
                        <th className="text-right px-6 py-3 text-sm font-semibold text-slate-700">Stock Novo</th>
                        <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">Utilizador</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockMovements.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-6 py-8 text-center text-slate-500">
                            Nenhum movimento de stock encontrado
                          </td>
                        </tr>
                      ) : (
                        stockMovements.map((movement) => (
                          <tr key={movement.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="px-6 py-4 text-slate-800 font-medium">{movement.product_name}</td>
                            <td className="px-6 py-4 text-slate-600">
                              {new Date(movement.created_at).toLocaleDateString('pt-PT')}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getChangeTypeColor(movement.change_type)}`}>
                                {getChangeTypeLabel(movement.change_type)}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-slate-600">{movement.store_name}</td>
                            <td className="px-6 py-4 text-slate-600">{getLocationLabel(movement.location)}</td>
                            <td className={`px-6 py-4 text-right font-medium ${
                              movement.quantity_change > 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {movement.quantity_change > 0 ? '+' : ''}{movement.quantity_change}
                            </td>
                            <td className="px-6 py-4 text-right text-slate-600">{movement.previous_quantity}</td>
                            <td className="px-6 py-4 text-right text-slate-800 font-medium">{movement.new_quantity}</td>
                            <td className="px-6 py-4 text-slate-600">{movement.user_name}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {!selectedCategory && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
          <History className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-800 mb-2">
            Selecione uma Categoria
          </h2>
          <p className="text-slate-600">
            Escolha uma categoria acima para ver o histórico de todos os produtos dessa categoria
          </p>
        </div>
      )}
    </div>
  );
}
