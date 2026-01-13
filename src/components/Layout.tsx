import { ReactNode, useState } from 'react';
import { useAuth } from '../lib/auth';
import {
  LayoutDashboard,
  Package,
  FolderOpen,
  Users,
  UserCog,
  Warehouse,
  FileText,
  ShoppingCart,
  ClipboardCheck,
  Upload,
  Bell,
  History,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '../lib/utils';

interface LayoutProps {
  children: ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
}

interface NavItem {
  label: string;
  icon: typeof LayoutDashboard;
  path: string;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: 'dashboard' },
  { label: 'Produtos', icon: Package, path: 'products', adminOnly: true },
  { label: 'Categorias', icon: FolderOpen, path: 'categories', adminOnly: true },
  { label: 'Fornecedores', icon: Users, path: 'suppliers' },
  { label: 'Stock', icon: Warehouse, path: 'stock' },
  { label: 'Fichas Técnicas', icon: FileText, path: 'technical-sheets' },
  { label: 'Encomendas', icon: ShoppingCart, path: 'orders' },
  { label: 'Receções', icon: ClipboardCheck, path: 'receptions' },
  { label: 'Importar Vendas', icon: Upload, path: 'sales-import' },
  { label: 'Histórico Produtos', icon: History, path: 'product-history', adminOnly: true },
  { label: 'Utilizadores', icon: UserCog, path: 'users', adminOnly: true },
  { label: 'Alertas', icon: Bell, path: 'alerts' },
];

export default function Layout({ children, currentPage, onNavigate }: LayoutProps) {
  const { profile, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const filteredNavItems = navItems.filter(
    (item) => !item.adminOnly || profile?.role === 'admin'
  );

  const handleNavClick = (path: string) => {
    onNavigate(path);
    setSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 z-30 flex items-center px-4 lg:px-6">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="lg:hidden mr-3 p-2 hover:bg-slate-100 rounded-lg transition"
        >
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-[#F20519] to-[#048ABF] rounded-lg" />
          <div className="hidden sm:block">
            <h1 className="text-lg font-bold text-slate-800">Bira dos Namorados</h1>
            <p className="text-xs text-slate-600">Gestão de Stock</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-slate-800">{profile?.full_name}</p>
            <p className="text-xs text-slate-600">
              {profile?.role === 'admin' ? 'Administrador' : 'Utilizador'}
            </p>
          </div>
          <button
            onClick={() => signOut()}
            className="p-2 hover:bg-slate-100 rounded-lg transition"
            title="Sair"
          >
            <LogOut className="w-5 h-5 text-slate-600" />
          </button>
        </div>
      </div>

      <aside
        className={cn(
          'fixed top-16 left-0 bottom-0 w-64 bg-white border-r border-slate-200 z-20 transition-transform duration-200 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <nav className="p-4 space-y-1">
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.path;
            return (
              <button
                key={item.path}
                onClick={() => handleNavClick(item.path)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition',
                  isActive
                    ? 'bg-gradient-to-r from-[#F20519] to-[#048ABF] text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/50 z-10 lg:hidden"
        />
      )}

      <main className="pt-16 lg:pl-64">
        <div className="p-4 lg:p-6">{children}</div>
      </main>
    </div>
  );
}
