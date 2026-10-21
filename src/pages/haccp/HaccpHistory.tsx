import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  History, Filter, ChevronDown, ChevronUp, User, Clock,
  MapPin, CheckCircle2, XCircle, MinusCircle, AlertTriangle,
} from 'lucide-react';
import {
  HaccpTaskSession, HaccpFieldEntry, HaccpSessionStatus, SESSION_STATUS_LABELS,
} from '../../types/haccp';
import { format } from 'date-fns';

interface SessionWithTask extends HaccpTaskSession {
  task_name: string;
  unit_name: string | null;
  dept_name: string | null;
  entries: (HaccpFieldEntry & { performer_name: string | null })[];
}

const STATUS_STYLES: Record<HaccpSessionStatus, { badge: string; icon: React.ElementType }> = {
  pending:       { badge: 'bg-amber-100 text-amber-700',     icon: Clock },
  in_progress:   { badge: 'bg-blue-100 text-blue-700',       icon: AlertTriangle },
  completed:     { badge: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  incomplete:    { badge: 'bg-slate-100 text-slate-600',     icon: MinusCircle },
  non_compliant: { badge: 'bg-red-100 text-red-700',         icon: XCircle },
};

const FIELD_STATUS_STYLES = {
  compliant:     { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle2, label: 'Conforme' },
  non_compliant: { bg: 'bg-red-100',     text: 'text-red-700',     icon: XCircle,      label: 'Não conforme' },
  not_used:      { bg: 'bg-slate-100',   text: 'text-slate-500',   icon: MinusCircle,  label: 'Não utilizado' },
};

function FieldValueDisplay({ entry }: { entry: HaccpFieldEntry }) {
  if (entry.field_status === 'not_used') return null;
  if (entry.input_type === 'checkbox') {
    return (
      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
        entry.value_boolean ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
      }`}>
        {entry.value_boolean ? 'Sim' : 'Não'}
      </span>
    );
  }
  if (entry.input_type === 'numeric' && entry.value_numeric != null) {
    return <span className="text-xs font-semibold text-slate-700">{entry.value_numeric}</span>;
  }
  if (entry.input_type === 'text' && entry.value_text) {
    return <span className="text-xs text-slate-600">{entry.value_text}</span>;
  }
  if (entry.input_type === 'datetime' && entry.value_datetime) {
    return <span className="text-xs text-slate-600">{format(new Date(entry.value_datetime), 'dd/MM HH:mm')}</span>;
  }
  if (entry.input_type === 'photo' && entry.value_photo_url) {
    return (
      <a href={entry.value_photo_url} target="_blank" rel="noopener noreferrer">
        <img src={entry.value_photo_url} alt="foto" className="w-12 h-12 object-cover rounded-lg border border-slate-200" />
      </a>
    );
  }
  return null;
}

export default function HaccpHistory() {
  const { profile } = useAuth();
  const [sessions, setSessions] = useState<SessionWithTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; full_name: string | null; email: string }[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const [filters, setFilters] = useState({
    dateFrom: today,
    dateTo: today,
    unit_id: '',
    department_id: '',
    user_id: '',
    status: '',
  });

  useEffect(() => { loadMeta(); }, []);
  useEffect(() => { loadSessions(); }, [filters, profile]);

  const loadMeta = async () => {
    const [u, d, us] = await Promise.all([
      supabase.from('units').select('id, name').eq('active', true),
      supabase.from('departments').select('id, name').eq('active', true),
      supabase.from('profiles').select('id, full_name, email').order('full_name'),
    ]);
    if (u.data) setUnits(u.data);
    if (d.data) setDepartments(d.data);
    if (us.data) setUsers(us.data);
  };

  const loadSessions = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('haccp_task_sessions')
        .select('*, haccp_tasks(name), units(name), departments(name)')
        .gte('session_date', filters.dateFrom || today)
        .lte('session_date', filters.dateTo || today)
        .order('session_date', { ascending: false })
        .order('updated_at', { ascending: false });

      if (filters.unit_id) q = q.eq('unit_id', filters.unit_id);
      if (filters.department_id) q = q.eq('department_id', filters.department_id);
      if (filters.status) q = q.eq('status', filters.status);
      if (profile?.role !== 'Admin' && profile?.unit_id) q = q.eq('unit_id', profile.unit_id);

      const { data: sessData } = await q.limit(200);
      if (!sessData || sessData.length === 0) { setSessions([]); return; }

      const sessionIds = sessData.map((s: any) => s.id);

      let entryQ = supabase
        .from('haccp_field_entries')
        .select('*, profiles(full_name, email)')
        .in('session_id', sessionIds)
        .order('performed_at');

      if (filters.user_id) entryQ = entryQ.eq('performed_by', filters.user_id);

      const { data: entryData } = await entryQ;
      const entriesBySession: Record<string, any[]> = {};
      (entryData || []).forEach((e: any) => {
        if (!entriesBySession[e.session_id]) entriesBySession[e.session_id] = [];
        entriesBySession[e.session_id].push({
          ...e,
          performer_name: e.profiles?.full_name || e.profiles?.email || null,
        });
      });

      setSessions(sessData.map((s: any) => ({
        ...s,
        task_name: s.haccp_tasks?.name || '—',
        unit_name: s.units?.name || null,
        dept_name: s.departments?.name || null,
        entries: entriesBySession[s.id] || [],
      })));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-xl">
            <History className="w-5 h-5 text-blue-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Histórico HACCP</h1>
            <p className="text-sm text-slate-500">{sessions.length} sessão{sessions.length !== 1 ? 'ões' : ''}</p>
          </div>
        </div>
        <button
          onClick={() => setShowFilters(v => !v)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition ${
            showFilters ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          <Filter className="w-4 h-4" />
          Filtros
        </button>
      </div>

      {showFilters && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">De</label>
            <input type="date" value={filters.dateFrom}
              onChange={e => setFilters(p => ({ ...p, dateFrom: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Até</label>
            <input type="date" value={filters.dateTo}
              onChange={e => setFilters(p => ({ ...p, dateTo: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Estado</label>
            <select value={filters.status}
              onChange={e => setFilters(p => ({ ...p, status: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent">
              <option value="">Todos</option>
              {Object.entries(SESSION_STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          {profile?.role === 'Admin' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Unidade</label>
                <select value={filters.unit_id}
                  onChange={e => setFilters(p => ({ ...p, unit_id: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  <option value="">Todas</option>
                  {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Departamento</label>
                <select value={filters.department_id}
                  onChange={e => setFilters(p => ({ ...p, department_id: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  <option value="">Todos</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            </>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Colaborador</label>
            <select value={filters.user_id}
              onChange={e => setFilters(p => ({ ...p, user_id: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent">
              <option value="">Todos</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
            </select>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">Nenhum registo encontrado</p>
          <p className="text-xs mt-1">Ajuste os filtros para ver mais resultados</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(s => {
            const st = s.status as HaccpSessionStatus;
            const style = STATUS_STYLES[st];
            const Icon = style.icon;
            const expanded = expandedId === s.id;

            return (
              <div key={s.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setExpandedId(expanded ? null : s.id)}
                  className="w-full text-left p-4 hover:bg-slate-50 transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5 text-slate-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-slate-800 truncate">{s.task_name}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style.badge}`}>
                            {SESSION_STATUS_LABELS[st]}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            <Clock className="w-3 h-3" />
                            {format(new Date(s.session_date), 'dd/MM/yyyy')}
                          </span>
                          {s.unit_name && (
                            <span className="flex items-center gap-1 text-xs text-slate-400">
                              <MapPin className="w-3 h-3" />
                              {s.unit_name}
                            </span>
                          )}
                        </div>
                        {s.total_fields > 0 && (
                          <p className="text-xs text-slate-400 mt-0.5">{s.filled_fields} de {s.total_fields} verificações</p>
                        )}
                      </div>
                    </div>
                    {expanded
                      ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-slate-100 bg-slate-50">
                    {s.entries.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-slate-400">Sem registos de campo.</p>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {s.entries.map(entry => {
                          const fs = FIELD_STATUS_STYLES[entry.field_status];
                          const FsIcon = fs.icon;
                          return (
                            <div key={entry.id} className="px-4 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-2 flex-1 min-w-0">
                                  <span className={`mt-0.5 flex-shrink-0 p-1 rounded-lg ${fs.bg} ${fs.text}`}>
                                    <FsIcon className="w-3.5 h-3.5" />
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-slate-700">{entry.input_label}</p>
                                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                      <span className={`text-xs font-medium ${fs.text}`}>{fs.label}</span>
                                      <span className="flex items-center gap-1 text-xs text-slate-400">
                                        <User className="w-3 h-3" />
                                        {(entry as any).performer_name || '—'}
                                      </span>
                                      <span className="text-xs text-slate-400">
                                        {format(new Date(entry.performed_at), 'HH:mm')}
                                      </span>
                                    </div>
                                    {entry.observation && (
                                      <p className="text-xs text-slate-500 mt-1 italic">"{entry.observation}"</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex-shrink-0">
                                  <FieldValueDisplay entry={entry} />
                                </div>
                              </div>
                            </div>
                          );
                        })}
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
