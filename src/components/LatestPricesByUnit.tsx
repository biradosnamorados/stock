import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';

interface LatestPrice {
  product_id: string;
  product_name: string;
  product_category: string;
  unit_id: string;
  unit_name: string;
  supplier_name: string;
  unit_price: number;
  quantity: number;
  unit_measure: string;
  last_purchase_date: string;
}

interface GroupedPrices {
  [productId: string]: {
    product_name: string;
    product_category: string;
    prices: {
      [unitId: string]: LatestPrice;
    };
  };
}

export default function LatestPricesByUnit() {
  const [prices, setPrices] = useState<LatestPrice[]>([]);
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      const [pricesResult, unitsResult] = await Promise.all([
        supabase.from('latest_prices_by_unit_view').select('*'),
        supabase.from('units').select('id, name').order('name'),
      ]);

      if (pricesResult.error) throw pricesResult.error;
      if (unitsResult.error) throw unitsResult.error;

      setPrices(pricesResult.data || []);
      setUnits(unitsResult.data || []);

      const uniqueCategories = [...new Set((pricesResult.data || []).map(p => p.product_category).filter(Boolean))];
      setCategories(uniqueCategories);
    } catch (error) {
      console.error('Error loading latest prices:', error);
    } finally {
      setLoading(false);
    }
  };

  const groupedPrices: GroupedPrices = prices
    .filter(price => !selectedCategory || price.product_category === selectedCategory)
    .reduce((acc, price) => {
      if (!acc[price.product_id]) {
        acc[price.product_id] = {
          product_name: price.product_name,
          product_category: price.product_category,
          prices: {},
        };
      }
      acc[price.product_id].prices[price.unit_id] = price;
      return acc;
    }, {} as GroupedPrices);

  const getHighestPrice = (productPrices: { [unitId: string]: LatestPrice }) => {
    const prices = Object.values(productPrices);
    if (prices.length === 0) return null;
    return Math.max(...prices.map(p => p.unit_price));
  };

  const getLowestPrice = (productPrices: { [unitId: string]: LatestPrice }) => {
    const prices = Object.values(productPrices);
    if (prices.length === 0) return null;
    return Math.min(...prices.map(p => p.unit_price));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-4">
        <label className="text-sm font-medium text-gray-700">Filtrar por Categoria:</label>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Todas as Categorias</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">
                Produto
              </th>
              {units.map((unit) => (
                <th
                  key={unit.id}
                  className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {unit.name}
                </th>
              ))}
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider bg-green-50">
                Mais Baixo
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider bg-red-50">
                Mais Alto
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {Object.entries(groupedPrices).map(([productId, data]) => {
              const highestPrice = getHighestPrice(data.prices);
              const lowestPrice = getLowestPrice(data.prices);

              return (
                <tr key={productId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm sticky left-0 bg-white z-10">
                    <div className="font-medium text-gray-900">{data.product_name}</div>
                    {data.product_category && (
                      <div className="text-xs text-gray-500">{data.product_category}</div>
                    )}
                  </td>
                  {units.map((unit) => {
                    const priceData = data.prices[unit.id];
                    if (!priceData) {
                      return (
                        <td key={unit.id} className="px-4 py-3 text-center text-gray-400">
                          -
                        </td>
                      );
                    }

                    const isHighest = priceData.unit_price === highestPrice;
                    const isLowest = priceData.unit_price === lowestPrice;

                    return (
                      <td
                        key={unit.id}
                        className={`px-4 py-3 text-right ${
                          isHighest ? 'bg-red-50' : isLowest ? 'bg-green-50' : ''
                        }`}
                      >
                        <div className="text-sm font-semibold text-gray-900">
                          €{priceData.unit_price.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {priceData.supplier_name}
                        </div>
                        <div className="text-xs text-gray-400">
                          {format(new Date(priceData.last_purchase_date), 'dd/MM/yyyy')}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-right bg-green-50">
                    <span className="text-sm font-bold text-green-700">
                      {lowestPrice !== null ? `€${lowestPrice.toFixed(2)}` : '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right bg-red-50">
                    <span className="text-sm font-bold text-red-700">
                      {highestPrice !== null ? `€${highestPrice.toFixed(2)}` : '-'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {Object.keys(groupedPrices).length === 0 && (
        <div className="text-center py-12 text-gray-500">
          Nenhum dado de preços encontrado
        </div>
      )}
    </div>
  );
}
