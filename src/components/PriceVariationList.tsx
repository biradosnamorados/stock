import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { TrendingUp, TrendingDown, ArrowUpDown } from 'lucide-react';
import { format } from 'date-fns';

interface PriceVariation {
  id: string;
  product_name: string;
  product_category: string;
  supplier_name: string;
  unit_name: string;
  current_price: number;
  previous_price: number;
  quantity: number;
  unit_measure: string;
  price_difference: number;
  variation_percentage: number;
  recorded_at: string;
  recorded_by_name: string;
  invoice_reference: string;
  notes: string;
}

interface PriceVariationListProps {
  selectedProductId?: string;
  selectedSupplierId?: string;
  selectedUnitId?: string;
  startDate?: string;
  endDate?: string;
  variationType?: 'all' | 'increase' | 'decrease';
  minVariation?: number;
}

export default function PriceVariationList({
  selectedProductId,
  selectedSupplierId,
  selectedUnitId,
  startDate,
  endDate,
  variationType = 'all',
  minVariation = 0,
}: PriceVariationListProps) {
  const [variations, setVariations] = useState<PriceVariation[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<'recorded_at' | 'variation_percentage'>('recorded_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    loadVariations();
  }, [selectedProductId, selectedSupplierId, selectedUnitId, startDate, endDate, variationType, minVariation]);

  const loadVariations = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('price_variations_view')
        .select('*')
        .order('recorded_at', { ascending: false });

      if (error) throw error;

      let filteredData = data || [];

      if (variationType === 'increase') {
        filteredData = filteredData.filter(v => v.price_difference > 0);
      } else if (variationType === 'decrease') {
        filteredData = filteredData.filter(v => v.price_difference < 0);
      }

      if (minVariation > 0) {
        filteredData = filteredData.filter(v => Math.abs(v.variation_percentage) >= minVariation);
      }

      if (startDate) {
        filteredData = filteredData.filter(v => v.recorded_at >= startDate);
      }

      if (endDate) {
        filteredData = filteredData.filter(v => v.recorded_at <= endDate);
      }

      setVariations(filteredData);
    } catch (error) {
      console.error('Error loading price variations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: 'recorded_at' | 'variation_percentage') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedVariations = [...variations].sort((a, b) => {
    const multiplier = sortDirection === 'asc' ? 1 : -1;

    if (sortField === 'variation_percentage') {
      return (a.variation_percentage - b.variation_percentage) * multiplier;
    } else {
      return (new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()) * multiplier;
    }
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (sortedVariations.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        Nenhuma variação de preço encontrada
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-600 font-medium">Aumentos de Preço</p>
              <p className="text-2xl font-bold text-red-700 mt-1">
                {variations.filter(v => v.price_difference > 0).length}
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-red-600" />
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 font-medium">Reduções de Preço</p>
              <p className="text-2xl font-bold text-green-700 mt-1">
                {variations.filter(v => v.price_difference < 0).length}
              </p>
            </div>
            <TrendingDown className="w-8 h-8 text-green-600" />
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 font-medium">Total de Variações</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">
                {variations.length}
              </p>
            </div>
            <ArrowUpDown className="w-8 h-8 text-blue-600" />
          </div>
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
                Fornecedor
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Unidade
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('recorded_at')}
              >
                <div className="flex items-center">
                  Data
                  <ArrowUpDown className="w-3 h-3 ml-1" />
                </div>
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Preço Anterior
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Preço Atual
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Diferença
              </th>
              <th
                className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('variation_percentage')}
              >
                <div className="flex items-center justify-end">
                  Variação %
                  <ArrowUpDown className="w-3 h-3 ml-1" />
                </div>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Fatura
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedVariations.map((variation) => (
              <tr key={variation.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm">
                  <div className="font-medium text-gray-900">{variation.product_name}</div>
                  {variation.product_category && (
                    <div className="text-xs text-gray-500">{variation.product_category}</div>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  {variation.supplier_name}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  {variation.unit_name}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  {format(new Date(variation.recorded_at), 'dd/MM/yyyy')}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-right">
                  €{variation.previous_price.toFixed(2)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">
                  €{variation.current_price.toFixed(2)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                  <span className={variation.price_difference > 0 ? 'text-red-600' : 'text-green-600'}>
                    {variation.price_difference > 0 ? '+' : ''}€{variation.price_difference.toFixed(2)}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-right">
                  <div className="flex items-center justify-end">
                    {variation.price_difference > 0 ? (
                      <TrendingUp className="w-4 h-4 mr-1 text-red-600" />
                    ) : (
                      <TrendingDown className="w-4 h-4 mr-1 text-green-600" />
                    )}
                    <span className={variation.price_difference > 0 ? 'text-red-600' : 'text-green-600'}>
                      {variation.variation_percentage > 0 ? '+' : ''}{variation.variation_percentage}%
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  {variation.invoice_reference || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
