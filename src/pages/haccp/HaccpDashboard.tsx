import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  ShieldCheck, CheckCircle2, RefreshCw, XCircle,
  Clock, ChevronDown, Thermometer, ChevronRight,
} from 'lucide-react';
import {
  HaccpTask, HaccpTaskSession, HaccpFieldEntry,
  FREQUENCY_LABELS, DAY_LABELS, SESSION_STATUS_LABELS,
} from '../../types/haccp';
import HaccpTaskExecute from './HaccpTaskExecute';
import { format } from 'date-fns';

const FREQ_COLORS: Record<string, string> = {
  daily:         'bg-blue-100 text-blue-700',
  per_shift:     'bg-amber-100 text-amber-700',
  weekly:        'bg-emerald-100 text-emerald-700',
  monthly:       'bg-slate-100 text-slate-700',
  manual:        'bg-slate-100 text-slate-600',
  specific_days: 'bg-teal-100 text-teal-700',
};

interface TaskWithSession {
  task: HaccpTask;
  session: HaccpTaskSession | null;
  entries: HaccpFieldEntry[];
}

export default function HaccpDashboard() {
  const { profile } = useAuth();
  const isManager = profile?.role === 'Admin' || profile?.role === 'Chefe';
  const [items, setItems] = useState<TaskWithSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<TaskWithSession | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { loadData(); }, [profile]);

  const loadData = async (silent = false) => {
    if (!profile) return;
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      let query = supabase
        .from('haccp_tasks')
        .select('*, departments(id, name), haccp_task_inputs(*)')
        .eq('active', true)
        .order('display_order')
        .order('name');

      if (profile.role !== 'Admin') {
        // Unit filtering
        if (profile.unit_id) {
          query = query.or(`unit_ids.cs.{${profile.unit_id}},unit_ids.is.null`);
        }
        // Department filtering — only show tasks for user's department (or global ones)
        if (profile.department_id) {
          query = query.or(`department_id.is.null,department_id.eq.${profile.department_id}`);
        }
      }

      const { data: taskData } = await query;
      if (!taskData) { setItems([]); return; }

      const tasks = taskData as HaccpTask[];
      const todayDow = new Date().getDay();
      const today = new Date().toISOString().split('T')[0];

      const dueTasks = tasks.filter(t => {
        if (t.frequency === 'specific_days') {
          return Array.isArray(t.scheduled_days) && t.scheduled_days.includes(todayDow);
        }
        return true;
      });

      if (dueTasks.length === 0) { setItems([]); return; }

      const taskIds = dueTasks.map(t => t.id);
      const { data: sessions } = await supabase
        .from('haccp_task_sessions')
        .select('*')
        .in('task_id', taskIds)
        .eq('session_date', today)
        .is('shift_period', null);

      const sessionMap: Record<string, HaccpTaskSession> = {};
      (sessions || []).forEach((s: HaccpTaskSession) => { sessionMap[s.task_id] = s; });

      const sessionIds = (sessions || []).map((s: HaccpTaskSession) => s.id);
      const entriesMap: Record<string, HaccpFieldEntry[]> = {};
      if (sessionIds.length > 0) {
        const { data: entries } = await supabase
          .from('haccp_field_entries')
          .select('*, profiles(full_name, email)')
          .in('session_id', sessionIds);
        (entries || []).forEach((e: HaccpFieldEntry) => {
          if (!entriesMap[e.session_id]) entriesMap[e.session_id] = [];
          entriesMap[e.session_id].push(e);
        });
      }

      const result: TaskWithSession[] = dueTasks.map(task => {
        const session = sessionMap[task.id] || null;
        const entries = session ? (entriesMap[session.id] || []) : [];
        return { task, session, entries };
      });

      setItems(result);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Categorise by status
  const overdueItems = items.filter(i => {
    // An item is "overdue" if it has no session and task was expected (we treat all pending as overdue here)
    return !i.session;
  });
  const inProgressItems = items.filter(i => i.session?.status === 'in_progress');
  const completedItems = items.filter(i =>
    i.session && (i.session.status === 'completed' || i.session.status === 'non_compliant' || i.session.status === 'incomplete')
  );

  const totalTasks = items.length;
  const doneTasks = completedItems.filter(i => i.session?.status === 'completed').length;
  const nonCompliantCount = completedItems.filter(i => i.session?.status === 'non_compliant').length;
  const pct = totalTasks > 0 ? Math.round(((doneTasks + nonCompliantCount) / totalTasks) * 100) : 0;
  const allDone = totalTasks > 0 && (doneTasks + nonCompliantCount) === totalTasks;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] bg-slate-50">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-3">
            <ShieldCheck className="w-7 h-7 text-emerald-600" />
          </div>
          <p className="text-slate-500 font-medium">A carregar HACCP...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-800 leading-tight">HACCP</h1>
                <p className="text-xs text-slate-400">{format(new Date(), "dd 'de' MMM · EEEE")}</p>
              </div>
            </div>
            <button
              onClick={() => loadData(true)}
              className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 transition active:scale-95"
            >
              <RefreshCw className={`w-4 h-4 text-slate-500 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {totalTasks > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-slate-500">
                  {doneTasks + nonCompliantCount}/{totalTasks} verificadas
                  {nonCompliantCount > 0 && (
                    <span className="text-red-500 ml-1">· {nonCompliantCount} não conforme</span>
                  )}
                </span>
                <span className={`text-xs font-bold ${allDone ? 'text-emerald-600' : 'text-slate-500'}`}>{pct}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all duration-700 ${
                    nonCompliantCount > 0 ? 'bg-red-400' : allDone ? 'bg-emerald-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4 pb-24">

        {/* Empty state */}
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-3xl bg-emerald-100 flex items-center justify-center mb-4">
              <ShieldCheck className="w-10 h-10 text-emerald-500" />
            </div>
            <h2 className="text-lg font-semibold text-slate-700 mb-1">Sem tarefas para hoje</h2>
            <p className="text-sm text-slate-400">Não há tarefas HACCP agendadas para hoje.</p>
          </div>
        )}

        {/* All done banner */}
        {allDone && items.length > 0 && (
          <div className="bg-emerald-500 rounded-2xl px-5 py-4 flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-white flex-shrink-0" />
            <div>
              <p className="font-bold text-white">Tudo verificado!</p>
              <p className="text-emerald-100 text-sm">Todas as verificações HACCP foram registadas hoje.</p>
            </div>
          </div>
        )}

        {/* ── In Progress section ── */}
        {inProgressItems.length > 0 && (
          <Section
            label="Em Curso"
            count={inProgressItems.length}
            accent="blue"
          >
            {inProgressItems.map(item => (
              <TaskCard
                key={item.task.id}
                item={item}
                onTap={() => setSelectedItem(item)}
              />
            ))}
          </Section>
        )}

        {/* ── Pending section ── */}
        {overdueItems.length > 0 && (
          <Section
            label="Pendentes"
            count={overdueItems.length}
            accent="amber"
          >
            {overdueItems.map(item => (
              <TaskCard
                key={item.task.id}
                item={item}
                onTap={() => setSelectedItem(item)}
              />
            ))}
          </Section>
        )}

        {/* ── Completed section — collapsible ── */}
        {completedItems.length > 0 && (
          <div>
            <button
              onClick={() => setShowCompleted(v => !v)}
              className="flex items-center gap-2 w-full text-left py-2 px-1"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-semibold text-slate-600 flex-1">
                Realizadas hoje ({completedItems.length})
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showCompleted ? 'rotate-180' : ''}`} />
            </button>

            {showCompleted
              ? (
                <div className="space-y-3">
                  {completedItems.map(item => (
                    <TaskCard
                      key={item.task.id}
                      item={item}
                      onTap={isManager ? () => setSelectedItem(item) : undefined}
                      dimmed
                    />
                  ))}
                </div>
              )
              : (
                <button
                  onClick={() => setShowCompleted(true)}
                  className="w-full py-4 rounded-2xl bg-white border border-slate-200 text-sm text-slate-500 font-medium hover:bg-slate-50 transition"
                >
                  Ver {completedItems.length} verificaç{completedItems.length !== 1 ? 'ões' : 'ão'} realizad{completedItems.length !== 1 ? 'as' : 'a'}
                </button>
              )
            }
          </div>
        )}
      </div>

      {selectedItem && (
        <HaccpTaskExecute
          task={selectedItem.task}
          sessionId={selectedItem.session?.id ?? null}
          existingEntries={selectedItem.entries}
          onClose={() => setSelectedItem(null)}
          onSaved={() => { setSelectedItem(null); loadData(true); }}
        />
      )}
    </div>
  );
}

// ─── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  label, count, accent, children,
}: {
  label: string;
  count: number;
  accent: 'amber' | 'blue' | 'emerald' | 'red';
  children: React.ReactNode;
}) {
  const colors = {
    amber:   { dot: 'bg-amber-400',   badge: 'bg-amber-100 text-amber-700'   },
    blue:    { dot: 'bg-blue-500',    badge: 'bg-blue-100 text-blue-700'     },
    emerald: { dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700' },
    red:     { dot: 'bg-red-500',     badge: 'bg-red-100 text-red-700'       },
  };
  const c = colors[accent];

  return (
    <div>
      <div className="flex items-center gap-2 px-1 mb-2">
        <span className={`w-2 h-2 rounded-full ${c.dot}`} />
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.badge}`}>{count}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

// ─── TaskCard ──────────────────────────────────────────────────────────────────

interface TaskCardProps {
  item: TaskWithSession;
  onTap?: () => void;
  dimmed?: boolean;
}

function TaskCard({ item, onTap, dimmed }: TaskCardProps) {
  const { task, session } = item;
  const status = session?.status ?? 'pending';

  const totalFields = task.haccp_task_inputs?.length ?? 0;
  const filledFields = session?.filled_fields ?? 0;
  const pct = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;

  const freqLabel = task.frequency === 'specific_days' && task.scheduled_days
    ? task.scheduled_days.map(d => DAY_LABELS[d]).join(', ')
    : FREQUENCY_LABELS[task.frequency];

  const isCompleted    = status === 'completed';
  const isNonCompliant = status === 'non_compliant';
  const isPending      = status === 'pending' || !session;
  const isInProgress   = status === 'in_progress';

  // Who last worked on it
  const lastEntry = item.entries.length > 0
    ? item.entries.sort((a, b) => b.performed_at.localeCompare(a.performed_at))[0]
    : null;
  const lastPerson = lastEntry?.profiles?.full_name?.split(' ')[0] || null;
  const lastTime = lastEntry ? format(new Date(lastEntry.performed_at), 'HH:mm') : null;

  const cardBg =
    isCompleted    ? 'bg-emerald-50 border-emerald-200' :
    isNonCompliant ? 'bg-red-50 border-red-200'         :
    isInProgress   ? 'bg-blue-50 border-blue-200'       :
                     'bg-white border-slate-200';

  const iconBg =
    isCompleted    ? 'bg-emerald-100' :
    isNonCompliant ? 'bg-red-100'     :
    isInProgress   ? 'bg-blue-100'    :
                     'bg-slate-100';

  const StatusIcon =
    isCompleted    ? CheckCircle2 :
    isNonCompliant ? XCircle      :
    isInProgress   ? RefreshCw    :
                     Clock;

  const iconColor =
    isCompleted    ? 'text-emerald-600' :
    isNonCompliant ? 'text-red-600'     :
    isInProgress   ? 'text-blue-600'    :
                     'text-slate-400';

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={!onTap}
      className={`w-full text-left rounded-2xl border-2 overflow-hidden transition-all ${cardBg} ${
        onTap ? 'cursor-pointer hover:shadow-md active:scale-[0.99]' : 'cursor-default'
      } ${dimmed ? 'opacity-70' : ''}`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">

          {/* Status icon */}
          <div className={`w-11 h-11 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
            <StatusIcon className={`w-6 h-6 ${iconColor} ${isInProgress ? 'animate-pulse' : ''}`} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold text-slate-800 leading-snug">{task.name}</p>
              {onTap && !isCompleted && !isNonCompliant && (
                <ChevronRight className="w-5 h-5 text-slate-300 flex-shrink-0 mt-0.5" />
              )}
            </div>

            {task.description && (
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{task.description}</p>
            )}

            {/* Progress bar */}
            {totalFields > 0 && (
              <div className="mt-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-500">
                    {filledFields}/{totalFields} verificações
                  </span>
                  <span className={`text-xs font-bold ${
                    isNonCompliant ? 'text-red-600' : isCompleted ? 'text-emerald-600' : 'text-slate-500'
                  }`}>
                    {isNonCompliant ? 'Não conforme' : isCompleted ? 'Concluído' : `${pct}%`}
                  </span>
                </div>
                <div className="w-full bg-white/70 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      isNonCompliant ? 'bg-red-400' : isCompleted ? 'bg-emerald-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}

            {/* Completed by / tags */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${FREQ_COLORS[task.frequency]}`}>
                {freqLabel}
              </span>
              {(task as any).departments?.name && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                  {(task as any).departments.name}
                </span>
              )}
              {(isCompleted || isNonCompliant) && lastPerson && lastTime && (
                <span className="text-xs text-slate-400">
                  {lastPerson} · {lastTime}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action bar at bottom */}
      {isPending && onTap && totalFields === 0 && (
        <div className="px-4 pb-4 pt-0">
          <div className="bg-slate-800 rounded-xl py-3 flex items-center justify-center gap-2">
            <Thermometer className="w-4 h-4 text-white" />
            <span className="text-sm font-bold text-white">Iniciar verificação</span>
          </div>
        </div>
      )}
      {isPending && onTap && totalFields > 0 && (
        <div className="px-4 pb-4 pt-0">
          <div className="bg-slate-800 rounded-xl py-3 flex items-center justify-center gap-2">
            <Thermometer className="w-4 h-4 text-white" />
            <span className="text-sm font-bold text-white">Iniciar · {totalFields} verificaç{totalFields !== 1 ? 'ões' : 'ão'}</span>
          </div>
        </div>
      )}
      {isInProgress && onTap && (
        <div className="px-4 pb-4 pt-0">
          <div className="bg-blue-600 rounded-xl py-3 flex items-center justify-center gap-2">
            <span className="text-sm font-bold text-white">Continuar · {totalFields - filledFields} em falta</span>
            <ChevronRight className="w-4 h-4 text-white" />
          </div>
        </div>
      )}
    </button>
  );
}

