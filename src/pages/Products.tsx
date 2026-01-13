import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Package, Plus, Edit2, Trash2, Search, Settings } from 'lucide-react';
import type { Database } from '../lib/database.types';

type Product = Database['public']['Tables']['products']['Row'];
type Category = Database['public']['Tables']['categories']['Row'];
type Store = Database['public']['Tables']['stores']['Row'];
type Supplier = Database['public']['Tables']['suppliers']['Row'];

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showSuppliersModal, setShowSuppliersModal] = useState(false);
  const [managingProduct, setManagingProduct] = useState<Product | null>(null);
  const [productSuppliers, setProductSuppliers] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    unit: 'kg',
    category_id: '',
    location: 'kitchen' as 'kitchen' | 'room',
    store_ids: [] as string[],
    supplier_ids: [] as string[],
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [productsRes, categoriesRes, storesRes, suppliersRes] = await Promise.all([
        supabase.from('products').select('*').order('name'),
        supabase.from('categories').select('*').order('name'),
        supabase.from('stores').select('*').order('name'),
        supabase.from('suppliers').select('*').order('name'),
      ]);

      if (productsRes.data) setProducts(productsRes.data);
      if (categoriesRes.data) setCategories(categoriesRes.data);
      if (storesRes.data) setStores(storesRes.data);
      if (suppliersRes.data) setSuppliers(suppliersRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update({
            name: formData.name,
            unit: formData.unit,
            category_id: formData.category_id || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingProduct.id);

        if (error) throw error;
      } else {
        if (formData.store_ids.length === 0) {
          alert('Selecione pelo menos uma loja');
          return;
        }

        const { data: newProduct, error: productError } = await supabase
          .from('products')
          .insert({
            name: formData.name,
            unit: formData.unit,
            category_id: formData.category_id || null,
          })
          .select()
          .single();

        if (productError) throw productError;

        const stockEntries = formData.store_ids.map(storeId => ({
          product_id: newProduct.id,
          store_id: storeId,
          location: formData.location,
          quantity: 0,
          minimum_stock: 0,
        }));

        const { error: stockError } = await supabase
          .from('stock')
          .insert(stockEntries);

        if (stockError) throw stockError;

        if (formData.supplier_ids.length > 0) {
          const supplierEntries: any[] = [];
          formData.supplier_ids.forEach(supplierId => {
            formData.store_ids.forEach(storeId => {
              supplierEntries.push({
                product_id: newProduct.id,
                supplier_id: supplierId,
                store_id: storeId,
                price: 0,
              });
            });
          });

          const { error: suppliersError } = await supabase
            .from('product_suppliers')
            .insert(supplierEntries);

          if (suppliersError) throw suppliersError;
        }
      }

      setShowModal(false);
      setEditingProduct(null);
      setFormData({ name: '', unit: 'kg', category_id: '', location: 'kitchen', store_ids: [], supplier_ids: [] });
      loadData();
    } catch (error) {
      console.error('Error saving product:', error);
      alert('Erro ao guardar produto');
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      unit: product.unit,
      category_id: product.category_id || '',
      location: 'kitchen',
      store_ids: [],
      supplier_ids: [],
    });
    setShowModal(true);
  };

  const handleManageSuppliers = async (product: Product) => {
    setManagingProduct(product);
    const { data } = await supabase
      .from('product_suppliers')
      .select('*, supplier:suppliers(name), store:stores(name)')
      .eq('product_id', product.id);

    setProductSuppliers(data || []);
    setShowSuppliersModal(true);
  };

  const handleAddSupplier = async (supplierId: string, storeId: string) => {
    if (!managingProduct) return;

    try {
      const { error } = await supabase
        .from('product_suppliers')
        .insert({
          product_id: managingProduct.id,
          supplier_id: supplierId,
          store_id: storeId,
          price: 0,
        });

      if (error) throw error;
      await handleManageSuppliers(managingProduct);
    } catch (error) {
      console.error('Error adding supplier:', error);
      alert('Erro ao adicionar fornecedor');
    }
  };

  const handleRemoveSupplier = async (id: string) => {
    if (!managingProduct) return;

    try {
      const { error } = await supabase
        .from('product_suppliers')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await handleManageSuppliers(managingProduct);
    } catch (error) {
      console.error('Error removing supplier:', error);
      alert('Erro ao remover fornecedor');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem a certeza que deseja eliminar este produto?')) return;

    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('Erro ao eliminar produto');
    }
  };

  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return '-';
    return categories.find((c) => c.id === categoryId)?.name || '-';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-[#F20519] to-[#048ABF] rounded-xl">
            <Package className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Produtos</h1>
        </div>
        <button
          onClick={() => {
            setEditingProduct(null);
            setFormData({ name: '', unit: 'kg', category_id: '', location: 'kitchen', store_ids: [], supplier_ids: [] });
            setShowModal(true);
          }}
          className="flex items-center gap-2 bg-gradient-to-r from-[#F20519] to-[#048ABF] text-white px-4 py-2 rounded-lg hover:shadow-lg transition"
        >
          <Plus className="w-5 h-5" />
          Novo Produto
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200">
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
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-600">A carregar...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">
                    Nome
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">
                    Unidade
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">
                    Categoria
                  </th>
                  <th className="text-right px-6 py-3 text-sm font-semibold text-slate-700">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-6 py-4 text-slate-800">{product.name}</td>
                    <td className="px-6 py-4 text-slate-600">{product.unit}</td>
                    <td className="px-6 py-4 text-slate-600">
                      {getCategoryName(product.category_id)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleManageSuppliers(product)}
                          className="p-2 hover:bg-blue-100 rounded-lg transition"
                          title="Gerir fornecedores e lojas"
                        >
                          <Settings className="w-4 h-4 text-blue-600" />
                        </button>
                        <button
                          onClick={() => handleEdit(product)}
                          className="p-2 hover:bg-slate-200 rounded-lg transition"
                        >
                          <Edit2 className="w-4 h-4 text-slate-600" />
                        </button>
                        <button
                          onClick={() => handleDelete(product.id)}
                          className="p-2 hover:bg-red-100 rounded-lg transition"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
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

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-xl font-bold text-slate-800">
                {editingProduct ? 'Editar Produto' : 'Novo Produto'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Nome
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#048ABF]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Unidade
                </label>
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#048ABF]"
                >
                  <option value="kg">kg</option>
                  <option value="L">L</option>
                  <option value="un">un</option>
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Categoria
                </label>
                <select
                  value={formData.category_id}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#048ABF]"
                >
                  <option value="">Sem categoria</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              {!editingProduct && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Localização *
                    </label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="location"
                          value="kitchen"
                          checked={formData.location === 'kitchen'}
                          onChange={(e) => setFormData({ ...formData, location: e.target.value as 'kitchen' | 'room' })}
                          className="w-4 h-4 text-[#048ABF] border-slate-300 focus:ring-[#048ABF]"
                        />
                        <span className="text-slate-700">Cozinha</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="location"
                          value="room"
                          checked={formData.location === 'room'}
                          onChange={(e) => setFormData({ ...formData, location: e.target.value as 'kitchen' | 'room' })}
                          className="w-4 h-4 text-[#048ABF] border-slate-300 focus:ring-[#048ABF]"
                        />
                        <span className="text-slate-700">Sala</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Lojas *
                    </label>
                    <div className="space-y-2">
                      {stores.map((store) => (
                        <label key={store.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.store_ids.includes(store.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({ ...formData, store_ids: [...formData.store_ids, store.id] });
                              } else {
                                setFormData({ ...formData, store_ids: formData.store_ids.filter(id => id !== store.id) });
                              }
                            }}
                            className="w-4 h-4 text-[#048ABF] border-slate-300 rounded focus:ring-[#048ABF]"
                          />
                          <span className="text-slate-700">{store.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Fornecedores
                    </label>
                    <div className="space-y-2">
                      {suppliers.map((supplier) => (
                        <label key={supplier.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.supplier_ids.includes(supplier.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({ ...formData, supplier_ids: [...formData.supplier_ids, supplier.id] });
                              } else {
                                setFormData({ ...formData, supplier_ids: formData.supplier_ids.filter(id => id !== supplier.id) });
                              }
                            }}
                            className="w-4 h-4 text-[#048ABF] border-slate-300 rounded focus:ring-[#048ABF]"
                          />
                          <span className="text-slate-700">{supplier.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingProduct(null);
                  }}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-[#F20519] to-[#048ABF] text-white rounded-lg hover:shadow-lg transition"
                >
                  {editingProduct ? 'Guardar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSuppliersModal && managingProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-xl font-bold text-slate-800">
                Gerir Fornecedores: {managingProduct.name}
              </h2>
            </div>

            <div className="p-6">
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">
                  Adicionar Fornecedor
                </h3>
                <div className="flex gap-2">
                  <select
                    id="new-supplier"
                    className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#048ABF]"
                  >
                    <option value="">Selecionar fornecedor</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                  <select
                    id="new-store"
                    className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#048ABF]"
                  >
                    <option value="">Selecionar loja</option>
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      const supplierSelect = document.getElementById('new-supplier') as HTMLSelectElement;
                      const storeSelect = document.getElementById('new-store') as HTMLSelectElement;
                      if (supplierSelect.value && storeSelect.value) {
                        handleAddSupplier(supplierSelect.value, storeSelect.value);
                        supplierSelect.value = '';
                        storeSelect.value = '';
                      }
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-[#F20519] to-[#048ABF] text-white rounded-lg hover:shadow-lg transition whitespace-nowrap"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">
                  Fornecedores Atuais
                </h3>
                {productSuppliers.length === 0 ? (
                  <p className="text-slate-500 text-center py-4">
                    Nenhum fornecedor associado
                  </p>
                ) : (
                  <div className="space-y-2">
                    {productSuppliers.map((ps) => (
                      <div
                        key={ps.id}
                        className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="font-medium text-slate-800">
                            {ps.supplier?.name || 'N/A'}
                          </div>
                          <div className="text-sm text-slate-600">
                            Loja: {ps.store?.name || 'N/A'}
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveSupplier(ps.id)}
                          className="p-2 hover:bg-red-100 rounded-lg transition"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-slate-200">
              <button
                onClick={() => {
                  setShowSuppliersModal(false);
                  setManagingProduct(null);
                }}
                className="w-full px-4 py-2 bg-gradient-to-r from-[#F20519] to-[#048ABF] text-white rounded-lg hover:shadow-lg transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
