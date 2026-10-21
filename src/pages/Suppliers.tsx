import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Building2, Plus, CreditCard as Edit, Trash2, MapPin, Users } from 'lucide-react';
import SupplierForm from '../components/SupplierForm';

interface Supplier {
  id: string;
  code: string;
  name: string;
  type: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  contact_person: string | null;
  active: boolean;
  unit_count?: number;
  product_count?: number;
}

export default function Suppliers() {
  const { profile } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState<string | undefined>();

  useEffect(() => {
    if (profile?.unit_id || profile?.role === 'Admin') {
      loadSuppliers();
    }
  }, [profile]);

  const loadSuppliers = async () => {
    if (!profile?.unit_id && profile?.role !== 'Admin') return;

    setLoading(true);

    const { data: suppliersData, error } = await supabase
      .from('suppliers')
      .select(`
        *,
        supplier_units(count),
        supplier_products(count)
      `)
      .order('name');

    if (error) {
      console.error('Erro ao carregar fornecedores:', error);
      alert('Erro ao carregar fornecedores: ' + error.message);
    } else if (suppliersData) {
      setSuppliers(suppliersData.map(s => ({
        ...s,
        unit_count: s.supplier_units?.[0]?.count || 0,
        product_count: s.supplier_products?.[0]?.count || 0
      })));
    }

    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    const { data: purchaseOrders } = await supabase
      .from('purchase_orders')
      .select('id')
      .eq('supplier_id', id)
      .limit(1);

    const { data: goodsReceipts } = await supabase
      .from('goods_receipts')
      .select('id')
      .eq('supplier_id', id)
      .limit(1);

    let confirmMessage = 'Tem a certeza que deseja eliminar este fornecedor?';

    if ((purchaseOrders && purchaseOrders.length > 0) || (goodsReceipts && goodsReceipts.length > 0)) {
      confirmMessage = 'ATENÇÃO: Este fornecedor tem encomendas de compra e/ou receções associadas. Ao eliminar o fornecedor, todos os registos relacionados serão também eliminados. Esta ação não pode ser revertida. Deseja continuar?';
    }

    if (!confirm(confirmMessage)) return;

    const { error } = await supabase
      .from('suppliers')
      .delete()
      .eq('id', id);

    if (!error) {
      alert('Fornecedor eliminado com sucesso!');
      loadSuppliers();
    } else {
      alert('Erro ao eliminar fornecedor: ' + error.message);
    }
  };

  const handleEdit = (id: string) => {
    setEditingSupplierId(id);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingSupplierId(undefined);
  };

  const handleSuccess = () => {
    loadSuppliers();
    handleCloseForm();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-600">A carregar...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Fornecedores</h1>
          <p className="text-slate-600 mt-1">Gerir fornecedores, unidades e produtos</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"
        >
          <Plus className="w-5 h-5" />
          <span>Novo Fornecedor</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {suppliers.map((supplier) => (
          <div key={supplier.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">{supplier.name}</h3>
                  <p className="text-sm text-slate-500">{supplier.code}</p>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                supplier.active
                  ? 'bg-green-100 text-green-700'
                  : 'bg-slate-100 text-slate-600'
              }`}>
                {supplier.active ? 'Ativo' : 'Inativo'}
              </span>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex items-center text-sm text-slate-600">
                <span className="font-medium w-20">Tipo:</span>
                <span className="capitalize">{supplier.type === 'external' ? 'Externo' : 'Interno'}</span>
              </div>
              {supplier.email && (
                <div className="flex items-center text-sm text-slate-600">
                  <span className="font-medium w-20">Email:</span>
                  <span className="truncate">{supplier.email}</span>
                </div>
              )}
              {supplier.phone && (
                <div className="flex items-center text-sm text-slate-600">
                  <span className="font-medium w-20">Tel:</span>
                  <span>{supplier.phone}</span>
                </div>
              )}
              {supplier.contact_person && (
                <div className="flex items-center text-sm text-slate-600">
                  <span className="font-medium w-20">Contacto:</span>
                  <span>{supplier.contact_person}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <div className="flex items-center space-x-4 text-sm">
                <div className="flex items-center space-x-1 text-slate-600">
                  <MapPin className="w-4 h-4" />
                  <span>{supplier.unit_count} unidades</span>
                </div>
                <div className="flex items-center space-x-1 text-slate-600">
                  <Users className="w-4 h-4" />
                  <span>{supplier.product_count} produtos</span>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleEdit(supplier.id)}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(supplier.id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {suppliers.length === 0 && (
        <div className="text-center py-12">
          <Building2 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-600 mb-2">Nenhum fornecedor</h3>
          <p className="text-slate-500 mb-6">Comece por criar o primeiro fornecedor</p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"
          >
            <Plus className="w-5 h-5" />
            <span>Criar Fornecedor</span>
          </button>
        </div>
      )}

      {showForm && (
        <SupplierForm
          supplierId={editingSupplierId}
          onClose={handleCloseForm}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
