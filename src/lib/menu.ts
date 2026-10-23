// Menu da app, partilhado entre o site (barra lateral) e a app móvel (separador "Mais").
import { Megaphone, LayoutDashboard, Package, PackageOpen, Warehouse, ShoppingCart, Truck as TruckIcon, QrCode, Settings, Users, Building2, Mail, TrendingUp, Upload, ChefHat, ClipboardCheck, ShieldCheck, CheckSquare, Shield, UserPlus, Wallet, Banknote, BarChart3, Bike } from 'lucide-react';

export type NavItem = {
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
export type NavGroup = { key: string; name: string; icon: any; items: NavItem[] };

// Menu organizado por área. Um grupo com só uma opção visível aparece direto, sem submenu.
export const buildMenu = (pendingCount = 0): NavGroup[] => [
  { key: 'inicio', name: 'Início', icon: LayoutDashboard, items: [
    { name: 'Painel', href: '/', icon: LayoutDashboard, moduleCode: 'dashboard' },
    { name: 'Ler QR', href: '/scanner', icon: QrCode, moduleCode: 'scanner' },
    { name: 'Enviar aviso', href: '/avisos/novo', icon: Megaphone, moduleCode: 'notices' },
  ] },
  { key: 'caixa', name: 'Caixa', icon: Wallet, items: [
    { name: 'Fecho de Caixa', href: '/cash-closing', icon: Wallet, moduleCode: 'cash_closing' },
    { name: 'Histórico de Fechos', href: '/cash-closing-report', icon: BarChart3, moduleCode: 'cash_closing_manage' },
    { name: 'Uber Eats', href: '/uber', icon: Bike, moduleCode: 'uber' },
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
    { name: 'Níveis de Acesso', href: '/access-profiles', icon: Shield, moduleCode: 'access_rules' },
    { name: 'Máquina de Trocos', href: '/cashmatic-settings', icon: Banknote, moduleCode: 'cashmatic_settings' },
    { name: 'Email (SMTP)', href: '/smtp-settings', icon: Mail, moduleCode: 'smtp_settings' },
    { name: 'Importar Dados', href: '/import', icon: Upload, moduleCode: 'import' },
  ] },
];

type MenuProfile = { role: string; departments?: { name?: string } | null; units?: { name?: string } | null } | null;

// Mesmo critério da barra lateral: área permitida (grelha de acessos) e, se indicado, só em certas unidades.
export function canSee(item: NavItem, profile: MenuProfile, hasPermission: (m: string, a?: string) => boolean) {
  if (!profile) return false;
  if (item.roles && !item.roles.includes(profile.role)) return false;
  const byTeam = !!item.alsoFor && (
    (item.alsoFor.roles?.includes(profile.role) ?? false) ||
    (item.alsoFor.departments?.includes(profile.departments?.name ?? '') ?? false)
  );
  const byModule = (item.anyModules ?? [item.moduleCode]).some((m) => hasPermission(m, 'view'));
  if (!byTeam && !byModule) return false;
  if (item.units && item.units.length > 0) {
    const u = profile.units?.name;
    return u ? item.units.includes(u) : false;
  }
  return true;
}
