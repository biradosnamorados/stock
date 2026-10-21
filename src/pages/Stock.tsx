import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Package, AlertTriangle, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';

interface BatchDetail {
  batch_code: string;
  production_date: string;
  expiry_date: string;
  units_count: number;
  in_stock: number;
  reserved: number;
  shipped: number;
  locations?: { [key: string]: { name: string; count: number; in_stock: number } };
}

interface StockItem {
  product_id: string;
  product_code: string;
  product_name: string;
  total_units: number;
  in_stock: number;
  reserved: number;
  shipped: number;
  total_weight: number | null;
  unit: string;
  expiring_soon: number;
  batches: BatchDetail[];
}

export default function Stock() {
  const { profile } = useAuth();
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadStock();
  }, [profile]);

  const loadStock = async () => {
    if (!profile?.unit_id) {
      console.log('No unit_id in profile:', profile);
      return;
    }

    try {
      console.log('Loading stock for unit:', profile.unit_id);

      const { data: unitData } = await supabase
        .from('units')
        .select('type')
        .eq('id', profile.unit_id)
        .single();

      const isCDP = unitData?.type === 'cdp';

      let query = supabase
        .from('packaged_units')
        .select(`
          id,
          product_id,
          weight,
          unit,
          status,
          location_id,
          products (id, code, name, product_type),
          production_batches (batch_code, production_date, expiry_date),
          units:location_id (name)
        `);

      if (!isCDP) {
        query = query.eq('location_id', profile.unit_id);
      } else {
        query = query.eq('products.product_type', 'finished');
      }

      const { data: packages, error } = await query;

      if (error) {
        console.error('Error loading packages:', error);
        return;
      }

      console.log('Loaded packages:', packages?.length);

      if (!packages) return;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const sevenDaysFromNow = new Date(today);
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

      const stockMap = new Map<string, StockItem>();
      const batchMap = new Map<string, Map<string, BatchDetail>>();

      packages.forEach((pkg: any) => {
        const productId = pkg.product_id;
        console.log('Processing package:', {
          product: pkg.products.name,
          batch_id: pkg.batch_id,
          production_batches: pkg.production_batches
        });

        if (!stockMap.has(productId)) {
          stockMap.set(productId, {
            product_id: productId,
            product_code: pkg.products.code,
            product_name: pkg.products.name,
            total_units: 0,
            in_stock: 0,
            reserved: 0,
            shipped: 0,
            total_weight: 0,
            unit: pkg.unit || '',
            expiring_soon: 0,
            batches: [],
          });
          batchMap.set(productId, new Map());
        }

        const item = stockMap.get(productId)!;
        const productBatches = batchMap.get(productId)!;

        item.total_units++;

        if (pkg.status === 'in_stock' || pkg.status === 'received') {
          item.in_stock++;
        } else if (pkg.status === 'reserved') {
          item.reserved++;
        } else if (pkg.status === 'shipped') {
          item.shipped++;
        }

        if (pkg.weight) {
          item.total_weight = (item.total_weight || 0) + parseFloat(pkg.weight);
        }

        if (pkg.production_batches?.expiry_date) {
          const expiryDate = new Date(pkg.production_batches.expiry_date);
          expiryDate.setHours(0, 0, 0, 0);

          if (expiryDate >= today && expiryDate <= sevenDaysFromNow && (pkg.status === 'in_stock' || pkg.status === 'received')) {
            item.expiring_soon++;
          }

          const batchCode = pkg.production_batches.batch_code;
          if (!productBatches.has(batchCode)) {
            productBatches.set(batchCode, {
              batch_code: batchCode,
              production_date: pkg.production_batches.production_date,
              expiry_date: pkg.production_batches.expiry_date,
              units_count: 0,
              in_stock: 0,
              reserved: 0,
              shipped: 0,
              locations: isCDP ? {} : undefined,
            });
          }

          const batch = productBatches.get(batchCode)!;
          batch.units_count++;
          if (pkg.status === 'in_stock' || pkg.status === 'received') {
            batch.in_stock++;
          } else if (pkg.status === 'reserved') {
            batch.reserved++;
          } else if (pkg.status === 'shipped') {
            batch.shipped++;
          }

          if (isCDP && pkg.units && batch.locations) {
            const locationId = pkg.location_id;
            const locationName = pkg.units.name;
            if (!batch.locations[locationId]) {
              batch.locations[locationId] = { name: locationName, count: 0, in_stock: 0 };
            }
            batch.locations[locationId].count++;
            if (pkg.status === 'in_stock' || pkg.status === 'received') {
              batch.locations[locationId].in_stock++;
            }
          }
        }
      });

      stockMap.forEach((item, productId) => {
        const productBatches = batchMap.get(productId);
        if (productBatches) {
          item.batches = Array.from(productBatches.values()).sort((a, b) =>
            new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime()
          );
        }
      });

      const stockArray = Array.from(stockMap.values());
      console.log('Stock items with batch counts:', stockArray.map(s => ({
        product: s.product_name,
        batches: s.batches.length
      })));
      setStock(stockArray);
    } catch (err) {
      console.error('Error loading stock:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredStock = stock.filter(item =>
    item.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.product_code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleProductExpansion = (productId: string) => {
    console.log('Toggling expansion for:', productId);
    const stockItem = stock.find(s => s.product_id === productId);
    console.log('Stock item:', stockItem);
    console.log('Batches:', stockItem?.batches);
    const newExpanded = new Set(expandedProducts);
    if (newExpanded.has(productId)) {
      newExpanded.delete(productId);
      console.log('Collapsing product');
    } else {
      newExpanded.add(productId);
      console.log('Expanding product');
    }
    setExpandedProducts(newExpanded);
    console.log('New expanded set:', Array.from(newExpanded));
  };

  const isExpiringSoon = (expiryDate: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);
    return expiry >= today && expiry <= sevenDaysFromNow;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">A carregar dados de stock...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800">Visão Geral de Stock</h1>
        <p className="text-slate-600 mt-2">Níveis de inventário e estado atual</p>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Pesquisar produtos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Produto</th>
                <th className="text-right px-6 py-4 text-sm font-semibold text-slate-700">Total de Unidades</th>
                <th className="text-right px-6 py-4 text-sm font-semibold text-slate-700">Em Stock</th>
                <th className="text-right px-6 py-4 text-sm font-semibold text-slate-700">Reservado</th>
                <th className="text-right px-6 py-4 text-sm font-semibold text-slate-700">Enviado</th>
                <th className="text-right px-6 py-4 text-sm font-semibold text-slate-700">Peso Total</th>
                <th className="text-center px-6 py-4 text-sm font-semibold text-slate-700">Alertas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredStock.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    <Package className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                    <p>Sem dados de stock disponíveis</p>
                  </td>
                </tr>
              ) : (
                filteredStock.map((item) => (
                  <React.Fragment key={item.product_id}>
                    <tr className="hover:bg-slate-50 transition">
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => toggleProductExpansion(item.product_id)}
                            className="text-slate-400 hover:text-slate-600"
                          >
                            {expandedProducts.has(item.product_id) ? (
                              <ChevronUp className="w-5 h-5" />
                            ) : (
                              <ChevronDown className="w-5 h-5" />
                            )}
                          </button>
                          <div>
                            <p className="font-medium text-slate-800">{item.product_name}</p>
                            <p className="text-sm text-slate-500">{item.product_code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-medium text-slate-800">{item.total_units}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-green-700 font-medium">{item.in_stock}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-blue-700 font-medium">{item.reserved}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-slate-600">{item.shipped}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm text-slate-600">
                          {item.total_weight
                            ? `${item.total_weight.toFixed(2)} ${item.unit}`
                            : 'N/A'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center">
                          {item.expiring_soon > 0 && (
                            <div className="flex items-center space-x-1 text-orange-600" title={`${item.expiring_soon} unidades a expirar em breve`}>
                              <AlertTriangle className="w-5 h-5" />
                              <span className="text-sm font-medium">{item.expiring_soon}</span>
                            </div>
                          )}
                          {item.in_stock === 0 && item.reserved === 0 && (
                            <span className="text-xs text-red-600 font-medium">Sem stock</span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedProducts.has(item.product_id) && item.batches.length > 0 && (
                      <tr>
                        <td colSpan={7} className="px-6 py-4 bg-slate-50">
                          <div className="ml-10">
                            <h4 className="text-sm font-semibold text-slate-700 mb-3">Lotes em Stock</h4>
                            <div className="space-y-2">
                              {item.batches.map((batch) => (
                                <div
                                  key={batch.batch_code}
                                  className={`p-3 rounded-lg border ${
                                    isExpiringSoon(batch.expiry_date)
                                      ? 'bg-orange-50 border-orange-200'
                                      : 'bg-white border-slate-200'
                                  }`}
                                >
                                  <div className="grid grid-cols-6 gap-4 text-sm mb-3">
                                    <div>
                                      <p className="text-slate-500 text-xs mb-1">Lote</p>
                                      <p className="font-medium text-slate-800">{batch.batch_code}</p>
                                    </div>
                                    <div>
                                      <p className="text-slate-500 text-xs mb-1">Produção</p>
                                      <p className="text-slate-700">{format(new Date(batch.production_date), 'dd/MM/yyyy')}</p>
                                    </div>
                                    <div>
                                      <p className="text-slate-500 text-xs mb-1">Validade</p>
                                      <p className={`font-medium ${isExpiringSoon(batch.expiry_date) ? 'text-orange-700' : 'text-slate-700'}`}>
                                        {format(new Date(batch.expiry_date), 'dd/MM/yyyy')}
                                      </p>
                                    </div>
                                    <div className="text-center">
                                      <p className="text-slate-500 text-xs mb-1">Em Stock</p>
                                      <p className="text-green-700 font-medium">{batch.in_stock}</p>
                                    </div>
                                    <div className="text-center">
                                      <p className="text-slate-500 text-xs mb-1">Reservado</p>
                                      <p className="text-blue-700 font-medium">{batch.reserved}</p>
                                    </div>
                                    <div className="text-center">
                                      <p className="text-slate-500 text-xs mb-1">Enviado</p>
                                      <p className="text-slate-600">{batch.shipped}</p>
                                    </div>
                                  </div>
                                  {batch.locations && Object.keys(batch.locations).length > 0 && (
                                    <div className="border-t border-slate-200 pt-3 mt-3">
                                      <p className="text-slate-500 text-xs mb-2">Distribuição por Unidade:</p>
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                        {Object.values(batch.locations).map((location) => (
                                          <div key={location.name} className="bg-slate-100 rounded px-2 py-1">
                                            <p className="text-xs font-medium text-slate-700">{location.name}</p>
                                            <p className="text-xs text-slate-600">
                                              Total: {location.count} | Em Stock: {location.in_stock}
                                            </p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
