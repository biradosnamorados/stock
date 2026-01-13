import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  ShoppingCart, Plus, Search, Mail, Eye, Trash2, X, Send
} from 'lucide-react';
import type { Database } from '../lib/database.types';

type Order = Database['public']['Tables']['orders']['Row'];
type OrderItem = Database['public']['Tables']['order_items']['Row'] & { current_stock?: number };
type Supplier = Database['public']['Tables']['suppliers']['Row'];
type Product = Database['public']['Tables']['products']['Row'];
type Store = Database['public']['Tables']['stores']['Row'];

interface OrderWithDetails extends Order {
  supplier: Supplier;
  store: Store;
  items: Array<OrderItem & { product: Product }>;
}

interface NewOrderItem {
  product: Product;
  currentStock: number;
  quantity: number;
  notes: string;
}

type OrderStep = 'select-products' | 'count-stock' | 'set-quantities';

export default function Orders() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(null);

  const [creatingOrder, setCreatingOrder] = useState(false);
  const [orderStep, setOrderStep] = useState<OrderStep>('select-products');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [orderItems, setOrderItems] = useState<NewOrderItem[]>([]);
  const [orderNotes, setOrderNotes] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadData();
  }, [profile]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [storesRes, suppliersRes, productsRes] = await Promise.all([
        supabase.from('stores').select('*').order('name'),
        supabase.from('suppliers').select('*').order('name'),
        supabase.from('products').select('*').order('name'),
      ]);

      if (storesRes.data) setStores(storesRes.data);
      if (suppliersRes.data) setSuppliers(suppliersRes.data);
      if (productsRes.data) setProducts(productsRes.data);

      await loadOrders();
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadOrders = async () => {
    try {
      const { data: ordersData, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (ordersData) {
        const ordersWithDetails = await Promise.all(
          ordersData.map(async (order) => {
            const [supplierRes, storeRes, itemsRes] = await Promise.all([
              supabase.from('suppliers').select('*').eq('id', order.supplier_id).single(),
              supabase.from('stores').select('*').eq('id', order.store_id).single(),
              supabase.from('order_items').select('*').eq('order_id', order.id),
            ]);

            const itemsWithProducts = await Promise.all(
              (itemsRes.data || []).map(async (item) => {
                const productRes = await supabase
                  .from('products')
                  .select('*')
                  .eq('id', item.product_id)
                  .single();

                return {
                  ...item,
                  product: productRes.data!,
                };
              })
            );

            return {
              ...order,
              supplier: supplierRes.data!,
              store: storeRes.data!,
              items: itemsWithProducts,
            };
          })
        );

        setOrders(ordersWithDetails);
      }
    } catch (error) {
      console.error('Error loading orders:', error);
    }
  };

  const handleCreateOrder = () => {
    setCreatingOrder(true);
    setOrderStep('select-products');
    setSelectedSupplier(null);
    setSelectedStore(profile?.role === 'store_user' && profile.store_id
      ? stores.find(s => s.id === profile.store_id) || null
      : null
    );
    setSelectedProducts([]);
    setOrderItems([]);
    setOrderNotes('');
    setShowCreateModal(true);
  };

  const handleToggleProduct = (product: Product) => {
    if (selectedProducts.find(p => p.id === product.id)) {
      setSelectedProducts(selectedProducts.filter(p => p.id !== product.id));
    } else {
      setSelectedProducts([...selectedProducts, product]);
    }
  };

  const handleProceedToStockCount = () => {
    if (!selectedSupplier || !selectedStore || selectedProducts.length === 0) {
      alert('Selecione um fornecedor, loja e pelo menos um produto');
      return;
    }
    setOrderItems(selectedProducts.map(product => ({
      product,
      currentStock: 0,
      quantity: 0,
      notes: ''
    })));
    setOrderStep('count-stock');
  };

  const handleUpdateCurrentStock = (productId: string, currentStock: number) => {
    setOrderItems(orderItems.map(item =>
      item.product.id === productId ? { ...item, currentStock } : item
    ));
  };

  const handleProceedToQuantities = () => {
    setOrderStep('set-quantities');
  };

  const handleUpdateQuantity = (productId: string, quantity: number) => {
    setOrderItems(orderItems.map(item =>
      item.product.id === productId ? { ...item, quantity } : item
    ));
  };

  const handleUpdateNotes = (productId: string, notes: string) => {
    setOrderItems(orderItems.map(item =>
      item.product.id === productId ? { ...item, notes } : item
    ));
  };

  const handleBackToProducts = () => {
    setOrderStep('select-products');
    setOrderItems([]);
  };

  const handleBackToStockCount = () => {
    setOrderStep('count-stock');
  };

  const handleSaveOrder = async () => {
    if (!selectedSupplier || !selectedStore || orderItems.length === 0) {
      alert('Selecione um fornecedor, loja e adicione pelo menos um produto');
      return;
    }

    try {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          supplier_id: selectedSupplier.id,
          store_id: selectedStore.id,
          status: 'draft',
          notes: orderNotes || null,
          created_by: profile!.id,
          order_number: '',
        })
        .select()
        .single();

      if (orderError) {
        console.error('Error inserting order:', orderError);
        alert(`Erro ao criar encomenda: ${orderError.message}`);
        return;
      }

      const itemsToInsert = orderItems.map(item => ({
        order_id: order.id,
        product_id: item.product.id,
        quantity: item.quantity,
        current_stock: item.currentStock,
        unit_price: 0,
        total_price: 0,
        notes: item.notes || null,
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(itemsToInsert);

      if (itemsError) {
        console.error('Error inserting order items:', itemsError);
        alert(`Erro ao adicionar produtos: ${itemsError.message}`);
        return;
      }

      setShowCreateModal(false);
      setCreatingOrder(false);
      loadOrders();
      alert('Encomenda criada com sucesso');
    } catch (error: any) {
      console.error('Error creating order:', error);
      alert(`Erro ao criar encomenda: ${error.message || 'Erro desconhecido'}`);
    }
  };

  const handleSendOrder = async (order: OrderWithDetails) => {
    if (!order.supplier.email) {
      alert('Este fornecedor não tem email cadastrado');
      return;
    }

    if (!confirm(`Enviar encomenda ${order.order_number} para ${order.supplier.email}?`)) {
      return;
    }

    setSending(true);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-order-email`;

      console.log('Enviando email para:', order.supplier.email);
      console.log('API URL:', apiUrl);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: order.id,
          supplierEmail: order.supplier.email,
          supplierName: order.supplier.name,
          storeName: order.store.name,
          orderNumber: order.order_number,
          items: order.items.map(item => ({
            productName: item.product.name,
            quantity: item.quantity,
            unit: item.product.unit,
            notes: item.notes,
          })),
          notes: order.notes,
        }),
      });

      console.log('Response status:', response.status);
      const responseData = await response.json();
      console.log('Response data:', responseData);

      if (!response.ok) {
        throw new Error(responseData.error || 'Erro ao enviar email');
      }

      const { error: orderError } = await supabase
        .from('orders')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .eq('id', order.id);

      if (orderError) throw orderError;

      for (const item of order.items) {
        if (item.current_stock !== undefined && item.current_stock !== null) {
          const { data: stockData } = await supabase
            .from('stock')
            .select('id, quantity')
            .eq('product_id', item.product_id)
            .eq('store_id', order.store_id)
            .maybeSingle();

          if (stockData) {
            const { error: stockError } = await supabase
              .from('stock')
              .update({
                quantity: item.current_stock,
                updated_at: new Date().toISOString(),
              })
              .eq('id', stockData.id);

            if (stockError) {
              console.error('Error updating stock:', stockError);
            }
          }
        }
      }

      loadOrders();
      alert('Encomenda enviada com sucesso!');
    } catch (error: any) {
      console.error('Error sending order:', error);
      alert(`Erro ao enviar encomenda: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setSending(false);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!confirm('Tem a certeza que deseja eliminar esta encomenda?')) return;

    try {
      const { error } = await supabase.from('orders').delete().eq('id', orderId);
      if (error) throw error;
      loadOrders();
    } catch (error) {
      console.error('Error deleting order:', error);
      alert('Erro ao eliminar encomenda');
    }
  };

  const filteredOrders = orders.filter((order) =>
    order.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.supplier.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  ).slice(0, 5);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-slate-100 text-slate-700';
      case 'sent': return 'bg-blue-100 text-blue-700';
      case 'received': return 'bg-green-100 text-green-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft': return 'Rascunho';
      case 'sent': return 'Enviada';
      case 'received': return 'Recebida';
      case 'cancelled': return 'Cancelada';
      default: return status;
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-[#038C5A] to-[#048ABF] rounded-xl">
            <ShoppingCart className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Encomendas</h1>
        </div>
        <button
          onClick={handleCreateOrder}
          className="flex items-center gap-2 bg-gradient-to-r from-[#038C5A] to-[#048ABF] text-white px-4 py-2 rounded-lg hover:shadow-lg transition"
        >
          <Plus className="w-5 h-5" />
          Nova Encomenda
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Pesquisar encomendas..."
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
                    Número
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">
                    Fornecedor
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">
                    Loja
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">
                    Estado
                  </th>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-slate-700">
                    Data
                  </th>
                  <th className="text-right px-6 py-3 text-sm font-semibold text-slate-700">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                      Nenhuma encomenda encontrada
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => (
                    <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-6 py-4 font-medium text-slate-800">
                        {order.order_number}
                      </td>
                      <td className="px-6 py-4 text-slate-700">{order.supplier.name}</td>
                      <td className="px-6 py-4 text-slate-700">{order.store.name}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                          {getStatusLabel(order.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {new Date(order.created_at!).toLocaleDateString('pt-PT')}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setSelectedOrder(order);
                              setShowViewModal(true);
                            }}
                            className="p-2 hover:bg-slate-200 rounded-lg transition"
                            title="Ver detalhes"
                          >
                            <Eye className="w-4 h-4 text-slate-600" />
                          </button>
                          {order.status === 'draft' && (
                            <>
                              <button
                                onClick={() => handleSendOrder(order)}
                                disabled={sending}
                                className="p-2 hover:bg-green-100 rounded-lg transition"
                                title="Enviar por email"
                              >
                                <Mail className="w-4 h-4 text-green-600" />
                              </button>
                              <button
                                onClick={() => handleDeleteOrder(order.id)}
                                className="p-2 hover:bg-red-100 rounded-lg transition"
                                title="Eliminar"
                              >
                                <Trash2 className="w-4 h-4 text-red-600" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Nova Encomenda</h2>
                <div className="flex items-center gap-2 mt-2">
                  <div className={`px-3 py-1 rounded-full text-xs font-medium ${orderStep === 'select-products' ? 'bg-[#048ABF] text-white' : 'bg-slate-200 text-slate-600'}`}>
                    1. Produtos
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-medium ${orderStep === 'count-stock' ? 'bg-[#048ABF] text-white' : 'bg-slate-200 text-slate-600'}`}>
                    2. Contagem
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-medium ${orderStep === 'set-quantities' ? 'bg-[#048ABF] text-white' : 'bg-slate-200 text-slate-600'}`}>
                    3. Quantidades
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {orderStep === 'select-products' && (
              <>
                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Fornecedor *
                      </label>
                      <select
                        value={selectedSupplier?.id || ''}
                        onChange={(e) => setSelectedSupplier(suppliers.find(s => s.id === e.target.value) || null)}
                        required
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#048ABF]"
                      >
                        <option value="">Selecionar fornecedor</option>
                        {suppliers.map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Loja *
                      </label>
                      <select
                        value={selectedStore?.id || ''}
                        onChange={(e) => setSelectedStore(stores.find(s => s.id === e.target.value) || null)}
                        disabled={profile?.role === 'store_user'}
                        required
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#048ABF] disabled:bg-slate-100"
                      >
                        <option value="">Selecionar loja</option>
                        {stores.map((store) => (
                          <option key={store.id} value={store.id}>
                            {store.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Pesquisar e Selecionar Produtos
                    </label>
                    <div className="relative mb-4">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Pesquisar produtos..."
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#048ABF]"
                      />
                    </div>

                    {selectedProducts.length > 0 && (
                      <div className="mb-4 p-3 bg-slate-50 rounded-lg">
                        <div className="text-sm font-medium text-slate-700 mb-2">
                          {selectedProducts.length} produto(s) selecionado(s)
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {selectedProducts.map((product) => (
                            <div key={product.id} className="px-3 py-1 bg-white rounded-full text-sm text-slate-700 flex items-center gap-2 border border-slate-300">
                              {product.name}
                              <button
                                onClick={() => handleToggleProduct(product)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="border border-slate-300 rounded-lg max-h-96 overflow-y-auto">
                      {(productSearch ? filteredProducts : products).map((product) => {
                        const isSelected = selectedProducts.find(p => p.id === product.id);
                        return (
                          <button
                            key={product.id}
                            onClick={() => handleToggleProduct(product)}
                            className={`w-full px-4 py-3 text-left border-b border-slate-100 last:border-b-0 transition ${
                              isSelected ? 'bg-[#048ABF]/10' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium text-slate-800">{product.name}</div>
                                <div className="text-sm text-slate-600">{product.unit}</div>
                              </div>
                              {isSelected && (
                                <div className="w-5 h-5 bg-[#038C5A] rounded-full flex items-center justify-center">
                                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="p-6 border-t border-slate-200 flex gap-3">
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleProceedToStockCount}
                    disabled={!selectedSupplier || !selectedStore || selectedProducts.length === 0}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-[#038C5A] to-[#048ABF] text-white rounded-lg hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continuar para Contagem
                  </button>
                </div>
              </>
            )}

            {orderStep === 'count-stock' && (
              <>
                <div className="p-6 space-y-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-blue-800">
                      Insira a quantidade atual em stock de cada produto antes de fazer a encomenda.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {orderItems.map((item) => (
                      <div key={item.product.id} className="p-4 bg-slate-50 rounded-lg">
                        <div className="font-medium text-slate-800 mb-3">{item.product.name}</div>
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">
                            Stock Atual ({item.product.unit})
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.currentStock}
                            onChange={(e) => handleUpdateCurrentStock(item.product.id, parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#048ABF]"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-6 border-t border-slate-200 flex gap-3">
                  <button
                    onClick={handleBackToProducts}
                    className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={handleProceedToQuantities}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-[#038C5A] to-[#048ABF] text-white rounded-lg hover:shadow-lg transition"
                  >
                    Continuar para Quantidades
                  </button>
                </div>
              </>
            )}

            {orderStep === 'set-quantities' && (
              <>
                <div className="p-6 space-y-6">
                  <div className="space-y-3">
                    {orderItems.map((item) => (
                      <div key={item.product.id} className="p-4 bg-slate-50 rounded-lg">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="font-medium text-slate-800">{item.product.name}</div>
                            <div className="text-sm text-slate-600">Stock atual: {item.currentStock} {item.product.unit}</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-slate-600 mb-1">
                              Quantidade a Encomendar ({item.product.unit})
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.quantity}
                              onChange={(e) => handleUpdateQuantity(item.product.id, parseFloat(e.target.value) || 0)}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#048ABF]"
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-600 mb-1">
                              Observações
                            </label>
                            <input
                              type="text"
                              value={item.notes}
                              onChange={(e) => handleUpdateNotes(item.product.id, e.target.value)}
                              placeholder="Ex: Bem maduro"
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#048ABF]"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Observações Gerais
                    </label>
                    <textarea
                      value={orderNotes}
                      onChange={(e) => setOrderNotes(e.target.value)}
                      rows={3}
                      placeholder="Informações adicionais para o fornecedor..."
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#048ABF]"
                    />
                  </div>
                </div>

                <div className="p-6 border-t border-slate-200 flex gap-3">
                  <button
                    onClick={handleBackToStockCount}
                    className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={handleSaveOrder}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-[#038C5A] to-[#048ABF] text-white rounded-lg hover:shadow-lg transition"
                  >
                    Criar Encomenda
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showViewModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
              <div>
                <h2 className="text-xl font-bold text-slate-800">
                  Encomenda {selectedOrder.order_number}
                </h2>
                <p className="text-sm text-slate-600">
                  {new Date(selectedOrder.created_at!).toLocaleDateString('pt-PT', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>
              <button
                onClick={() => setShowViewModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-medium text-slate-700 mb-1">Fornecedor</h3>
                  <p className="text-slate-900">{selectedOrder.supplier.name}</p>
                  {selectedOrder.supplier.email && (
                    <p className="text-sm text-slate-600">{selectedOrder.supplier.email}</p>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-medium text-slate-700 mb-1">Loja</h3>
                  <p className="text-slate-900">{selectedOrder.store.name}</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-slate-700 mb-1">Estado</h3>
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(selectedOrder.status)}`}>
                  {getStatusLabel(selectedOrder.status)}
                </span>
              </div>

              <div>
                <h3 className="text-sm font-medium text-slate-700 mb-3">Produtos</h3>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">
                          Produto
                        </th>
                        <th className="text-right px-4 py-3 text-sm font-semibold text-slate-700">
                          Quantidade
                        </th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">
                          Observações
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrder.items.map((item) => (
                        <tr key={item.id} className="border-t border-slate-100">
                          <td className="px-4 py-3 text-slate-800">
                            {item.product.name}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700">
                            {item.quantity} {item.product.unit}
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-sm">
                            {item.notes || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {selectedOrder.notes && (
                <div>
                  <h3 className="text-sm font-medium text-slate-700 mb-2">Observações</h3>
                  <div className="p-4 bg-slate-50 rounded-lg text-slate-700">
                    {selectedOrder.notes}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-200 flex gap-3">
              <button
                onClick={() => setShowViewModal(false)}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition"
              >
                Fechar
              </button>
              {selectedOrder.status === 'draft' && (
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    handleSendOrder(selectedOrder);
                  }}
                  disabled={sending}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-[#038C5A] to-[#048ABF] text-white rounded-lg hover:shadow-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Enviar por Email
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
