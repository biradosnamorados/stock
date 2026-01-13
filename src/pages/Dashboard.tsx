import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  LayoutDashboard,
  Package,
  AlertTriangle,
  TrendingUp,
  Warehouse,
} from 'lucide-react';

export default function Dashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState({
    totalProducts: 0,
    lowStockItems: 0,
    pendingOrders: 0,
    unreadAlerts: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [profile]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const storeFilter = profile?.role === 'store_user' && profile.store_id
        ? profile.store_id
        : undefined;

      const [productsRes, stockRes, ordersRes, alertsRes] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }),
        storeFilter
          ? supabase
              .from('stock')
              .select('quantity, minimum_stock')
              .eq('store_id', storeFilter)
          : supabase.from('stock').select('quantity, minimum_stock'),
        storeFilter
          ? supabase.from('orders').select('id', { count: 'exact', head: true }).eq('store_id', storeFilter).eq('status', 'pending')
          : supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        storeFilter
          ? supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('store_id', storeFilter).eq('is_read', false)
          : supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('is_read', false),
      ]);

      // Filter low stock items in JavaScript
      const lowStockItems = stockRes.data?.filter(item => item.quantity < item.minimum_stock) || [];

      setStats({
        totalProducts: productsRes.count || 0,
        lowStockItems: lowStockItems.length,
        pendingOrders: ordersRes.count || 0,
        unreadAlerts: alertsRes.count || 0,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Total Produtos',
      value: stats.totalProducts,
      icon: Package,
      color: 'from-[#048ABF] to-[#038C5A]',
    },
    {
      title: 'Stock Baixo',
      value: stats.lowStockItems,
      icon: AlertTriangle,
      color: 'from-[#F2B705] to-[#F20519]',
    },
    {
      title: 'Encomendas Pendentes',
      value: stats.pendingOrders,
      icon: TrendingUp,
      color: 'from-[#038C5A] to-[#048ABF]',
    },
    {
      title: 'Alertas',
      value: stats.unreadAlerts,
      icon: Warehouse,
      color: 'from-[#F20519] to-[#F2B705]',
    },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-gradient-to-br from-[#F20519] to-[#048ABF] rounded-xl">
          <LayoutDashboard className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-slate-600">
            {profile?.role === 'admin' ? 'Visão geral de todas as lojas' : `Loja ${profile?.store_id}`}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-600">A carregar...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <div
                key={index}
                className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-lg transition"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 bg-gradient-to-br ${card.color} rounded-xl`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                </div>
                <h3 className="text-slate-600 text-sm font-medium mb-1">{card.title}</h3>
                <p className="text-3xl font-bold text-slate-800">{card.value}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-8 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-xl font-bold text-slate-800 mb-4">Bem-vindo ao Sistema de Gestão</h2>
        <p className="text-slate-600 leading-relaxed">
          Este sistema permite gerir o stock, fornecedores, encomendas, receções e vendas das lojas
          Bira dos Namorados. Use o menu lateral para navegar entre as diferentes secções.
        </p>
      </div>
    </div>
  );
}
