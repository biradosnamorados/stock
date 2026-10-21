import { useEffect, useState, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Plus, ClipboardCheck, Eye, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

interface Product {
  id: string;
  code: string;
  name: string;
  unit: string;
}

interface Unit {
  id: string;
  name: string;
}

interface StockCountLine {
  id?: string;
  product_id: string;
  system_quantity: number;
  counted_quantity: number | null;
  variance: number | null;
  variance_percentage: number | null;
  unit: string;
  notes: string;
  products?: {
    code: string;
    name: string;
    unit: string;
  };
}

interface StockCount {
  id: string;
  count_number: string;
  status: string;
  count_type: string;
  scheduled_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  units: {
    name: string;
  };
  profiles?: {
    full_name: string | null;
    email: string;
  };
  stock_count_lines: StockCountLine[];
}

export default function StockCounts() {
  const { profile } = useAuth();
  const [counts, setCounts] = useState<StockCount[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedCount, setSelectedCount] = useState<StockCount | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    count_type: 'full' as 'full' | 'partial' | 'cycle',
    scheduled_date: '',
    selected_products: [] as string[],
    unit_id: profile?.unit_id || '',
  });

  const [countingData, setCountingData] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    loadData();
  }, [profile]);

  const loadData = async () => {
    try {
      let countsQuery = supabase
        .from('stock_counts')
        .select(`
          *,
          units(name),
          profiles!stock_counts_created_by_fkey(full_name, email),
          stock_count_lines(
            *,
            products(code, name, unit)
          )
        `)
        .order('created_at', { ascending: false });

      if (profile?.role !== 'Admin') {
        countsQuery = countsQuery.eq('unit_id', profile?.unit_id);
      }

      const queries = [
        countsQuery,
        supabase
          .from('products')
          .select('id, code, name, unit')
          .eq('active', true)
          .order('name'),
      ];

      if (profile?.role === 'Admin') {
        queries.push(
          supabase
            .from('units')
            .select('id, name')
            .order('name')
        );
      }

      const results = await Promise.all(queries);
      const [countsRes, productsRes, unitsRes] = results;

      if (countsRes.data) setCounts(countsRes.data as StockCount[]);
      if (productsRes.data) setProducts(productsRes.data as Product[]);
      if (unitsRes?.data) setUnits(unitsRes.data as Unit[]);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getCurrentStock = async (productId: string, unitId: string): Promise<number> => {
    const { data: cdpStock } = await supabase
      .from('packaged_units')
      .select('weight')
      .eq('product_id', productId)
      .eq('location_id', unitId)
      .in('status', ['in_stock', 'reserved']);

    const { data: purchasedStock } = await supabase
      .from('purchased_product_stock')
      .select('quantity')
      .eq('product_id', productId)
      .eq('unit_id', unitId)
      .single();

    const cdpTotal = cdpStock?.reduce((sum, pkg) => sum + (pkg.weight || 0), 0) || 0;
    const purchasedTotal = purchasedStock?.quantity || 0;

    return cdpTotal + purchasedTotal;
  };

  const handleCreateCount = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const { data: countNumber } = await supabase
        .rpc('generate_stock_count_number');

      const { data: newCount, error: countError } = await supabase
        .from('stock_counts')
        .insert({
          count_number: countNumber,
          unit_id: formData.unit_id,
          status: 'draft',
          count_type: formData.count_type,
          scheduled_date: formData.scheduled_date || null,
          created_by: profile?.id,
        })
        .select()
        .single();

      if (countError) throw countError;

      const productsToCount = formData.count_type === 'full'
        ? products
        : products.filter(p => formData.selected_products.includes(p.id));

      const lines = await Promise.all(
        productsToCount.map(async (product) => {
          const systemQty = await getCurrentStock(product.id, formData.unit_id);
          return {
            stock_count_id: newCount.id,
            product_id: product.id,
            system_quantity: systemQty,
            unit: product.unit,
          };
        })
      );

      const { error: linesError } = await supabase
        .from('stock_count_lines')
        .insert(lines);

      if (linesError) throw linesError;

      await supabase.from('audit_logs').insert({
        user_id: profile?.id,
        action: 'create_stock_count',
        entity: 'stock_counts',
        entity_id: newCount.id,
        changes: { count_type: formData.count_type, products_count: lines.length },
      });

      setFormData({
        count_type: 'full',
        scheduled_date: '',
        selected_products: [],
        unit_id: profile?.unit_id || '',
      });
      setShowCreateForm(false);
      loadData();
    } catch (err: any) {
      console.error('Error creating stock count:', err);
      alert(err.message || 'Erro ao criar contagem');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartCount = async (countId: string) => {
    try {
      const { error } = await supabase
        .from('stock_counts')
        .update({ status: 'active', started_at: new Date().toISOString() })
        .eq('id', countId);

      if (error) throw error;
      loadData();
    } catch (err: any) {
      console.error('Error starting count:', err);
      alert(err.message);
    }
  };

  const handleSaveCountedQuantity = async (lineId: string, productId: string, countedQty: string) => {
    try {
      const { error } = await supabase
        .from('stock_count_lines')
        .update({
          counted_quantity: parseFloat(countedQty),
          counted_at: new Date().toISOString(),
          counted_by: profile?.id,
        })
        .eq('id', lineId);

      if (error) throw error;
      loadData();
    } catch (err: any) {
      console.error('Error saving counted quantity:', err);
    }
  };

  const handleCompleteCount = async (countId: string) => {
    if (!confirm('Tem a certeza que deseja concluir esta contagem?')) return;

    try {
      const { error } = await supabase
        .from('stock_counts')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', countId);

      if (error) throw error;

      await supabase.from('audit_logs').insert({
        user_id: profile?.id,
        action: 'complete_stock_count',
        entity: 'stock_counts',
        entity_id: countId,
      });

      setSelectedCount(null);
      loadData();
    } catch (err: any) {
      console.error('Error completing count:', err);
      alert(err.message);
    }
  };

  const handleReviewCount = async (countId: string) => {
    if (!confirm('Tem a certeza que deseja marcar esta contagem como revista?')) return;

    try {
      const { error } = await supabase
        .from('stock_counts')
        .update({
          status: 'reviewed',
          reviewed_at: new Date().toISOString(),
          reviewed_by: profile?.id,
        })
        .eq('id', countId);

      if (error) throw error;
      loadData();
    } catch (err: any) {
      console.error('Error reviewing count:', err);
      alert(err.message);
    }
  };

  const handleDeleteCount = async (countId: string) => {
    if (!confirm('Tem a certeza que deseja eliminar esta contagem? Esta ação não pode ser revertida.')) return;

    try {
      const { error } = await supabase
        .from('stock_counts')
        .delete()
        .eq('id', countId);

      if (error) throw error;

      await supabase.from('audit_logs').insert({
        user_id: profile?.id,
        action: 'delete_stock_count',
        entity: 'stock_counts',
        entity_id: countId,
      });

      loadData();
    } catch (err: any) {
      console.error('Error deleting count:', err);
      alert(err.message || 'Erro ao eliminar contagem');
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      draft: 'bg-slate-100 text-slate-700',
      active: 'bg-blue-50 text-blue-700',
      completed: 'bg-green-50 text-green-700',
      reviewed: 'bg-purple-50 text-purple-700',
      cancelled: 'bg-red-50 text-red-700',
    };

    const labels = {
      draft: 'Rascunho',
      active: 'Activa',
      completed: 'Concluída',
      reviewed: 'Revista',
      cancelled: 'Cancelada',
    };

    return (
      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${styles[status as keyof typeof styles]}`}>
        {labels[status as keyof typeof labels]}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">A carregar contagens...</p>
        </div>
      </div>
    );
  }

  if (selectedCount) {
    const isActive = selectedCount.status === 'active';
    const isCompleted = selectedCount.status === 'completed';

    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => setSelectedCount(null)}
            className="text-blue-600 hover:text-blue-700 mb-4"
          >
            ← Voltar à lista
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">
                Contagem {selectedCount.count_number}
              </h1>
              <p className="text-slate-600 mt-1">
                {selectedCount.units.name} - {getStatusBadge(selectedCount.status)}
              </p>
            </div>
            <div className="flex space-x-3">
              {isActive && (
                <button
                  onClick={() => handleCompleteCount(selectedCount.id)}
                  className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition"
                >
                  <CheckCircle className="w-5 h-5" />
                  <span>Concluir Contagem</span>
                </button>
              )}
              {isCompleted && profile?.role === 'Admin' && (
                <button
                  onClick={() => handleReviewCount(selectedCount.id)}
                  className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition"
                >
                  <CheckCircle className="w-5 h-5" />
                  <span>Marcar como Revista</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Produto</th>
                  <th className="text-right px-6 py-4 text-sm font-semibold text-slate-700">Stock Sistema</th>
                  <th className="text-right px-6 py-4 text-sm font-semibold text-slate-700">Qtd Contada</th>
                  <th className="text-right px-6 py-4 text-sm font-semibold text-slate-700">Diferença</th>
                  <th className="text-right px-6 py-4 text-sm font-semibold text-slate-700">Variação %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {selectedCount.stock_count_lines.map((line) => {
                  const variance = line.variance || 0;
                  const hasVariance = variance !== 0;

                  return (
                    <tr key={line.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-slate-800">{line.products?.name}</p>
                          <p className="text-sm text-slate-500">{line.products?.code}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm text-slate-600">
                          {line.system_quantity} {line.unit}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {isActive ? (
                          <input
                            type="number"
                            step="1"
                            value={countingData[line.id!] || line.counted_quantity || ''}
                            onChange={(e) => setCountingData({ ...countingData, [line.id!]: e.target.value })}
                            onBlur={(e) => {
                              if (e.target.value) {
                                handleSaveCountedQuantity(line.id!, line.product_id, e.target.value);
                              }
                            }}
                            className="w-32 ml-auto px-3 py-2 border border-slate-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="0"
                          />
                        ) : (
                          <div className="text-right">
                            <span className="text-sm text-slate-800">
                              {line.counted_quantity !== null ? `${line.counted_quantity} ${line.unit}` : '-'}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {line.counted_quantity !== null ? (
                          <span className={`text-sm font-medium ${
                            hasVariance
                              ? variance > 0
                                ? 'text-green-600'
                                : 'text-red-600'
                              : 'text-slate-600'
                          }`}>
                            {variance > 0 ? '+' : ''}{variance.toFixed(3)} {line.unit}
                          </span>
                        ) : (
                          <span className="text-sm text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {line.variance_percentage !== null ? (
                          <span className={`text-sm font-medium ${
                            Math.abs(line.variance_percentage) > 0
                              ? line.variance_percentage > 0
                                ? 'text-green-600'
                                : 'text-red-600'
                              : 'text-slate-600'
                          }`}>
                            {line.variance_percentage > 0 ? '+' : ''}
                            {line.variance_percentage.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-sm text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Contagem de Stock</h1>
          <p className="text-slate-600 mt-2">Gestão de inventário físico</p>
        </div>
        {profile?.role === 'Admin' && (
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
          >
            <Plus className="w-5 h-5" />
            <span>Nova Contagem</span>
          </button>
        )}
      </div>

      {showCreateForm && profile?.role === 'Admin' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Nova Contagem de Stock</h2>

          <form onSubmit={handleCreateCount} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Unidade *
                </label>
                <select
                  required
                  value={formData.unit_id}
                  onChange={(e) => setFormData({ ...formData, unit_id: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Selecione a unidade</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Tipo de Contagem
                </label>
                <select
                  value={formData.count_type}
                  onChange={(e) => setFormData({ ...formData, count_type: e.target.value as any })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="full">Contagem Completa</option>
                  <option value="partial">Contagem Parcial</option>
                  <option value="cycle">Contagem Cíclica</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Data Agendada
                </label>
                <input
                  type="date"
                  value={formData.scheduled_date}
                  onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {formData.count_type !== 'full' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Produtos a Contar
                </label>
                <div className="max-h-48 overflow-y-auto border border-slate-300 rounded-lg p-3">
                  {products.map((product) => (
                    <label key={product.id} className="flex items-center space-x-2 py-1 hover:bg-slate-50 px-2 rounded">
                      <input
                        type="checkbox"
                        checked={formData.selected_products.includes(product.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({
                              ...formData,
                              selected_products: [...formData.selected_products, product.id]
                            });
                          } else {
                            setFormData({
                              ...formData,
                              selected_products: formData.selected_products.filter(id => id !== product.id)
                            });
                          }
                        }}
                        className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-700">
                        {product.code} - {product.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex space-x-3 pt-4 border-t border-slate-200">
              <button
                type="submit"
                disabled={submitting}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition disabled:opacity-50"
              >
                {submitting ? 'A criar...' : 'Criar Contagem'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setFormData({
                    count_type: 'full',
                    scheduled_date: '',
                    selected_products: [],
                    unit_id: profile?.unit_id || '',
                  });
                }}
                className="px-6 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Número</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Tipo</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Estado</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Data Criação</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Produtos</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {counts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <ClipboardCheck className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                    <p>Ainda não há contagens de stock</p>
                  </td>
                </tr>
              ) : (
                counts.map((count) => (
                  <tr key={count.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm font-medium text-slate-800">
                        {count.count_number}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-600 capitalize">
                        {count.count_type === 'full' ? 'Completa' : count.count_type === 'partial' ? 'Parcial' : 'Cíclica'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(count.status)}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-600">
                        {format(new Date(count.created_at), 'dd/MM/yyyy')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-600">
                        {count.stock_count_lines.length} produtos
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        {count.status === 'draft' && profile?.role === 'Admin' && (
                          <button
                            onClick={() => handleStartCount(count.id)}
                            className="flex items-center space-x-1 text-blue-600 hover:bg-blue-50 px-3 py-1 rounded-lg transition text-sm"
                          >
                            <CheckCircle className="w-4 h-4" />
                            <span>Iniciar</span>
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedCount(count)}
                          className="flex items-center space-x-1 text-slate-600 hover:bg-slate-100 px-3 py-1 rounded-lg transition text-sm"
                        >
                          <Eye className="w-4 h-4" />
                          <span>Ver</span>
                        </button>
                        {count.status === 'draft' && profile?.role === 'Admin' && (
                          <button
                            onClick={() => handleDeleteCount(count.id)}
                            className="flex items-center space-x-1 text-red-600 hover:bg-red-50 px-3 py-1 rounded-lg transition text-sm"
                          >
                            <XCircle className="w-4 h-4" />
                            <span>Eliminar</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
