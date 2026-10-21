import { useEffect, useState } from 'react';
import { History, Search, User, Clock, FileText, Image, Filter } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';

interface Log {
  id: string;
  task_name: string;
  category_name: string | null;
  notes: string | null;
  photo_url: string | null;
  completed_at: string;
  performed_by: string;
  profiles: { full_name: string | null; email: string } | null;
  units: { name: string } | null;
  departments: { name: string } | null;
}

export default function MandatoryTasksHistory() {
  const { profile } = useAuth();
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  useEffect(() => {
    loadLogs();
  }, [dateFilter]);

  const loadLogs = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const dayStart = new Date(dateFilter + 'T00:00:00').toISOString();
      const dayEnd = new Date(dateFilter + 'T23:59:59').toISOString();

      let query = supabase
        .from('mandatory_task_logs')
        .select('*, profiles(full_name, email), units(name), departments(name)')
        .gte('completed_at', dayStart)
        .lte('completed_at', dayEnd)
        .order('completed_at', { ascending: false });

      if (profile.role !== 'Admin') {
        query = query.eq('unit_id', profile.unit_id);
      }

      const { data, error } = await query;
      if (!error && data) setLogs(data as Log[]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = logs.filter((l) =>
    !search || l.task_name.toLowerCase().includes(search.toLowerCase()) ||
    l.category_name?.toLowerCase().includes(search.toLowerCase()) ||
    l.profiles?.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <History className="w-6 h-6 text-slate-600" />
        <h1 className="text-xl font-bold text-slate-800">Histórico de Tarefas</h1>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Pesquisar tarefa ou utilizador..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <History className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500 font-medium">Sem registos</p>
          <p className="text-sm text-slate-400 mt-1">Não foram encontradas tarefas concluídas.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((log) => {
            const expanded = expandedLog === log.id;
            return (
              <div
                key={log.id}
                className="bg-white rounded-xl border border-slate-200 overflow-hidden"
              >
                <button
                  onClick={() => setExpandedLog(expanded ? null : log.id)}
                  className="w-full flex items-center gap-4 px-4 py-3.5 text-left hover:bg-slate-50 transition"
                >
                  <div className="w-9 h-9 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm">{log.task_name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {log.category_name && (
                        <span className="text-xs text-slate-400">{log.category_name}</span>
                      )}
                      <span className="text-xs text-slate-300">·</span>
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <User className="w-3 h-3" />
                        {log.profiles?.full_name || log.profiles?.email || '—'}
                      </span>
                      <span className="text-xs text-slate-300">·</span>
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Clock className="w-3 h-3" />
                        {format(new Date(log.completed_at), 'HH:mm')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {log.notes && <FileText className="w-4 h-4 text-slate-400" />}
                    {log.photo_url && <Image className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-slate-100 px-4 py-3 bg-slate-50 space-y-2">
                    {log.units && (
                      <p className="text-xs text-slate-500">
                        <span className="font-medium">Unidade:</span> {log.units.name}
                        {log.departments && ` · ${log.departments.name}`}
                      </p>
                    )}
                    {log.notes && (
                      <div>
                        <p className="text-xs font-medium text-slate-600 mb-1">Notas:</p>
                        <p className="text-sm text-slate-700 bg-white rounded-lg px-3 py-2 border border-slate-200">{log.notes}</p>
                      </div>
                    )}
                    {log.photo_url && (
                      <div>
                        <p className="text-xs font-medium text-slate-600 mb-1">Foto:</p>
                        <img
                          src={log.photo_url}
                          alt="Registo"
                          className="rounded-lg max-h-40 object-cover border border-slate-200"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
