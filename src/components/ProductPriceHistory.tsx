import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { format } from 'date-fns';

interface PriceHistoryRecord {
  id: string;
  product_id: string;
  product_name: string;
  product_category: string;
  supplier_name: string;
  unit_name: string;
  unit_price: number;
  quantity: number;
  unit: string;
  recorded_at: string;
  recorded_by_name: string;
  invoice_reference: string;
  notes: string;
}

interface ProductPriceHistoryProps {
  selectedProductId?: string;
  selectedSupplierId?: string;
  selectedUnitId?: string;
  startDate?: string;
  endDate?: string;
}

export default function ProductPriceHistory({
  selectedProductId,
  selectedSupplierId,
  selectedUnitId,
  startDate,
  endDate,
}: ProductPriceHistoryProps) {
  const [history, setHistory] = useState<PriceHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, [selectedProductId, selectedSupplierId, selectedUnitId, startDate, endDate]);

  const loadHistory = async () => {
    try {
      setLoading(true);

      let query = supabase
        .from('product_price_history')
        .select(`
          id,
          product_id,
          unit_price,
          quantity,
          unit,
          recorded_at,
          supplier_id,
          unit_id,
          recorded_by,
          receipt_id,
          products(name, category_id),
          suppliers(name),
          units(name),
          profiles(full_name),
          goods_receipts(invoice_reference)
        `)
        .order('recorded_at', { ascending: false });

      if (selectedProductId) {
        query = query.eq('product_id', selectedProductId);
      }

      if (selectedSupplierId) {
        query = query.eq('supplier_id', selectedSupplierId);
      }

      if (selectedUnitId) {
        query = query.eq('unit_id', selectedUnitId);
      }

      if (startDate) {
        query = query.gte('recorded_at', startDate);
      }

      if (endDate) {
        query = query.lte('recorded_at', endDate);
      }

      const { data, error } = await query;

      if (error) throw error;

      const formattedData: PriceHistoryRecord[] = (data || []).map((record: any) => ({
        id: record.id,
        product_id: record.product_id,
        product_name: record.products?.name || 'N/A',
        product_category: '',
        supplier_name: record.suppliers?.name || 'N/A',
        unit_name: record.units?.name || 'N/A',
        unit_price: record.unit_price,
        quantity: record.quantity,
        unit: record.unit,
        recorded_at: record.recorded_at,
        recorded_by_name: record.profiles?.full_name || 'N/A',
        invoice_reference: record.goods_receipts?.invoice_reference || '',
        notes: '',
      }));

      setHistory(formattedData);
    } catch (error) {
      console.error('Error loading price history:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPriceComparison = (currentPrice: number, index: number) => {
    if (index === history.length - 1) return null;

    const previousPrice = history[index + 1]?.unit_price;
    if (!previousPrice) return null;

    const diff = currentPrice - previousPrice;
    const percentChange = ((diff / previousPrice) * 100).toFixed(2);

    if (diff > 0) {
      return (
        <span className="flex items-center text-red-600 text-sm">
          <TrendingUp className="w-4 h-4 mr-1" />
          +{percentChange}%
        </span>
      );
    } else if (diff < 0) {
      return (
        <span className="flex items-center text-green-600 text-sm">
          <TrendingDown className="w-4 h-4 mr-1" />
          {percentChange}%
        </span>
      );
    } else {
      return (
        <span className="flex items-center text-gray-500 text-sm">
          <Minus className="w-4 h-4 mr-1" />
          0%
        </span>
      );
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        Nenhum histórico de preços encontrado
      </div>
    );
  }

  return (
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
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Data
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Quantidade
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Preço Unitário
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Variação
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Fatura
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Registado Por
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {history.map((record, index) => (
            <tr key={record.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                {record.product_name}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                {record.supplier_name}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                {record.unit_name}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                {format(new Date(record.recorded_at), 'dd/MM/yyyy HH:mm')}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-right">
                {record.quantity ? `${record.quantity} ${record.unit}` : '-'}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">
                €{record.unit_price.toFixed(2)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-right">
                {getPriceComparison(record.unit_price, index)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                {record.invoice_reference || '-'}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                {record.recorded_by_name}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
