import { useState, useEffect } from 'react';
import { TrendingUp, History, BarChart3, DollarSign, Filter } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ProductPriceHistory from '../components/ProductPriceHistory';
import PriceVariationList from '../components/PriceVariationList';
import LatestPricesByUnit from '../components/LatestPricesByUnit';
import HighestPriceView from '../components/HighestPriceView';

type TabType = 'history' | 'variations' | 'latest' | 'highest';

interface Product {
  id: string;
  name: string;
}

interface Supplier {
  id: string;
  name: string;
}

interface Unit {
  id: string;
  name: string;
}

export default function PriceAnalysis() {
  const [activeTab, setActiveTab] = useState<TabType>('variations');
  const [showFilters, setShowFilters] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);

  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [variationType, setVariationType] = useState<'all' | 'increase' | 'decrease'>('all');
  const [minVariation, setMinVariation] = useState<number>(0);

  useEffect(() => {
    loadFilterData();
  }, []);

  const loadFilterData = async () => {
    try {
      const [productsResult, suppliersResult, unitsResult] = await Promise.all([
        supabase.from('products').select('id, name').eq('active', true).eq('product_type', 'purchased').order('name'),
        supabase.from('suppliers').select('id, name').eq('active', true).order('name'),
        supabase.from('units').select('id, name').order('name'),
      ]);

      if (productsResult.data) setProducts(productsResult.data);
      if (suppliersResult.data) setSuppliers(suppliersResult.data);
      if (unitsResult.data) setUnits(unitsResult.data);
    } catch (error) {
      console.error('Error loading filter data:', error);
    }
  };

  const clearFilters = () => {
    setSelectedProductId('');
    setSelectedSupplierId('');
    setSelectedUnitId('');
    setStartDate('');
    setEndDate('');
    setVariationType('all');
    setMinVariation(0);
  };

  const tabs = [
    {
      id: 'variations' as TabType,
      name: 'Variações de Preço',
      icon: TrendingUp,
      description: 'Lista de alterações de preços com percentagens',
    },
    {
      id: 'history' as TabType,
      name: 'Histórico de Preços',
      icon: History,
      description: 'Histórico completo de preços por produto',
    },
    {
      id: 'latest' as TabType,
      name: 'Últimos Preços por Unidade',
      icon: BarChart3,
      description: 'Comparação de preços entre unidades',
    },
    {
      id: 'highest' as TabType,
      name: 'Preços Máximos',
      icon: DollarSign,
      description: 'Preços mais altos para food cost',
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Análise de Preços</h1>
        <p className="mt-2 text-gray-600">
          Monitorize variações de preços de fornecedores e analise tendências ao longo do tempo
        </p>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap
                  ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <Icon className="w-5 h-5" />
                <span>{tab.name}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {(activeTab === 'history' || activeTab === 'variations') && (
        <div className="bg-white rounded-lg border border-gray-200">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition"
          >
            <div className="flex items-center space-x-2">
              <Filter className="w-5 h-5 text-gray-600" />
              <span className="font-medium text-gray-900">Filtros</span>
            </div>
            <span className="text-sm text-gray-500">
              {showFilters ? 'Ocultar' : 'Mostrar'}
            </span>
          </button>

          {showFilters && (
            <div className="px-6 pb-4 border-t border-gray-200 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Produto
                  </label>
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Todos os produtos</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fornecedor
                  </label>
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Todos os fornecedores</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Unidade
                  </label>
                  <select
                    value={selectedUnitId}
                    onChange={(e) => setSelectedUnitId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Todas as unidades</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data Início
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data Fim
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {activeTab === 'variations' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Tipo de Variação
                      </label>
                      <select
                        value={variationType}
                        onChange={(e) => setVariationType(e.target.value as 'all' | 'increase' | 'decrease')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="all">Todas</option>
                        <option value="increase">Apenas Aumentos</option>
                        <option value="decrease">Apenas Reduções</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Variação Mínima (%)
                      </label>
                      <input
                        type="number"
                        value={minVariation}
                        onChange={(e) => setMinVariation(Number(e.target.value))}
                        min="0"
                        step="1"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  onClick={clearFilters}
                  className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 font-medium"
                >
                  Limpar Filtros
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {activeTab === 'history' && (
          <ProductPriceHistory
            selectedProductId={selectedProductId || undefined}
            selectedSupplierId={selectedSupplierId || undefined}
            selectedUnitId={selectedUnitId || undefined}
            startDate={startDate || undefined}
            endDate={endDate || undefined}
          />
        )}

        {activeTab === 'variations' && (
          <PriceVariationList
            selectedProductId={selectedProductId || undefined}
            selectedSupplierId={selectedSupplierId || undefined}
            selectedUnitId={selectedUnitId || undefined}
            startDate={startDate || undefined}
            endDate={endDate || undefined}
            variationType={variationType}
            minVariation={minVariation}
          />
        )}

        {activeTab === 'latest' && <LatestPricesByUnit />}

        {activeTab === 'highest' && <HighestPriceView />}
      </div>
    </div>
  );
}
