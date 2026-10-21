import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Save, Building2, MapPin, Package } from 'lucide-react';

interface SupplierFormProps {
  supplierId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface Unit {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface Product {
  id: string;
  code: string;
  name: string;
  unit: string;
}

export default function SupplierForm({ supplierId, onClose, onSuccess }: SupplierFormProps) {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'units' | 'products'>('info');

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<'external' | 'internal'>('external');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [active, setActive] = useState(true);

  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);

  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<{
    product_id: string;
    supplier_code: string;
    unit_price: string;
  }[]>([]);

  useEffect(() => {
    loadUnits();
    loadProducts();
    if (supplierId) {
      loadSupplier();
    }
  }, [supplierId]);

  const loadUnits = async () => {
    const { data, error } = await supabase
      .from('units')
      .select('id, code, name, type')
      .eq('active', true)
      .order('name');

    if (!error && data) {
      setUnits(data);
    }
  };

  const loadProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('id, code, name, unit')
      .eq('active', true)
      .in('product_type', ['purchased', 'consumable'])
      .order('name');

    if (!error && data) {
      setProducts(data);
    }
  };

  const loadSupplier = async () => {
    if (!supplierId) return;

    const { data, error } = await supabase
      .from('suppliers')
      .select(`
        *,
        supplier_units(unit_id),
        supplier_products(product_id, supplier_code, unit_price)
      `)
      .eq('id', supplierId)
      .single();

    if (error) {
      console.error('Erro ao carregar fornecedor:', error);
      alert('Erro ao carregar fornecedor: ' + error.message);
      return;
    }

    if (data) {
      setCode(data.code);
      setName(data.name);
      setType(data.type);
      setEmail(data.email || '');
      setPhone(data.phone || '');
      setAddress(data.address || '');
      setContactPerson(data.contact_person || '');
      setActive(data.active);

      if (data.supplier_units) {
        setSelectedUnits(data.supplier_units.map((su: any) => su.unit_id));
      }

      if (data.supplier_products) {
        setSelectedProducts(data.supplier_products.map((sp: any) => ({
          product_id: sp.product_id,
          supplier_code: sp.supplier_code || '',
          unit_price: sp.unit_price?.toString() || ''
        })));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!code.trim() || !name.trim()) {
      alert('Preencha o código e nome do fornecedor');
      return;
    }

    setLoading(true);

    try {
      let currentSupplierId = supplierId;

      if (supplierId) {
        const { error } = await supabase
          .from('suppliers')
          .update({
            code: code.trim(),
            name: name.trim(),
            type,
            email: email.trim() || null,
            phone: phone.trim() || null,
            address: address.trim() || null,
            contact_person: contactPerson.trim() || null,
            active,
            updated_at: new Date().toISOString()
          })
          .eq('id', supplierId);

        if (error) throw error;
      } else {
        const { data: newSupplier, error } = await supabase
          .from('suppliers')
          .insert({
            code: code.trim(),
            name: name.trim(),
            type,
            email: email.trim() || null,
            phone: phone.trim() || null,
            address: address.trim() || null,
            contact_person: contactPerson.trim() || null,
            active
          })
          .select()
          .single();

        if (error) throw error;
        currentSupplierId = newSupplier.id;
      }

      const uniqueUnits = Array.from(new Set(selectedUnits));

      if (uniqueUnits.length > 0) {
        const { error: upsertUnitsError } = await supabase
          .from('supplier_units')
          .upsert(
            uniqueUnits.map(unitId => ({
              supplier_id: currentSupplierId,
              unit_id: unitId,
            })),
            { onConflict: 'supplier_id,unit_id', ignoreDuplicates: true }
          );

        if (upsertUnitsError) {
          console.error('Erro ao inserir unidades:', upsertUnitsError);
          throw upsertUnitsError;
        }

        const { error: cleanupUnitsError } = await supabase
          .from('supplier_units')
          .delete()
          .eq('supplier_id', currentSupplierId)
          .not('unit_id', 'in', `(${uniqueUnits.map(id => `"${id}"`).join(',')})`);

        if (cleanupUnitsError) {
          console.error('Erro ao limpar unidades:', cleanupUnitsError);
        }
      } else {
        await supabase
          .from('supplier_units')
          .delete()
          .eq('supplier_id', currentSupplierId);
      }

      const dedupedProducts = Array.from(
        new Map(selectedProducts.map(sp => [sp.product_id, sp])).values()
      );

      if (dedupedProducts.length > 0) {
        const { error: upsertProductsError } = await supabase
          .from('supplier_products')
          .upsert(
            dedupedProducts.map(sp => ({
              supplier_id: currentSupplierId,
              product_id: sp.product_id,
              supplier_code: sp.supplier_code.trim() || null,
              unit_price: sp.unit_price ? parseFloat(sp.unit_price) : null,
              active: true,
            })),
            { onConflict: 'supplier_id,product_id' }
          );

        if (upsertProductsError) {
          console.error('Erro ao inserir produtos:', upsertProductsError);
          throw upsertProductsError;
        }

        const keepProductIds = dedupedProducts.map(sp => sp.product_id);
        const { error: cleanupProductsError } = await supabase
          .from('supplier_products')
          .delete()
          .eq('supplier_id', currentSupplierId)
          .not('product_id', 'in', `(${keepProductIds.map(id => `"${id}"`).join(',')})`);

        if (cleanupProductsError) {
          console.error('Erro ao limpar produtos:', cleanupProductsError);
        }
      } else {
        await supabase
          .from('supplier_products')
          .delete()
          .eq('supplier_id', currentSupplierId);
      }

      onSuccess();
    } catch (err: any) {
      console.error('Erro ao guardar fornecedor:', err);
      alert('Erro ao guardar fornecedor: ' + (err?.message || 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  const toggleUnit = (unitId: string) => {
    setSelectedUnits(prev =>
      prev.includes(unitId)
        ? prev.filter(id => id !== unitId)
        : [...prev, unitId]
    );
  };

  const toggleProduct = (productId: string) => {
    setSelectedProducts(prev => {
      const exists = prev.find(p => p.product_id === productId);
      if (exists) {
        return prev.filter(p => p.product_id !== productId);
      } else {
        return [...prev, { product_id: productId, supplier_code: '', unit_price: '' }];
      }
    });
  };

  const updateProductField = (productId: string, field: 'supplier_code' | 'unit_price', value: string) => {
    setSelectedProducts(prev =>
      prev.map(p =>
        p.product_id === productId ? { ...p, [field]: value } : p
      )
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-800">
            {supplierId ? 'Editar Fornecedor' : 'Novo Fornecedor'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="border-b border-slate-200">
          <div className="flex space-x-1 px-6">
            <button
              onClick={() => setActiveTab('info')}
              className={`flex items-center space-x-2 px-4 py-3 border-b-2 font-medium transition ${
                activeTab === 'info'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-800'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Informações</span>
            </button>
            <button
              onClick={() => setActiveTab('units')}
              className={`flex items-center space-x-2 px-4 py-3 border-b-2 font-medium transition ${
                activeTab === 'units'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-800'
              }`}
            >
              <MapPin className="w-4 h-4" />
              <span>Unidades ({selectedUnits.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('products')}
              className={`flex items-center space-x-2 px-4 py-3 border-b-2 font-medium transition ${
                activeTab === 'products'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-800'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>Produtos ({selectedProducts.length})</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {activeTab === 'info' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Código *
                  </label>
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="SUP001"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Nome *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nome do fornecedor"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Tipo *
                  </label>
                  <select
                    required
                    value={type}
                    onChange={(e) => setType(e.target.value as 'external' | 'internal')}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="external">Externo</option>
                    <option value="internal">Interno</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@fornecedor.com"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Telefone
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+351 XXX XXX XXX"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Pessoa de Contacto
                  </label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    placeholder="Nome do responsável"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Morada
                </label>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Morada completa do fornecedor"
                  rows={3}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="active"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="active" className="ml-2 text-sm font-medium text-slate-700">
                  Fornecedor ativo
                </label>
              </div>
            </div>
          )}

          {activeTab === 'units' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 mb-4">
                Selecione as unidades que este fornecedor pode fornecer
              </p>
              {units.map((unit) => (
                <div
                  key={unit.id}
                  onClick={() => toggleUnit(unit.id)}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition ${
                    selectedUnits.includes(unit.id)
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={selectedUnits.includes(unit.id)}
                        onChange={() => {}}
                        className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                      />
                      <div>
                        <p className="font-medium text-slate-800">{unit.name}</p>
                        <p className="text-sm text-slate-500">{unit.code} - {unit.type}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'products' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 mb-4">
                Selecione os produtos que este fornecedor pode fornecer e configure os detalhes
              </p>
              {products.map((product) => {
                const isSelected = selectedProducts.find(p => p.product_id === product.id);
                return (
                  <div
                    key={product.id}
                    className={`p-4 border-2 rounded-lg transition ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <input
                        type="checkbox"
                        checked={!!isSelected}
                        onChange={() => toggleProduct(product.id)}
                        className="w-4 h-4 mt-1 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <p className="font-medium text-slate-800">{product.name}</p>
                        <p className="text-sm text-slate-500">{product.code} - {product.unit}</p>

                        {isSelected && (
                          <div className="grid grid-cols-2 gap-3 mt-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Código do Fornecedor
                              </label>
                              <input
                                type="text"
                                value={isSelected.supplier_code}
                                onChange={(e) => updateProductField(product.id, 'supplier_code', e.target.value)}
                                placeholder="Código interno"
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Preço Base (€)
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={isSelected.unit_price}
                                onChange={(e) => updateProductField(product.id, 'unit_price', e.target.value)}
                                placeholder="0.00"
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-end space-x-3 mt-6 pt-6 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center space-x-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              <Save className="w-5 h-5" />
              <span>{loading ? 'A guardar...' : 'Guardar'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
