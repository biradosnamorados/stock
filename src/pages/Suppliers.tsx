import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Users, Plus, Edit2, Trash2, Search, Mail, Phone } from 'lucide-react';
import type { Database } from '../lib/database.types';

type Supplier = Database['public']['Tables']['suppliers']['Row'];
type Store = Database['public']['Tables']['stores']['Row'];
type SupplierStore = Database['public']['Tables']['supplier_stores']['Row'];

interface SupplierWithStores extends Supplier {
  stores: Store[];
}

export default function Suppliers() {
  const { profile } = useAuth();
  const [suppliers, setSuppliers] = useState<SupplierWithStores[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierWithStores | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    selectedStoreIds: [] as string[],
  });

  useEffect(() => {
    loadData();
  }, [profile]);

  const loadData = async () => {
    setLoading(true);
    try {
      const storesRes = await supabase.from('stores').select('*').order('name');
      if (storesRes.data) setStores(storesRes.data);

      const suppliersRes = await supabase
        .from('suppliers')
        .select('*')
        .order('name');

      if (suppliersRes.data) {
        const supplierIds = suppliersRes.data.map(s => s.id);

        const supplierStoresRes = await supabase
          .from('supplier_stores')
          .select('supplier_id, store_id')
          .in('supplier_id', supplierIds);

        const suppliersWithStores: SupplierWithStores[] = suppliersRes.data.map(supplier => {
          const supplierStoreLinks = supplierStoresRes.data?.filter(
            ss => ss.supplier_id === supplier.id
          ) || [];

          const supplierStores = supplierStoreLinks
            .map(ss => storesRes.data?.find(s => s.id === ss.store_id))
            .filter((s): s is Store => s !== undefined);

          return {
            ...supplier,
            stores: supplierStores,
          };
        });

        if (profile?.role === 'store_user' && profile.store_id) {
          const filteredSuppliers = suppliersWithStores.filter(supplier =>
            supplier.stores.some(s => s.id === profile.store_id)
          );
          setSuppliers(filteredSuppliers);
        } else {
          setSuppliers(suppliersWithStores);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (formData.selectedStoreIds.length === 0) {
        alert('Selecione pelo menos uma loja');
        return;
      }

      if (editingSupplier) {
        const { error: updateError } = await supabase
          .from('suppliers')
          .update({
            name: formData.name,
            email: formData.email || null,
            phone: formData.phone || null,
          })
          .eq('id', editingSupplier.id);

        if (updateError) throw updateError;

        await supabase
          .from('supplier_stores')
          .delete()
          .eq('supplier_id', editingSupplier.id);

        const supplierStoreInserts = formData.selectedStoreIds.map(storeId => ({
          supplier_id: editingSupplier.id,
          store_id: storeId,
        }));

        const { error: insertError } = await supabase
          .from('supplier_stores')
          .insert(supplierStoreInserts);

        if (insertError) throw insertError;
      } else {
        const { data: newSupplier, error: insertError } = await supabase
          .from('suppliers')
          .insert({
            name: formData.name,
            email: formData.email || null,
            phone: formData.phone || null,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        const supplierStoreInserts = formData.selectedStoreIds.map(storeId => ({
          supplier_id: newSupplier.id,
          store_id: storeId,
        }));

        const { error: linkError } = await supabase
          .from('supplier_stores')
          .insert(supplierStoreInserts);

        if (linkError) throw linkError;
      }

      setShowModal(false);
      setEditingSupplier(null);
      setFormData({ name: '', email: '', phone: '', selectedStoreIds: [] });
      loadData();
    } catch (error) {
      console.error('Error saving supplier:', error);
      alert('Erro ao guardar fornecedor');
    }
  };

  const handleEdit = async (supplier: SupplierWithStores) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      email: supplier.email || '',
      phone: supplier.phone || '',
      selectedStoreIds: supplier.stores.map(s => s.id),
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem a certeza que deseja eliminar este fornecedor?')) return;

    try {
      const { error } = await supabase.from('suppliers').delete().eq('id', id);
      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error deleting supplier:', error);
      alert('Erro ao eliminar fornecedor');
    }
  };

  const toggleStoreSelection = (storeId: string) => {
    setFormData(prev => ({
      ...prev,
      selectedStoreIds: prev.selectedStoreIds.includes(storeId)
        ? prev.selectedStoreIds.filter(id => id !== storeId)
        : [...prev.selectedStoreIds, storeId],
    }));
  };

  const filteredSuppliers = suppliers.filter((supplier) =>
    supplier.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStoreNames = (stores: Store[]) => {
    if (stores.length === 0) return '-';
    return stores.map(s => s.name).join(', ');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-[#038C5A] to-[#048ABF] rounded-xl">
            <Users className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Fornecedores</h1>
        </div>
        <button
          onClick={() => {
            setEditingSupplier(null);
            const defaultStoreIds = profile?.role === 'store_user' && profile.store_id
              ? [profile.store_id]
              : [];
            setFormData({ name: '', email: '', phone: '', selectedStoreIds: defaultStoreIds });
            setShowModal(true);
          }}
          className="flex items-center gap-2 bg-gradient-to-r from-[#038C5A] to-[#048ABF] text-white px-4 py-2 rounded-lg hover:shadow-lg transition"
        >
          <Plus className="w-5 h-5" />
          Novo Fornecedor
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Pesquisar fornecedores..."
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
                    Email
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">
                    Telefone
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">
                    Lojas
                  </th>
                  <th className="text-right px-6 py-3 text-sm font-semibold text-slate-700">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((supplier) => (
                  <tr key={supplier.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-6 py-4 text-slate-800">{supplier.name}</td>
                    <td className="px-6 py-4">
                      {supplier.email ? (
                        <div className="flex items-center gap-2 text-slate-600">
                          <Mail className="w-4 h-4" />
                          {supplier.email}
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {supplier.phone ? (
                        <div className="flex items-center gap-2 text-slate-600">
                          <Phone className="w-4 h-4" />
                          {supplier.phone}
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-1">
                        {supplier.stores.map(store => (
                          <span
                            key={store.id}
                            className="px-2 py-1 bg-gradient-to-r from-[#038C5A] to-[#048ABF] text-white text-xs rounded-full"
                          >
                            {store.name}
                          </span>
                        ))}
                        {supplier.stores.length === 0 && (
                          <span className="text-slate-400">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleEdit(supplier)}
                          className="p-2 hover:bg-slate-200 rounded-lg transition"
                        >
                          <Edit2 className="w-4 h-4 text-slate-600" />
                        </button>
                        <button
                          onClick={() => handleDelete(supplier.id)}
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
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-xl font-bold text-slate-800">
                {editingSupplier ? 'Editar Fornecedor' : 'Novo Fornecedor'}
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
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#048ABF]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Telefone
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#048ABF]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Lojas
                </label>
                <div className="space-y-2">
                  {stores.map((store) => (
                    <label
                      key={store.id}
                      className="flex items-center gap-3 p-3 border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 transition"
                    >
                      <input
                        type="checkbox"
                        checked={formData.selectedStoreIds.includes(store.id)}
                        onChange={() => toggleStoreSelection(store.id)}
                        disabled={profile?.role === 'store_user' && profile.store_id !== store.id}
                        className="w-5 h-5 text-[#048ABF] border-slate-300 rounded focus:ring-[#048ABF]"
                      />
                      <span className="text-slate-700">{store.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingSupplier(null);
                  }}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-[#038C5A] to-[#048ABF] text-white rounded-lg hover:shadow-lg transition"
                >
                  {editingSupplier ? 'Guardar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
