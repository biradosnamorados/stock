import { useEffect, useState, useCallback, useRef } from 'react';
import {
  CheckSquare, Clock, CheckCircle2, RefreshCw,
  ChevronDown, Loader2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { startOfDay, format } from 'date-fns';

interface Task {
  id: string;
  name: string;
  description: string | null;
  requires_notes: boolean;
  requires_photo: boolean;
  display_order: number;
}

interface Category {
  id: string;
  name: string;
  category_type: 'opening' | 'closing' | 'shift' | 'custom';
  description: string | null;
  department_id: string | null;
  unit_id: string | null;
  unit_ids: string[] | null;
  display_order: number;
  tasks: Task[];
  completedTaskIds: Set<string>;
  completedMeta: Record<string, { by: string; at: string }>;
}

const TYPE_LABELS: Record<string, string> = {
  opening: 'Abertura',
  closing: 'Fecho',
  shift: 'Turno',
  custom: 'Personalizado',
};

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  opening: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  closing: { bg: 'bg-slate-100',   text: 'text-slate-600'   },
  shift:   { bg: 'bg-amber-100',   text: 'text-amber-700'   },
  custom:  { bg: 'bg-blue-100',    text: 'text-blue-700'    },
};

function getLocation(): Promise<{ latitude: number; longitude: number; accuracy: number } | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 60000 },
    );
  });
}

export default function MandatoryTasksDashboard() {
  const { profile } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'opening' | 'closing' | 'shift' | 'custom'>('all');
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const locationRef = useRef<{ latitude: number; longitude: number; accuracy: number } | null>(null);

  const loadData = useCallback(async (silent = false) => {
    if (!profile) return;
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const catQuery = supabase
        .from('mandatory_task_categories')
        .select('*, mandatory_tasks(id, name, description, requires_notes, requires_photo, display_order, unit_ids)')
        .eq('active', true)
        .order('display_order');

      if (profile.role !== 'Admin' && profile.unit_id) {
        catQuery.or(`unit_ids.eq.{},unit_ids.is.null,unit_ids.cs.{${profile.unit_id}}`);
      }

      const { data: cats, error } = await catQuery;
      if (error) throw error;

      const dayStart = startOfDay(new Date()).toISOString();
      const { data: logs } = await supabase
        .from('mandatory_task_logs')
        .select('task_id, performed_by, completed_at, profiles(full_name, email)')
        .eq('performed_by', profile.id)
        .gte('completed_at', dayStart);

      const completedIds = new Set((logs || []).map((l: any) => l.task_id));
      const completedMeta: Record<string, { by: string; at: string }> = {};
      (logs || []).forEach((l: any) => {
        const name = l.profiles?.full_name || l.profiles?.email || 'Utilizador';
        completedMeta[l.task_id] = {
          by: name.split(' ')[0],
          at: format(new Date(l.completed_at), 'HH:mm'),
        };
      });

      const built: Category[] = (cats || [])
        .map((c: any) => {
          // Department filtering — skip categories from other departments
          if (profile.role !== 'Admin' && profile.department_id && c.department_id) {
            if (c.department_id !== profile.department_id) return null;
          }

          const allTasks: (Task & { unit_ids?: string[] | null })[] = c.mandatory_tasks || [];
          const visibleTasks = allTasks.filter(t => {
            if (!t.unit_ids || t.unit_ids.length === 0) return true;
            return profile.unit_id ? t.unit_ids.includes(profile.unit_id) : false;
          });

          return {
            ...c,
            tasks: visibleTasks.sort((a: Task, b: Task) => a.display_order - b.display_order),
            completedTaskIds: completedIds,
            completedMeta,
          };
        })
        .filter(Boolean) as Category[];

      setCategories(built);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile]);

  useEffect(() => { loadData(); }, [loadData]);

  // Pre-fetch location permission so it's ready when needed
  useEffect(() => {
    getLocation().then(loc => { locationRef.current = loc; });
  }, []);

  const completeTask = useCallback(async (task: Task, category: Category) => {
    if (!profile || savingTaskId) return;
    setSavingTaskId(task.id);
    try {
      // Refresh location silently (may use cached value)
      const loc = await getLocation();
      locationRef.current = loc;

      await supabase.from('mandatory_task_logs').insert({
        task_id: task.id,
        task_name: task.name,
        category_id: category.id,
        category_name: category.name,
        performed_by: profile.id,
        unit_id: profile.unit_id,
        department_id: profile.department_id,
        notes: null,
        photo_url: null,
        completed_at: new Date().toISOString(),
        latitude: loc?.latitude ?? null,
        longitude: loc?.longitude ?? null,
        location_accuracy: loc?.accuracy ?? null,
      });

      await loadData(true);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingTaskId(null);
    }
  }, [profile, savingTaskId, loadData]);

  const filtered = activeFilter === 'all'
    ? categories
    : categories.filter(c => c.category_type === activeFilter);

  const pendingCats = filtered.filter(c => {
    const done = c.tasks.filter(t => c.completedTaskIds.has(t.id)).length;
    return done < c.tasks.length || c.tasks.length === 0;
  });
  const completedCats = filtered.filter(c => {
    const done = c.tasks.filter(t => c.completedTaskIds.has(t.id)).length;
    return done === c.tasks.length && c.tasks.length > 0;
  });

  const totalTasks = filtered.reduce((s, c) => s + c.tasks.length, 0);
  const doneTasks = filtered.reduce(
    (s, c) => s + c.tasks.filter(t => c.completedTaskIds.has(t.id)).length, 0,
  );
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const allDone = totalTasks > 0 && doneTasks === totalTasks;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">A carregar tarefas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16">

      {/* Sticky header */}
      <div className="bg-white border-b border-slate-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {format(new Date(), "EEEE, dd 'de' MMM")}
              </p>
              <p className={`text-sm font-semibold mt-0.5 ${allDone ? 'text-emerald-600' : 'text-slate-700'}`}>
                {allDone
                  ? 'Tudo concluído hoje!'
                  : `${doneTasks} de ${totalTasks} concluídas`}
              </p>
            </div>
            <button
              onClick={() => loadData(true)}
              className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 transition active:scale-95"
            >
              <RefreshCw className={`w-4 h-4 text-slate-500 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Progress bar */}
          {totalTasks > 0 && (
            <div className="mb-3">
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all duration-700 ${allDone ? 'bg-emerald-500' : 'bg-blue-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className={`text-xs font-bold mt-1 text-right ${allDone ? 'text-emerald-600' : 'text-slate-400'}`}>
                {pct}%
              </p>
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {(['all', 'opening', 'shift', 'closing', 'custom'] as const).map(f => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`flex-shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition active:scale-95 ${
                  activeFilter === f
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f === 'all' ? 'Todas' : TYPE_LABELS[f]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-3">

        {filtered.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center mt-4">
            <CheckSquare className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500 font-medium">Sem tarefas disponíveis</p>
            <p className="text-xs text-slate-400 mt-1">Não há checklists atribuídas para hoje.</p>
          </div>
        )}

        {/* All done banner */}
        {allDone && filtered.length > 0 && (
          <div className="bg-emerald-500 rounded-2xl px-5 py-4 flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-white flex-shrink-0" />
            <div>
              <p className="font-bold text-white">Todas as tarefas concluídas!</p>
              <p className="text-emerald-100 text-sm">Excelente trabalho hoje.</p>
            </div>
          </div>
        )}

        {/* Pending categories */}
        {pendingCats.map(cat => (
          <CategoryCard
            key={cat.id}
            cat={cat}
            savingTaskId={savingTaskId}
            onComplete={task => completeTask(task, cat)}
          />
        ))}

        {/* Completed section — collapsible */}
        {completedCats.length > 0 && (
          <div>
            <button
              onClick={() => setShowCompleted(v => !v)}
              className="flex items-center gap-2 w-full text-left py-2 px-1"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-semibold text-slate-600 flex-1">
                Concluídas hoje ({completedCats.length})
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showCompleted ? 'rotate-180' : ''}`} />
            </button>

            {showCompleted
              ? completedCats.map(cat => (
                  <CategoryCard key={cat.id} cat={cat} savingTaskId={null} onComplete={() => {}} dimmed />
                ))
              : (
                <button
                  onClick={() => setShowCompleted(true)}
                  className="w-full py-4 rounded-2xl bg-white border border-slate-200 text-sm text-slate-500 font-medium hover:bg-slate-50 transition"
                >
                  Ver {completedCats.length} checklist{completedCats.length !== 1 ? 's' : ''} concluída{completedCats.length !== 1 ? 's' : ''}
                </button>
              )
            }
          </div>
        )}
      </div>

    </div>
  );
}

// ─── CategoryCard ──────────────────────────────────────────────────────────────

interface CategoryCardProps {
  cat: Category;
  savingTaskId: string | null;
  onComplete: (task: Task) => void;
  dimmed?: boolean;
}

function CategoryCard({ cat, savingTaskId, onComplete, dimmed }: CategoryCardProps) {
  const doneTasks = cat.tasks.filter(t => cat.completedTaskIds.has(t.id)).length;
  const totalTasks = cat.tasks.length;
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const allDone = doneTasks === totalTasks && totalTasks > 0;
  const typeColor = TYPE_COLORS[cat.category_type] || TYPE_COLORS.custom;
  const nextTask = cat.tasks.find(t => !cat.completedTaskIds.has(t.id));

  return (
    <div className={`rounded-2xl border-2 overflow-hidden transition-all ${
      allDone ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'
    } ${dimmed ? 'opacity-70' : ''}`}>

      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            allDone ? 'bg-emerald-100' : doneTasks > 0 ? 'bg-blue-100' : 'bg-slate-100'
          }`}>
            {allDone
              ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              : doneTasks > 0
                ? <Clock className="w-5 h-5 text-blue-600" />
                : <Clock className="w-5 h-5 text-slate-400" />
            }
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold text-slate-800 text-base leading-tight truncate">{cat.name}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${typeColor.bg} ${typeColor.text}`}>
                {TYPE_LABELS[cat.category_type]}
              </span>
            </div>

            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-medium ${allDone ? 'text-emerald-600' : 'text-slate-500'}`}>
                  {doneTasks}/{totalTasks} {allDone ? '— Concluído' : 'concluídas'}
                </span>
                <span className={`text-xs font-bold ${allDone ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {pct}%
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-1.5 rounded-full transition-all duration-500 ${allDone ? 'bg-emerald-500' : 'bg-blue-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Task rows */}
      {!allDone && (
        <div className="border-t border-slate-100 divide-y divide-slate-50">
          {cat.tasks.map(task => {
            const done = cat.completedTaskIds.has(task.id);
            const meta = cat.completedMeta[task.id];
            const isSaving = savingTaskId === task.id;
            return (
              <div key={task.id} className="flex items-center gap-3 px-4 py-3.5">
                {/* Big tap target — the check button */}
                <button
                  type="button"
                  onClick={() => !done && !savingTaskId && onComplete(task)}
                  disabled={done || !!savingTaskId}
                  className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition active:scale-90 ${
                    done
                      ? 'bg-emerald-500 border-emerald-500 cursor-default'
                      : isSaving
                        ? 'border-blue-300 bg-blue-50 cursor-wait'
                        : 'border-slate-300 bg-white hover:border-emerald-400 hover:bg-emerald-50 cursor-pointer'
                  }`}
                >
                  {isSaving ? (
                    <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                  ) : done ? (
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : null}
                </button>

                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold leading-snug ${done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                    {task.name}
                  </p>
                  {done && meta && (
                    <p className="text-xs text-slate-400 mt-0.5">{meta.by} · {meta.at}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CTA when nothing started yet */}
      {!allDone && doneTasks === 0 && nextTask && (
        <div className="px-4 pb-4 pt-1">
          <button
            type="button"
            onClick={() => !savingTaskId && onComplete(nextTask)}
            disabled={!!savingTaskId}
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-60"
          >
            <CheckSquare className="w-4 h-4" />
            Iniciar checklist
          </button>
        </div>
      )}

      {/* Completed footer */}
      {allDone && (
        <div className="px-4 py-3 border-t border-emerald-100 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <p className="text-xs text-emerald-700 font-medium">
            {totalTasks} {totalTasks === 1 ? 'tarefa concluída' : 'tarefas concluídas'} hoje
          </p>
        </div>
      )}
    </div>
  );
}
