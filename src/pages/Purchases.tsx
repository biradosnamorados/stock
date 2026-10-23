// Compras a fornecedores: encomendas (enviadas por email) e receção da mercadoria com a fatura.
// Junta as antigas páginas "Encomendas Fornecedores" e "Receção Mercadoria".
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShoppingCart, PackageCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import PurchaseOrders from './PurchaseOrders';
import GoodsReceipts from './GoodsReceipts';

export default function Purchases() {
  const { hasPermission } = useAuth();
  const [params, setParams] = useSearchParams();
  const canOrders = hasPermission('purchase_orders', 'view');
  const canReceipts = hasPermission('goods_receipts', 'view');
  const wanted = params.get('tab');
  const tab: 'encomendas' | 'rececoes' =
    wanted === 'rececoes' && canReceipts ? 'rececoes' : canOrders ? 'encomendas' : 'rececoes';
  const [refresh, setRefresh] = useState(0);

  const setTab = (t: string) => setParams(t === 'encomendas' ? {} : { tab: t }, { replace: true });

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Compras a Fornecedores</h1>
        <p className="text-slate-600 mt-1 text-sm">Encomendar aos fornecedores, receber a mercadoria e guardar a fatura.</p>
      </div>

      <div className="flex gap-2 mb-5 border-b border-slate-200">
        {canOrders && (
          <button onClick={() => setTab('encomendas')}
            className={`flex items-center gap-2 px-4 py-2.5 -mb-px border-b-2 font-medium text-sm ${tab === 'encomendas' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-600 hover:text-slate-800'}`}>
            <ShoppingCart className="w-4 h-4" /> Encomendas
          </button>
        )}
        {canReceipts && (
          <button onClick={() => setTab('rececoes')}
            className={`flex items-center gap-2 px-4 py-2.5 -mb-px border-b-2 font-medium text-sm ${tab === 'rececoes' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-600 hover:text-slate-800'}`}>
            <PackageCheck className="w-4 h-4" /> Receções e faturas
          </button>
        )}
      </div>

      {tab === 'encomendas' && canOrders && <PurchaseOrders embedded onReceived={() => setRefresh((r) => r + 1)} />}
      {tab === 'rececoes' && canReceipts && <GoodsReceipts embedded refreshKey={refresh} />}
      {!canOrders && !canReceipts && <p className="text-slate-600">Sem acesso.</p>}
    </div>
  );
}
