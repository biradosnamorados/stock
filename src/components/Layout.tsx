import { useState, useEffect } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { LayoutDashboard, Package, PackageOpen, Warehouse, ShoppingCart, Truck as TruckIcon, ClipboardList, QrCode, LogOut, Menu, X, Settings, Users, Building2, Mail, ChevronDown, ChevronRight, TrendingUp, Upload, ChefHat, ClipboardCheck, ShieldCheck, CheckSquare, Shield, UserPlus, Wallet, Banknote, BarChart3, Bike } from 'lucide-react';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
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

  type NavItem = {
    name: string;
    href: string;
    icon: any;
    moduleCode: string;
    anyModules?: string[];
    units?: string[];
    roles?: string[];
    alsoFor?: { roles?: string[]; departments?: string[] };
    badge?: number;
  };
  type NavGroup = { key: string; name: string; icon: any; items: NavItem[] };

  // Menu organizado por área. Um grupo com só uma opção visível aparece direto, sem submenu.
  const groups: NavGroup[] = [
    { key: 'inicio', name: 'Início', icon: LayoutDashboard, items: [
      { name: 'Painel', href: '/', icon: LayoutDashboard, moduleCode: 'dashboard' },
      { name: 'Ler QR', href: '/scanner', icon: QrCode, moduleCode: 'stock' },
    ] },
    { key: 'caixa', name: 'Caixa', icon: Wallet, items: [
      // Fecho de caixa: qualquer pessoa da equipa de Sala, gerentes (Chefe) e Admin
      { name: 'Fecho de Caixa', href: '/cash-closing', icon: Wallet, moduleCode: 'cash_closing', alsoFor: { roles: ['Chefe'], departments: ['Sala'] } },
      { name: 'Histórico de Fechos', href: '/cash-closing-report', icon: BarChart3, moduleCode: 'cash_closing', roles: ['Admin', 'Chefe'] },
      { name: 'Uber Eats', href: '/uber', icon: Bike, moduleCode: 'cash_closing', roles: ['Admin', 'Chefe'] },
    ] },
    { key: 'encomendas', name: 'Encomendas', icon: TruckIcon, items: [
      { name: 'Pedidos ao CDP / CDO', href: '/internal-orders', icon: TruckIcon, moduleCode: 'internal_orders' },
      { name: 'Compras a Fornecedores', href: '/purchases', icon: ShoppingCart, moduleCode: 'purchase_orders', anyModules: ['purchase_orders', 'goods_receipts'] },
    ] },
    { key: 'stock', name: 'Stock', icon: Warehouse, items: [
      { name: 'Stock', href: '/stock', icon: Warehouse, moduleCode: 'stock' },
      { name: 'Contagem de Stock', href: '/stock-counts', icon: ClipboardCheck, moduleCode: 'stock_counts' },
      { name: 'Análise de Preços', href: '/price-analysis', icon: TrendingUp, moduleCode: 'price_analysis' },
    ] },
    { key: 'producao', name: 'Produção', icon: ChefHat, items: [
      { name: 'Receitas', href: '/recipes', icon: ChefHat, moduleCode: 'recipes', units: ['Centro de Produção'] },
      { name: 'Produção', href: '/production', icon: Package, moduleCode: 'production', units: ['Centro de Produção'] },
      { name: 'Embalamento e Etiquetas', href: '/packaging', icon: PackageOpen, moduleCode: 'packaging', units: ['Centro de Produção'] },
    ] },
    { key: 'qualidade', name: 'Qualidade', icon: ShieldCheck, items: [
      { name: 'HACCP', href: '/haccp', icon: ShieldCheck, moduleCode: 'haccp' },
      { name: 'Tarefas Obrigatórias', href: '/mandatory-tasks', icon: CheckSquare, moduleCode: 'mandatory_tasks' },
    ] },
    { key: 'ajustes', name: 'Ajustes', icon: Settings, items: [
      { name: 'Produtos', href: '/products', icon: Package, moduleCode: 'products' },
      { name: 'Fornecedores', href: '/suppliers', icon: Building2, moduleCode: 'suppliers' },
      { name: 'Utilizadores', href: '/users', icon: Users, moduleCode: 'users' },
      { name: 'Pedidos de Registo', href: '/pending-registrations', icon: UserPlus, moduleCode: 'users', badge: pendingCount },
      { name: 'Perfis de Acesso', href: '/access-profiles', icon: Shield, moduleCode: 'users' },
      { name: 'Máquina de Trocos', href: '/cashmatic-settings', icon: Banknote, moduleCode: 'cashmatic_settings' },
      { name: 'Email (SMTP)', href: '/smtp-settings', icon: Mail, moduleCode: 'smtp_settings' },
      { name: 'Importar Dados', href: '/import', icon: Upload, moduleCode: 'import' },
    ] },
  ];

  const hasAccess = (item: NavItem) => {
    if (!profile) return false;

    if (item.roles && !item.roles.includes(profile.role)) return false;

    const byTeam = !!item.alsoFor && (
      (item.alsoFor.roles?.includes(profile.role) ?? false) ||
      (item.alsoFor.departments?.includes(profile.departments?.name ?? '') ?? false)
    );
    const byModule = (item.anyModules ?? [item.moduleCode]).some((m) => hasPermission(m, 'view'));

    if (!byTeam && !byModule) return false;

    if (item.units && item.units.length > 0) {
      const userUnit = profile.units?.name;
      return userUnit ? item.units.includes(userUnit) : false;
    }

    return true;
  };

  const visibleGroups = groups
    .map((g) => ({ ...g, items: g.items.filter(hasAccess) }))
    .filter((g) => g.items.length > 0);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('bn_menu_open') || '{}'); } catch { return {}; }
  });
  const toggleGroup = (key: string) => {
    setOpenGroups((o) => {
      const n = { ...o, [key]: !(o[key] ?? defaultOpen(key)) };
      try { localStorage.setItem('bn_menu_open', JSON.stringify(n)); } catch { /* */ }
      return n;
    });
  };
  const groupHasActive = (g: NavGroup) => g.items.some((i) => isActive(i.href));
  const defaultOpen = (key: string) => key !== 'ajustes';

  function isActive(href: string) {
    return href === '/' ? location.pathname === '/' : location.pathname === href || location.pathname.startsWith(href + '/');
  }

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
            <nav className="flex-1 overflow-y-auto p-3">
              <ul className="space-y-1">
                {visibleGroups.map((group) => {
                  const renderLink = (item: NavItem, sub: boolean) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          to={item.href}
                          onClick={() => setSidebarOpen(false)}
                          className={`flex items-center gap-3 rounded-lg transition ${sub ? 'px-3 py-2 text-sm' : 'px-3 py-2.5'} ${
                            active ? 'bg-blue-50 text-blue-700 font-medium' : sub ? 'text-slate-600 hover:bg-slate-50' : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <Icon className={sub ? 'w-4 h-4' : 'w-5 h-5'} />
                          <span className="flex-1">{item.name}</span>
                          {!!item.badge && item.badge > 0 && (
                            <span className="bg-red-500 text-white text-xs font-bold rounded-full min-w-5 h-5 px-1 flex items-center justify-center">
                              {item.badge > 9 ? '9+' : item.badge}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  };

                  // Início e grupos com uma só opção: ligações diretas
                  if (group.key === 'inicio' || group.items.length === 1) {
                    return group.items.map((i) => renderLink(i, false));
                  }

                  const GIcon = group.icon;
                  const open = groupHasActive(group) || (openGroups[group.key] ?? defaultOpen(group.key));
                  const badge = group.items.reduce((s, i) => s + (i.badge ?? 0), 0);
                  return (
                    <li key={group.key} className="pt-1">
                      <button
                        onClick={() => toggleGroup(group.key)}
                        className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-slate-700 hover:bg-slate-50 transition"
                      >
                        <span className="flex items-center gap-3">
                          <GIcon className="w-5 h-5" />
                          <span className="font-medium">{group.name}</span>
                          {!open && badge > 0 && <span className="bg-red-500 w-2 h-2 rounded-full" />}
                        </span>
                        {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                      </button>
                      {open && <ul className="mt-0.5 ml-4 pl-2 border-l border-slate-200 space-y-0.5">{group.items.map((i) => renderLink(i, true))}</ul>}
                    </li>
                  );
                })}
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
