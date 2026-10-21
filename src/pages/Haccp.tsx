import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ShieldCheck, Settings, History, FileBarChart2 } from 'lucide-react';
import HaccpDashboard from './haccp/HaccpDashboard';
import HaccpAdmin from './haccp/HaccpAdmin';
import HaccpHistory from './haccp/HaccpHistory';
import HaccpReport from './haccp/HaccpReport';

type Tab = 'tasks' | 'history' | 'report' | 'admin';

export default function Haccp() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'Admin';
  const isAdminOrChefe = isAdmin || profile?.role === 'Chefe';

  const [tab, setTab] = useState<Tab>('tasks');

  const tabs = [
    { id: 'tasks' as Tab, label: 'Tarefas', icon: ShieldCheck, visible: true },
    { id: 'history' as Tab, label: 'Histórico', icon: History, visible: true },
    { id: 'report' as Tab, label: 'Relatório', icon: FileBarChart2, visible: isAdminOrChefe },
    { id: 'admin' as Tab, label: 'Gerir', icon: Settings, visible: isAdmin },
  ].filter(t => t.visible);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex">
            {tabs.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 px-4 py-4 text-sm font-medium border-b-2 transition ${
                    tab === t.id
                      ? 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {tab === 'tasks' && <HaccpDashboard />}
      {tab === 'history' && <HaccpHistory />}
      {tab === 'report' && isAdminOrChefe && <HaccpReport />}
      {tab === 'admin' && isAdmin && <HaccpAdmin />}
    </div>
  );
}
