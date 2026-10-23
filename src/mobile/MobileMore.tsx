// "Mais": todas as outras áreas a que a pessoa tem acesso, agrupadas como no site.
import { Link } from 'react-router-dom';
import { ChevronRight, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { buildMenu, canSee } from '../lib/menu';
import { levelLabel } from '../lib/access';

// áreas de escritório: funcionam no telemóvel, mas são mais confortáveis no computador
const OFFICE = new Set(['/cash-closing-report', '/price-analysis', '/products', '/suppliers', '/users', '/access-profiles', '/cashmatic-settings', '/smtp-settings', '/import', '/pending-registrations']);

export default function MobileMore() {
  const { profile, hasPermission, signOut } = useAuth();
  const groups = buildMenu()
    .map((g) => ({ ...g, items: g.items.filter((i) => i.href !== '/' && canSee(i, profile, hasPermission)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="px-5 pt-4 pb-6 flex flex-col gap-5">
      <section className="bg-white rounded-xl p-4 flex items-center gap-3 shadow-[0_1px_2px_rgba(1,89,57,0.06),0_4px_12px_rgba(1,89,57,0.08)]">
        <div className="w-12 h-12 rounded-full bg-[#015939] text-white flex items-center justify-center text-lg font-extrabold">
          {(profile?.full_name || profile?.email || '?')[0]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-extrabold truncate">{profile?.full_name || profile?.email}</p>
          <p className="text-[13px] text-[#5B635E] truncate">
            {[profile?.units?.name, profile?.departments?.name, levelLabel(profile?.access_level ?? (profile?.role === 'Admin' ? 'admin' : null))].filter((x) => x && x !== '—').join(' · ')}
          </p>
        </div>
      </section>

      {groups.map((g) => (
        <section key={g.key} className="flex flex-col gap-2">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#5B635E] px-1">{g.name}</h2>
          <div className="bg-white rounded-xl shadow-[0_1px_2px_rgba(1,89,57,0.06),0_4px_12px_rgba(1,89,57,0.08)] divide-y divide-[#ECE8DF]">
            {g.items.map((i) => {
              const Icon = i.icon;
              return (
                <Link key={i.href} to={i.href} className="flex items-center gap-3 px-4 min-h-[56px]">
                  <Icon className="w-5 h-5 text-[#015939]" />
                  <span className="flex-1 text-[15px] font-bold">{i.name}</span>
                  {OFFICE.has(i.href) && <span className="text-[11px] text-[#5B635E]">melhor no computador</span>}
                  <ChevronRight className="w-5 h-5 text-[#5B635E]" />
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <button onClick={() => signOut()} className="h-14 rounded-2xl border-2 border-[#E8C9CC] bg-white text-[#B3141F] font-extrabold flex items-center justify-center gap-2">
        <LogOut className="w-5 h-5" /> Sair
      </button>
    </div>
  );
}
