// Interface da app no telemóvel: barra de separadores em baixo (Hoje · Ler QR · Caixa/Stock · Mais),
// ecrãs com botões grandes e respeito pelas zonas seguras do iPhone (entalhe e barra inferior).
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Home, QrCode, Wallet, Warehouse, ChefHat, MoreHorizontal, ChevronLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const ROOTS = ['/', '/scanner', '/cash-closing', '/stock', '/production', '/mais'];

export default function MobileLayout() {
  const { hasPermission } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // 3.º separador conforme o trabalho da pessoa
  const third = hasPermission('cash_closing')
    ? { href: '/cash-closing', label: 'Caixa', icon: Wallet }
    : hasPermission('production')
      ? { href: '/production', label: 'Produção', icon: ChefHat }
      : hasPermission('stock')
        ? { href: '/stock', label: 'Stock', icon: Warehouse }
        : null;

  const tabs = [
    { href: '/', label: 'Hoje', icon: Home },
    ...(hasPermission('scanner') ? [{ href: '/scanner', label: 'Ler QR', icon: QrCode }] : []),
    ...(third ? [third] : []),
    { href: '/mais', label: 'Mais', icon: MoreHorizontal },
  ];

  const path = location.pathname;
  const isRoot = ROOTS.includes(path);
  const active = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));

  return (
    <div className="bn-app min-h-screen bg-[#F6F4EF] text-[#1F2420] flex flex-col" style={{ fontFamily: "'Nunito', system-ui, sans-serif" }}>
      {!isRoot && (
        <div className="sticky top-0 z-30 bg-[#F6F4EF]/95 backdrop-blur border-b border-[#ECE8DF]" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
            className="flex items-center gap-1 h-12 px-3 text-[#015939] font-bold text-base">
            <ChevronLeft className="w-6 h-6" /> Voltar
          </button>
        </div>
      )}

      <main className="flex-1" style={{ paddingTop: isRoot ? 'env(safe-area-inset-top)' : 0, paddingBottom: 'calc(76px + env(safe-area-inset-bottom))' }}>
        <Outlet />
      </main>

      <nav aria-label="Navegação principal"
        className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#ECE8DF] grid"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`, paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {tabs.map((t) => {
          const Icon = t.icon;
          const on = active(t.href);
          return (
            <Link key={t.href} to={t.href}
              className={`flex flex-col items-center justify-center gap-0.5 h-[64px] text-xs ${on ? 'text-[#015939] font-extrabold' : 'text-[#5B635E] font-bold'}`}>
              <Icon className="w-6 h-6" strokeWidth={on ? 2.4 : 2} />
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
