import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Package, Plus, X, CreditCard as Edit, Trash2, Hash, RefreshCw } from 'lucide-react';

interface Product {
  id: string;
  code: string;
  name: string;
  unit: string;
  shelf_life_days: number | null;
  storage_type: string | null;
  produced_in_cdp: boolean;
  purchasable: boolean;
  active: boolean;
  packaging_unit_type: string;
  standard_package_quantity: number;
  allow_remainder_package: boolean;
  product_type: 'cdp_produced' | 'purchased' | 'consumable';
  purchase_unit: string | null;
  purchase_unit_quantity: number;
  description: string | null;
}

interface PurchaseConfig {
  id?: string;
  purchase_unit: string;
  purchase_unit_quantity: string;
  purchase_unit_measure: string;
  is_default: boolean;
}

interface ProductFormData {
  code: string;
  codeSeries: 'COZ' | 'PROD' | 'custom';
  name: string;
  unit: string;
  shelf_life_days: string;
  storage_type: string;
  product_type: 'cdp_produced' | 'purchased' | 'consumable';
  description: string;
  packaging_unit_type: string;
  standard_package_quantity: string;
  allow_remainder_package: boolean;
  source_type: string;
  requires_expiry: boolean;
  is_recipe_input: boolean;
  is_recipe_output: boolean;
  tracking_level: string;
}

const MEASURE_OPTIONS = [
  { value: 'un', label: 'un' },
  { value: 'kg', label: 'kg' },
  { value: 'g', label: 'g' },
  { value: 'L', label: 'L' },
  { value: 'ml', label: 'ml' },
];

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [purchaseConfigs, setPurchaseConfigs] = useState<PurchaseConfig[]>([]);
  const [nextCodeLoading, setNextCodeLoading] = useState(false);
  const [formData, setFormData] = useState<ProductFormData>({
    code: '',
    codeSeries: 'COZ',
    name: '',
    unit: 'kg',
    shelf_life_days: '',
    storage_type: 'ambient',
    product_type: 'consumable',
    description: '',
    packaging_unit_type: 'kg',
    standard_package_quantity: '1',
    allow_remainder_package: true,
    source_type: 'cdo_purchased',
    requires_expiry: false,
    is_recipe_input: false,
    is_recipe_output: false,
    tracking_level: 'simple',
  });

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name');

      if (error) {
        console.error('Erro ao carregar produtos:', error);
      } else if (data) {
        setProducts(data);
      }
    } catch (err) {
      console.error('Erro inesperado:', err);
    } finally {
      setLoading(false);
    }
  };

  const getNextCode = useCallback(async (series: 'COZ' | 'PROD'): Promise<string> => {
    const { data } = await supabase
      .from('products')
      .select('code')
      .like('code', `${series}%`)
      .order('code', { ascending: false })
      .limit(20);

    let maxNum = 0;
    (data || []).forEach((p: { code: string }) => {
      const num = parseInt(p.code.replace(series, ''), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    });

    const next = maxNum + 1;
    const padded = series === 'COZ' ? String(next).padStart(3, '0') : String(next).padStart(3, '0');
    return `${series}${padded}`;
  }, []);

  const handleSeriesChange = async (series: 'COZ' | 'PROD' | 'custom') => {
    if (series === 'custom') {
      setFormData(prev => ({ ...prev, codeSeries: 'custom', code: '' }));
      return;
    }
    setNextCodeLoading(true);
    const next = await getNextCode(series);
    setFormData(prev => ({ ...prev, codeSeries: series, code: next }));
    setNextCodeLoading(false);
  };

  const refreshNextCode = async () => {
    if (formData.codeSeries === 'custom') return;
    setNextCodeLoading(true);
    const next = await getNextCode(formData.codeSeries);
    setFormData(prev => ({ ...prev, code: next }));
    setNextCodeLoading(false);
  };

  const addConfigRow = () => {
    setPurchaseConfigs([
      ...purchaseConfigs,
      {
        purchase_unit: '',
        purchase_unit_quantity: '1',
        purchase_unit_measure: formData.unit || 'un',
        is_default: purchaseConfigs.length === 0,
      },
    ]);
  };

  const updateConfigRow = (index: number, field: keyof PurchaseConfig, value: any) => {
    const next = [...purchaseConfigs];
    if (field === 'is_default' && value === true) {
      next.forEach((c, i) => { c.is_default = i === index; });
    } else {
      (next[index] as any)[field] = value;
    }
    setPurchaseConfigs(next);
  };

  const removeConfigRow = (index: number) => {
    const next = purchaseConfigs.filter((_, i) => i !== index);
    if (next.length > 0 && !next.some(c => c.is_default)) {
      next[0].is_default = true;
    }
    setPurchaseConfigs(next);
  };

  const saveConfigs = async (productId: string) => {
    const existing = await supabase
      .from('product_purchase_configs')
      .select('id')
      .eq('product_id', productId);

    const keepIds = purchaseConfigs.filter(c => c.id).map(c => c.id);
    const toDelete = (existing.data || []).filter(e => !keepIds.includes(e.id)).map(e => e.id);

    if (toDelete.length > 0) {
      await supabase.from('product_purchase_configs').delete().in('id', toDelete);
    }

    const rows = purchaseConfigs
      .filter(c => c.purchase_unit.trim() !== '')
      .map(c => ({
        id: c.id,
        product_id: productId,
        purchase_unit: c.purchase_unit.trim(),
        purchase_unit_quantity: parseFloat(c.purchase_unit_quantity) || 1,
        purchase_unit_measure: c.purchase_unit_measure || 'un',
        is_default: c.is_default,
        active: true,
      }));

    for (const row of rows) {
      if (row.id) {
        await supabase
          .from('product_purchase_configs')
          .update({
            purchase_unit: row.purchase_unit,
            purchase_unit_quantity: row.purchase_unit_quantity,
            purchase_unit_measure: row.purchase_unit_measure,
            is_default: row.is_default,
            active: row.active,
          })
          .eq('id', row.id);
      } else {
        await supabase.from('product_purchase_configs').insert({
          product_id: row.product_id,
          purchase_unit: row.purchase_unit,
          purchase_unit_quantity: row.purchase_unit_quantity,
          purchase_unit_measure: row.purchase_unit_measure,
          is_default: row.is_default,
          active: row.active,
        });
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const defaultConfig = purchaseConfigs.find(c => c.is_default) || purchaseConfigs[0];

      const isBuyable = formData.product_type === 'purchased' || formData.product_type === 'consumable';
      const isCdp = formData.product_type === 'cdp_produced';

      const productData = {
        code: formData.code,
        name: formData.name,
        unit: formData.unit,
        shelf_life_days: formData.shelf_life_days ? parseInt(formData.shelf_life_days) : null,
        storage_type: formData.storage_type,
        product_type: formData.product_type,
        purchase_unit: isBuyable ? (defaultConfig?.purchase_unit || null) : null,
        purchase_unit_quantity: isBuyable ? (defaultConfig ? parseFloat(defaultConfig.purchase_unit_quantity) || 1 : 1) : 1,
        description: formData.description || null,
        produced_in_cdp: isCdp,
        purchasable: isBuyable,
        requires_batch: isCdp || formData.tracking_level === 'full',
        packaging_unit_type: isCdp ? formData.packaging_unit_type : null,
        standard_package_quantity: isCdp ? (formData.standard_package_quantity ? parseFloat(formData.standard_package_quantity) : 1) : null,
        allow_remainder_package: isCdp ? formData.allow_remainder_package : null,
        source_type: formData.source_type,
        requires_expiry: formData.requires_expiry,
        is_recipe_input: formData.product_type === 'consumable' ? false : formData.is_recipe_input,
        is_recipe_output: formData.product_type === 'consumable' ? false : formData.is_recipe_output,
        tracking_level: formData.tracking_level,
      };

      let savedProductId: string | null = null;

      if (editingProduct) {
        const { data, error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id)
          .select();

        if (error) {
          alert('Erro ao atualizar produto: ' + error.message);
        } else if (data) {
          savedProductId = editingProduct.id;
          setProducts(products.map(p => p.id === editingProduct.id ? data[0] : p));
        }
      } else {
        const { data, error } = await supabase
          .from('products')
          .insert([{ ...productData, active: true }])
          .select();

        if (error) {
          alert('Erro ao criar produto: ' + error.message);
        } else if (data) {
          savedProductId = data[0].id;
          setProducts([...products, ...data]);
        }
      }

      if (savedProductId && (formData.product_type === 'purchased' || formData.product_type === 'consumable')) {
        await saveConfigs(savedProductId);
      }

      if (savedProductId) {
        resetForm();
      }
    } catch (err: any) {
      alert('Erro inesperado ao guardar produto: ' + (err.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (product: any) => {
    setEditingProduct(product);
    // Detect series from existing code
    const codeSeries: 'COZ' | 'PROD' | 'custom' =
      product.code.startsWith('COZ') ? 'COZ' :
      product.code.startsWith('PROD') ? 'PROD' :
      'custom';

    setFormData({
      code: product.code,
      codeSeries,
      name: product.name,
      unit: product.unit,
      shelf_life_days: product.shelf_life_days?.toString() || '',
      storage_type: product.storage_type || 'refrigerated',
      product_type: product.product_type || 'purchased',
      description: product.description || '',
      packaging_unit_type: product.packaging_unit_type || 'kg',
      standard_package_quantity: product.standard_package_quantity?.toString() || '1',
      allow_remainder_package: product.allow_remainder_package,
      source_type: product.source_type || 'cdo_purchased',
      requires_expiry: product.requires_expiry !== undefined ? product.requires_expiry : true,
      is_recipe_input: product.is_recipe_input || false,
      is_recipe_output: product.is_recipe_output || false,
      tracking_level: product.tracking_level || 'full',
    });

    if (product.product_type === 'purchased' || product.product_type === 'consumable') {
      const { data } = await supabase
        .from('product_purchase_configs')
        .select('*')
        .eq('product_id', product.id)
        .eq('active', true)
        .order('is_default', { ascending: false });

      setPurchaseConfigs(
        (data || []).map(c => ({
          id: c.id,
          purchase_unit: c.purchase_unit,
          purchase_unit_quantity: c.purchase_unit_quantity?.toString() || '1',
          purchase_unit_measure: c.purchase_unit_measure || 'un',
          is_default: c.is_default,
        }))
      );
    } else {
      setPurchaseConfigs([]);
    }

    setShowModal(true);
  };

  const handleDelete = async (id: string, productName: string) => {
    const confirmMsg = `Tem a certeza que deseja eliminar o produto "${productName}"?\n\nATENÇÃO: Esta ação irá eliminar permanentemente:\n- Todos os lotes de produção\n- Todas as embalagens\n- Todas as linhas de encomenda associadas\n- Todo o histórico de preços\n\nEsta ação não pode ser desfeita!`;

    if (!confirm(confirmMsg)) return;

    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) {
        alert('Erro ao eliminar produto: ' + error.message);
      } else {
        setProducts(products.filter(p => p.id !== id));
      }
    } catch (err) {
      alert('Erro inesperado ao eliminar produto');
    }
  };

  const resetForm = () => {
    setShowModal(false);
    setEditingProduct(null);
    setPurchaseConfigs([]);
    setFormData({
      code: '',
      codeSeries: 'COZ',
      name: '',
      unit: 'kg',
      shelf_life_days: '',
      storage_type: 'ambient',
      product_type: 'consumable',
      description: '',
      packaging_unit_type: 'kg',
      standard_package_quantity: '1',
      allow_remainder_package: true,
      source_type: 'cdo_purchased',
      requires_expiry: false,
      is_recipe_input: false,
      is_recipe_output: false,
      tracking_level: 'simple',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">A carregar produtos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Produtos</h1>
          <p className="text-slate-600 mt-2">Gerir catálogo de produtos</p>
        </div>
        <button
          onClick={async () => {
            setShowModal(true);
            // Auto-fetch next COZ code when opening for new product
            setNextCodeLoading(true);
            const next = await getNextCode('COZ');
            setFormData(prev => ({ ...prev, codeSeries: 'COZ', code: next }));
            setNextCodeLoading(false);
          }}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
        >
          <Plus className="w-5 h-5" />
          <span>Novo Produto</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Código</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Nome</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Tipo</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Unidade</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Armazenamento</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Estado</th>
                <th className="text-right px-6 py-4 text-sm font-semibold text-slate-700">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    <Package className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                    <p>Ainda não há produtos</p>
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm font-medium text-slate-800">{product.code}</span>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-800">{product.name}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                        product.product_type === 'cdp_produced'
                          ? 'bg-blue-50 text-blue-700'
                          : product.product_type === 'consumable'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-green-50 text-green-700'
                      }`}>
                        {product.product_type === 'cdp_produced' ? 'CDP' : product.product_type === 'consumable' ? 'Consumivel' : 'Comprado'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{product.unit}</td>
                    <td className="px-6 py-4">
                      {product.storage_type && (
                        <span className="inline-flex px-2 py-1 rounded text-xs font-medium bg-slate-100 text-slate-700 capitalize">
                          {product.storage_type}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                        product.active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {product.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleEdit(product)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(product.id, product.name)}
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

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-semibold text-slate-800">
                {editingProduct ? 'Editar Produto' : 'Novo Produto'}
              </h2>
              <button onClick={resetForm} className="p-2 hover:bg-slate-100 rounded-lg transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* ── Code series selector ── */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <label className="block text-sm font-semibold text-slate-700">Série do Código *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['COZ', 'PROD', 'custom'] as const).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => !editingProduct && handleSeriesChange(s)}
                      disabled={!!editingProduct}
                      className={`py-2.5 px-3 rounded-lg border-2 text-sm font-semibold transition ${
                        formData.codeSeries === s
                          ? s === 'COZ'
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : s === 'PROD'
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                              : 'border-slate-500 bg-slate-100 text-slate-700'
                          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                      } disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      {s === 'COZ' ? 'COZ — Cozinha' : s === 'PROD' ? 'PROD — Sala' : 'Personalizado'}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Código do Produto *
                  </label>
                  {formData.codeSeries !== 'custom' ? (
                    <div className="flex items-center gap-2">
                      <div className={`flex-1 flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 font-mono font-bold text-lg ${
                        formData.codeSeries === 'COZ' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      }`}>
                        <Hash className="w-4 h-4 opacity-60" />
                        {nextCodeLoading ? (
                          <span className="text-sm font-normal text-slate-400 animate-pulse">A calcular...</span>
                        ) : (
                          formData.code
                        )}
                      </div>
                      {!editingProduct && (
                        <button
                          type="button"
                          onClick={refreshNextCode}
                          disabled={nextCodeLoading}
                          title="Atualizar código"
                          className="p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 transition"
                        >
                          <RefreshCw className={`w-4 h-4 ${nextCodeLoading ? 'animate-spin' : ''}`} />
                        </button>
                      )}
                    </div>
                  ) : (
                    <input
                      type="text"
                      required
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono font-semibold uppercase"
                      placeholder="Ex: SF, MA, BRO..."
                    />
                  )}
                  {formData.codeSeries !== 'custom' && !editingProduct && (
                    <p className="text-xs text-slate-400 mt-1">
                      Código gerado automaticamente com base nos produtos existentes.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Nome *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Nome do produto"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Unidade Base *</label>
                  <select
                    required
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="kg">Quilograma (kg)</option>
                    <option value="g">Grama (g)</option>
                    <option value="L">Litro (L)</option>
                    <option value="ml">Mililitro (ml)</option>
                    <option value="units">Unidades</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Validade (dias)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.shelf_life_days}
                    onChange={(e) => setFormData({ ...formData, shelf_life_days: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Ex: 30"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de Armazenamento *</label>
                  <select
                    required
                    value={formData.storage_type}
                    onChange={(e) => setFormData({ ...formData, storage_type: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="refrigerated">Refrigerado</option>
                    <option value="frozen">Congelado</option>
                    <option value="ambient">Ambiente</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200">
                <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de Produto *</label>
                <select
                  required
                  value={formData.product_type}
                  onChange={(e) => {
                    const pt = e.target.value as ProductFormData['product_type'];
                    setFormData({
                      ...formData,
                      product_type: pt,
                      storage_type: pt === 'consumable' ? 'ambient' : pt === 'refrigerated' ? 'refrigerated' : formData.storage_type,
                      requires_expiry: pt === 'consumable' ? false : pt === 'purchased' ? true : formData.requires_expiry,
                      tracking_level: pt === 'consumable' ? 'simple' : formData.tracking_level,
                    });
                  }}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="consumable">Consumivel / Embalagem (Toalhetes, Caixas, etc.)</option>
                  <option value="purchased">Produto Comprado (Ingredientes / Fornecedores)</option>
                  <option value="cdp_produced">Produto CDP (Producao Interna)</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-2">Descrição</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {(formData.product_type === 'purchased' || formData.product_type === 'consumable') && (
                <div className="p-4 bg-green-50 rounded-lg border border-green-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700">Configurações de Compra</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Um produto pode ter mais do que uma configuração (ex: "barril 30L", "caixa 24un")
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addConfigRow}
                      className="flex items-center gap-1 text-sm text-green-700 hover:text-green-800 font-medium"
                    >
                      <Plus className="w-4 h-4" />
                      Adicionar
                    </button>
                  </div>

                  {purchaseConfigs.length === 0 && (
                    <p className="text-xs text-slate-500 italic">
                      Nenhuma configuração. Clique em "Adicionar" para criar.
                    </p>
                  )}

                  {purchaseConfigs.map((cfg, index) => (
                    <div key={index} className="bg-white border border-slate-200 rounded-lg p-3">
                      <div className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-4">
                          <label className="block text-xs font-medium text-slate-600 mb-1">Unidade de Compra</label>
                          <input
                            type="text"
                            value={cfg.purchase_unit}
                            onChange={(e) => updateConfigRow(index, 'purchase_unit', e.target.value)}
                            placeholder="ex: barril"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="col-span-3">
                          <label className="block text-xs font-medium text-slate-600 mb-1">Quantidade</label>
                          <input
                            type="number"
                            step="0.001"
                            min="0.001"
                            value={cfg.purchase_unit_quantity}
                            onChange={(e) => updateConfigRow(index, 'purchase_unit_quantity', e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-slate-600 mb-1">Medida</label>
                          <select
                            value={cfg.purchase_unit_measure}
                            onChange={(e) => updateConfigRow(index, 'purchase_unit_measure', e.target.value)}
                            className="w-full px-2 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          >
                            {MEASURE_OPTIONS.map(m => (
                              <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2 flex items-center pb-1.5">
                          <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                            <input
                              type="radio"
                              name="default_config"
                              checked={cfg.is_default}
                              onChange={() => updateConfigRow(index, 'is_default', true)}
                              className="w-3.5 h-3.5 text-green-600"
                            />
                            Padrão
                          </label>
                        </div>
                        <div className="col-span-1 flex justify-end pb-1.5">
                          <button
                            type="button"
                            onClick={() => removeConfigRow(index)}
                            className="text-red-600 hover:text-red-700 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      {cfg.purchase_unit && cfg.purchase_unit_quantity && (
                        <p className="text-xs text-slate-500 mt-2">
                          Pré-visualização: 1 {cfg.purchase_unit} = {cfg.purchase_unit_quantity}{cfg.purchase_unit_measure}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {formData.product_type === 'cdp_produced' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Configuração de Embalagem</label>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de Unidade de Embalagem *</label>
                    <select
                      required
                      value={formData.packaging_unit_type}
                      onChange={(e) => setFormData({ ...formData, packaging_unit_type: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="kg">Quilograma (kg)</option>
                      <option value="L">Litro (L)</option>
                      <option value="units">Unidades</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Quantidade Padrão por Embalagem *</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      required
                      value={formData.standard_package_quantity}
                      onChange={(e) => setFormData({ ...formData, standard_package_quantity: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={formData.allow_remainder_package}
                        onChange={(e) => setFormData({ ...formData, allow_remainder_package: e.target.checked })}
                        className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-700">Permitir embalagem divergente (resto)</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Rastreamento e Funcionalidade</label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Nível de Rastreamento</label>
                  <select
                    value={formData.tracking_level}
                    onChange={(e) => setFormData({ ...formData, tracking_level: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="full">Completo (lote + validade)</option>
                    <option value="simple">Simples (apenas quantidade)</option>
                  </select>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="requires_expiry"
                    checked={formData.requires_expiry}
                    onChange={(e) => setFormData({ ...formData, requires_expiry: e.target.checked })}
                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="requires_expiry" className="text-sm text-slate-700">Requer Validade</label>
                </div>
                {formData.product_type !== 'consumable' && (
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="is_recipe_input"
                      checked={formData.is_recipe_input}
                      onChange={(e) => setFormData({ ...formData, is_recipe_input: e.target.checked })}
                      className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="is_recipe_input" className="text-sm text-slate-700">Ingrediente de Receita</label>
                  </div>
                )}
                {formData.product_type !== 'consumable' && (
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="is_recipe_output"
                      checked={formData.is_recipe_output}
                      onChange={(e) => setFormData({ ...formData, is_recipe_output: e.target.checked })}
                      className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="is_recipe_output" className="text-sm text-slate-700">Produzido por Receita</label>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end space-x-3 pt-6 border-t border-slate-200">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>A guardar...</span>
                    </>
                  ) : (
                    <span>{editingProduct ? 'Atualizar' : 'Criar'} Produto</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
