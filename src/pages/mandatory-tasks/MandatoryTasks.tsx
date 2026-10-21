import { useState } from 'react';
import { CheckSquare, History, Settings } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import MandatoryTasksDashboard from './MandatoryTasksDashboard';
import MandatoryTasksHistory from './MandatoryTasksHistory';
import MandatoryTasksAdmin from './MandatoryTasksAdmin';

type Tab = 'tasks' | 'history' | 'admin';

export default function MandatoryTasks() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'Admin' || profile?.role === 'Chefe';
  const [tab, setTab] = useState<Tab>('tasks');

  const tabs = [
    { key: 'tasks' as Tab, label: 'Tarefas', icon: CheckSquare },
    { key: 'history' as Tab, label: 'Histórico', icon: History },
    ...(isAdmin ? [{ key: 'admin' as Tab, label: 'Gerir', icon: Settings }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Tab bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto">
          <div className="flex">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-semibold border-b-2 transition ${
                  tab === key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      {tab === 'tasks' && <MandatoryTasksDashboard />}
      {tab === 'history' && <MandatoryTasksHistory />}
      {tab === 'admin' && isAdmin && <MandatoryTasksAdmin />}
    </div>
  );
}
