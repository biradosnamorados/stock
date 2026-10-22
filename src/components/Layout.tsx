import { useState, useEffect } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { LayoutDashboard, Package, PackageOpen, Warehouse, ShoppingCart, Truck as TruckIcon, ClipboardList, QrCode, LogOut, Menu, X, Settings, Users, Building2, Mail, ChevronDown, ChevronRight, TrendingUp, Upload, ChefHat, ClipboardCheck, ShieldCheck, CheckSquare, Shield, UserPlus, Wallet, Banknote, BarChart3 } from 'lucide-react';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const { profile, signOut, hasPermission } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (profile?.role !== 'Admin') return;
    const fetchPending = async () => {
      const { count } = await supabase
        .from('registration_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      setPendingCount(count || 0);
    };
    fetchPending();
  }, [profile?.role]);

  const navigation = [
    { name: 'Painel', href: '/', icon: LayoutDashboard, moduleCode: 'dashboard' },
    { name: 'Receitas', href: '/recipes', icon: ChefHat, moduleCode: 'recipes', units: ['Centro de Produção'] },
    { name: 'Produção', href: '/production', icon: Package, moduleCode: 'production', units: ['Centro de Produção'] },
    { name: 'Embalamento', href: '/packaging', icon: PackageOpen, moduleCode: 'packaging', units: ['Centro de Produção'] },
    { name: 'Stock', href: '/stock', icon: Warehouse, moduleCode: 'stock' },
    { name: 'Contagem Stock', href: '/stock-counts', icon: ClipboardCheck, moduleCode: 'stock_counts' },
    { name: 'HACCP', href: '/haccp', icon: ShieldCheck, moduleCode: 'haccp' },
    { name: 'Tarefas Obrigatórias', href: '/mandatory-tasks', icon: CheckSquare, moduleCode: 'mandatory_tasks' },
    // Fecho de caixa: qualquer pessoa da equipa de Sala, gerentes (Chefe) e Admin
    { name: 'Fecho de Caixa', href: '/cash-closing', icon: Wallet, moduleCode: 'cash_closing', alsoFor: { roles: ['Chefe'], departments: ['Sala'] } },
    { name: 'Relatório de Fechos', href: '/cash-closing-report', icon: BarChart3, moduleCode: 'cash_closing', roles: ['Admin', 'Chefe'] },
    { name: 'Encomendas Internas', href: '/internal-orders', icon: TruckIcon, moduleCode: 'internal_orders' },
    { name: 'Encomendas Fornecedores', href: '/purchase-orders', icon: ShoppingCart, moduleCode: 'purchase_orders' },
    { name: 'Receção Mercadoria', href: '/goods-receipts', icon: ClipboardList, moduleCode: 'goods_receipts' },
    { name: 'Análise de Preços', href: '/price-analysis', icon: TrendingUp, moduleCode: 'price_analysis' },
    { name: 'Scanner QR', href: '/scanner', icon: QrCode, moduleCode: 'stock' },
    { name: 'Ações QR', href: '/qr-scanner', icon: QrCode, moduleCode: 'stock' },
  ];

  const settingsNavigation = [
    { name: 'Produtos', href: '/products', icon: Package, moduleCode: 'products' },
    { name: 'Fornecedores', href: '/suppliers', icon: Building2, moduleCode: 'suppliers' },
    { name: 'Importar Dados', href: '/import', icon: Upload, moduleCode: 'import' },
    { name: 'Utilizadores', href: '/users', icon: Users, moduleCode: 'users' },
    { name: 'Perfis de Acesso', href: '/access-profiles', icon: Shield, moduleCode: 'users' },
    { name: 'Pedidos de Registo', href: '/pending-registrations', icon: UserPlus, moduleCode: 'users' },
    { name: 'Configurações SMTP', href: '/smtp-settings', icon: Mail, moduleCode: 'smtp_settings' },
    { name: 'Máquina de Trocos', href: '/cashmatic-settings', icon: Banknote, moduleCode: 'cashmatic_settings' },
  ];

  const hasAccess = (item: { moduleCode: string; units?: string[]; roles?: string[]; alsoFor?: { roles?: string[]; departments?: string[] } }) => {
    if (!profile) return false;

    if (item.roles && !item.roles.includes(profile.role)) return false;

    const byTeam = !!item.alsoFor && (
      (item.alsoFor.roles?.includes(profile.role) ?? false) ||
      (item.alsoFor.departments?.includes(profile.departments?.name ?? '') ?? false)
    );

    if (!byTeam && !hasPermission(item.moduleCode, 'view')) return false;

    if (item.units && item.units.length > 0) {
      const userUnit = profile.units?.name;
      return userUnit ? item.units.includes(userUnit) : false;
    }

    return true;
  };

  const filteredNavigation = navigation.filter(item => hasAccess(item));
  const filteredSettings = settingsNavigation.filter(item => hasAccess(item));

  const isActive = (href: string) => {
    return location.pathname === href;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="lg:flex lg:h-screen">
        {/* Mobile sidebar backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`
            fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          `}
        >
          <div className="flex flex-col h-full">
            {/* Logo */}
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h1 className="text-xl font-bold text-slate-800">Bira dos Namorados</h1>
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden p-2 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* User info */}
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-medium">
                  {profile?.full_name?.[0] || profile?.email?.[0] || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {profile?.full_name || profile?.email}
                  </p>
                  <p className="text-xs text-slate-500">
                    {profile?.role}
                  </p>
                  {profile?.units?.name && (
                    <p className="text-xs text-slate-400">
                      {profile.units.name}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto p-4">
              <ul className="space-y-1">
                {filteredNavigation.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <li key={item.name}>
                      <Link
                        to={item.href}
                        onClick={() => setSidebarOpen(false)}
                        className={`
                          flex items-center space-x-3 px-4 py-3 rounded-lg transition
                          ${active
                            ? 'bg-blue-50 text-blue-700 font-medium'
                            : 'text-slate-700 hover:bg-slate-50'
                          }
                        `}
                      >
                        <Icon className="w-5 h-5" />
                        <span>{item.name}</span>
                      </Link>
                    </li>
                  );
                })}

                {/* Settings Section */}
                {filteredSettings.length > 0 && (
                  <li className="mt-6">
                    <button
                      onClick={() => setSettingsOpen(!settingsOpen)}
                      className="flex items-center justify-between w-full px-4 py-3 rounded-lg text-slate-700 hover:bg-slate-50 transition"
                    >
                      <div className="flex items-center space-x-3">
                        <Settings className="w-5 h-5" />
                        <span>Ajustes</span>
                      </div>
                      {settingsOpen ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>

                    {settingsOpen && (
                      <ul className="mt-1 ml-4 space-y-1">
                        {filteredSettings.map((item) => {
                          const Icon = item.icon;
                          const active = isActive(item.href);
                          return (
                            <li key={item.name}>
                              <Link
                                to={item.href}
                                onClick={() => setSidebarOpen(false)}
                                className={`
                                  flex items-center space-x-3 px-4 py-2 rounded-lg transition text-sm
                                  ${active
                                    ? 'bg-blue-50 text-blue-700 font-medium'
                                    : 'text-slate-600 hover:bg-slate-50'
                                  }
                                `}
                              >
                                <Icon className="w-4 h-4" />
                                <span className="flex-1">{item.name}</span>
                                {item.href === '/pending-registrations' && pendingCount > 0 && (
                                  <span className="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                                    {pendingCount > 9 ? '9+' : pendingCount}
                                  </span>
                                )}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                )}
              </ul>
            </nav>

            {/* Logout */}
            <div className="p-4 border-t border-slate-200">
              <button
                onClick={() => signOut()}
                className="flex items-center space-x-3 px-4 py-3 rounded-lg text-red-600 hover:bg-red-50 transition w-full"
              >
                <LogOut className="w-5 h-5" />
                <span>Sair</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile header */}
          <header className="lg:hidden bg-white border-b border-slate-200 p-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 hover:bg-slate-100 rounded-lg"
            >
              <Menu className="w-6 h-6" />
            </button>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
