import { useEffect, useState, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Plus, Package, Calendar, AlertCircle, Trash2, Eye } from 'lucide-react';
import { format } from 'date-fns';
import BatchTrackingView from '../components/BatchTrackingView';

interface Product {
  id: string;
  code: string;
  name: string;
  shelf_life_days: number | null;
}

interface ProductionBatch {
  id: string;
  batch_code: string;
  production_date: string;
  expiry_date: string | null;
  status: string;
  notes: string | null;
  product_id: string;
  products: Product;
  created_at: string;
}

export default function Production() {
  const { profile } = useAuth();
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedBatchNumber, setSelectedBatchNumber] = useState<string>('');

  const [formData, setFormData] = useState({
    product_id: '',
    production_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, [profile]);

  const loadData = async () => {
    try {
      const [batchesRes, productsRes] = await Promise.all([
        supabase
          .from('production_batches')
          .select('*, products(id, code, name, shelf_life_days)')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('products')
          .select('id, code, name, shelf_life_days')
          .eq('product_type', 'cdp_produced')
          .eq('active', true)
          .order('name'),
      ]);

      if (batchesRes.data) setBatches(batchesRes.data as ProductionBatch[]);
      if (productsRes.data) setProducts(productsRes.data);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateBatchCode = (productCode: string, productionDate: string): string => {
    const date = new Date(productionDate);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    const sequence = '01';
    return `${productCode}-${day}${month}${year}-${sequence}`;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const product = products.find(p => p.id === formData.product_id);
      if (!product) {
        setError('Por favor, selecione um produto');
        setSubmitting(false);
        return;
      }

      const batchCode = generateBatchCode(product.code, formData.production_date);

      let expiryDate = null;
      if (product.shelf_life_days) {
        const prodDate = new Date(formData.production_date);
        const expDate = new Date(prodDate);
        expDate.setDate(expDate.getDate() + product.shelf_life_days);
        expiryDate = expDate.toISOString().split('T')[0];
      }

      const { error: insertError } = await supabase
        .from('production_batches')
        .insert({
          batch_code: batchCode,
          product_id: formData.product_id,
          production_date: formData.production_date,
          expiry_date: expiryDate,
          location_id: profile?.unit_id,
          created_by: profile?.id,
          notes: formData.notes || null,
          status: 'active',
        });

      if (insertError) throw insertError;

      await supabase.from('audit_logs').insert({
        user_id: profile?.id,
        action: 'create_production_batch',
        entity: 'production_batches',
        changes: { batch_code: batchCode },
      });

      setFormData({
        product_id: '',
        production_date: new Date().toISOString().split('T')[0],
        notes: '',
      });
      setShowForm(false);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Falha ao criar lote');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (batchId: string, batchCode: string) => {
    const confirmMsg = `Tem a certeza que deseja eliminar o lote "${batchCode}"?\n\nATENÇÃO: Esta ação irá eliminar permanentemente:\n- Todas as embalagens criadas a partir deste lote\n- Todo o histórico associado\n\nEsta ação não pode ser desfeita!`;

    if (!confirm(confirmMsg)) return;

    try {
      const { error } = await supabase
        .from('production_batches')
        .delete()
        .eq('id', batchId);

      if (error) {
        console.error('Erro ao eliminar lote:', error);
        alert('Erro ao eliminar lote: ' + error.message);
      } else {
        await loadData();
      }
    } catch (err) {
      console.error('Erro inesperado:', err);
      alert('Erro inesperado ao eliminar lote');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">A carregar dados de produção...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Lotes de Produção</h1>
          <p className="text-slate-600 mt-2">Criar e gerir lotes de produção</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
        >
          <Plus className="w-5 h-5" />
          <span>Novo Lote</span>
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Criar Lote de Produção</h2>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Produto
              </label>
              <select
                required
                value={formData.product_id}
                onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Selecione um produto</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.code} - {product.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Data de Produção
              </label>
              <input
                type="date"
                required
                value={formData.production_date}
                onChange={(e) => setFormData({ ...formData, production_date: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Notas (opcional)
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Notas adicionais..."
              />
            </div>

            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition disabled:opacity-50"
              >
                {submitting ? 'A criar...' : 'Criar Lote'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
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
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Código do Lote</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Produto</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Data de Produção</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Data de Validade</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Estado</th>
                <th className="text-right px-6 py-4 text-sm font-semibold text-slate-700">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <Package className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                    <p>Ainda não há lotes de produção</p>
                    <p className="text-sm mt-1">Crie o seu primeiro lote para começar</p>
                  </td>
                </tr>
              ) : (
                batches.map((batch) => (
                  <tr key={batch.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm font-medium text-slate-800">
                        {batch.batch_code}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-slate-800">{batch.products.name}</p>
                        <p className="text-sm text-slate-500">{batch.products.code}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2 text-sm text-slate-600">
                        <Calendar className="w-4 h-4" />
                        <span>{format(new Date(batch.production_date), 'dd/MM/yyyy')}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {batch.expiry_date ? (
                        <span className="text-sm text-slate-600">
                          {format(new Date(batch.expiry_date), 'dd/MM/yyyy')}
                        </span>
                      ) : (
                        <span className="text-sm text-slate-400">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                        batch.status === 'active'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {batch.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setSelectedBatchId(batch.id);
                            setSelectedBatchNumber(batch.batch_code);
                          }}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="Ver Rastreamento"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(batch.id, batch.batch_code)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedBatchId && (
        <BatchTrackingView
          batchId={selectedBatchId}
          batchNumber={selectedBatchNumber}
          onClose={() => {
            setSelectedBatchId(null);
            setSelectedBatchNumber('');
          }}
        />
      )}
    </div>
  );
}
