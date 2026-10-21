import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';
import { AlertTriangle } from 'lucide-react';

interface HighestPrice {
  product_id: string;
  product_name: string;
  product_category: string;
  highest_price: number;
  last_seen_at: string;
  unit: string;
  unit_name: string;
  supplier_name: string;
}

export default function HighestPriceView() {
  const [prices, setPrices] = useState<HighestPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [categories, setCategories] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadPrices();
  }, []);

  const loadPrices = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('highest_prices_view')
        .select('*')
        .order('product_name');

      if (error) throw error;

      setPrices(data || []);

      const uniqueCategories = [...new Set((data || []).map(p => p.product_category).filter(Boolean))];
      setCategories(uniqueCategories);
    } catch (error) {
      console.error('Error loading highest prices:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredPrices = prices.filter((price) => {
    const matchesCategory = !selectedCategory || price.product_category === selectedCategory;
    const matchesSearch = !searchTerm || price.product_name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const totalValue = filteredPrices.reduce((sum, price) => sum + price.highest_price, 0);
  const averagePrice = filteredPrices.length > 0 ? totalValue / filteredPrices.length : 0;

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start space-x-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="font-semibold text-amber-900 text-sm">Preços Máximos para Food Cost</h3>
          <p className="text-sm text-amber-700 mt-1">
            Esta visualização mostra o preço mais alto registado nos últimos 90 dias para cada produto.
            Use estes valores como referência para cálculos de food cost conservadores.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-600 font-medium">Total de Produtos</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{filteredPrices.length}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-600 font-medium">Valor Total</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">€{totalValue.toFixed(2)}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-600 font-medium">Preço Médio</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">€{averagePrice.toFixed(2)}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">Pesquisar Produto</label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Digite o nome do produto..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div className="sm:w-64">
          <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Todas as Categorias</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Produto
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Categoria
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Preço Máximo
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Unidade
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Fornecedor
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Local
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Última Vez Visto
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredPrices.map((price) => (
              <tr key={price.product_id} className="hover:bg-gray-50">
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                  {price.product_name}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  {price.product_category || '-'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-red-600 text-right">
                  €{price.highest_price.toFixed(2)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-center">
                  {price.unit}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  {price.supplier_name || '-'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  {price.unit_name}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  {format(new Date(price.last_seen_at), 'dd/MM/yyyy')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredPrices.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          Nenhum preço encontrado
        </div>
      )}
    </div>
  );
}
