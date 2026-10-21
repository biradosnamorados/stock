import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Pencil, Trash2, ShieldCheck, ToggleLeft, ToggleRight, Filter } from 'lucide-react';
import { HaccpTask, FREQUENCY_LABELS, DAY_LABELS } from '../../types/haccp';
import HaccpTaskForm from './HaccpTaskForm';

const FREQ_COLORS: Record<string, string> = {
  daily: 'bg-blue-100 text-blue-700',
  per_shift: 'bg-amber-100 text-amber-700',
  weekly: 'bg-green-100 text-green-700',
  monthly: 'bg-slate-100 text-slate-700',
  manual: 'bg-slate-100 text-slate-600',
  specific_days: 'bg-teal-100 text-teal-700',
};

interface Unit { id: string; name: string }

export default function HaccpAdmin() {
  const [tasks, setTasks] = useState<HaccpTask[]>([]);
  const [allUnits, setAllUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState<HaccpTask | null>(null);
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('active');
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadTasks();
    supabase.from('units').select('id, name').order('name').then(({ data }) => setAllUnits(data || []));
  }, []);

  const loadTasks = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('haccp_tasks')
      .select('*, departments(id, name), haccp_task_inputs(*)')
      .order('display_order')
      .order('name');
    if (data) setTasks(data as HaccpTask[]);
    setLoading(false);
  };

  const unitNamesFor = (ids: string[] | null) => {
    if (!ids || ids.length === 0) return null;
    return ids.map(id => allUnits.find(u => u.id === id)?.name).filter(Boolean).join(', ');
  };

  const toggleActive = async (task: HaccpTask) => {
    await supabase
      .from('haccp_tasks')
      .update({ active: !task.active, updated_at: new Date().toISOString() })
      .eq('id', task.id);
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, active: !t.active } : t));
  };

  const deleteTask = async (id: string) => {
    if (!confirm('Eliminar esta tarefa? Esta ação não pode ser desfeita.')) return;
    setDeleting(id);
    await supabase.from('haccp_tasks').delete().eq('id', id);
    setTasks(prev => prev.filter(t => t.id !== id));
    setDeleting(null);
  };

  const filtered = tasks.filter(t => {
    if (filterActive === 'active') return t.active;
    if (filterActive === 'inactive') return !t.active;
    return true;
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-xl">
            <ShieldCheck className="w-6 h-6 text-emerald-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Gestão de Tarefas HACCP</h1>
            <p className="text-sm text-slate-500">{filtered.length} tarefa{filtered.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button
          onClick={() => { setEditTask(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-emerald-700 transition"
        >
          <Plus className="w-4 h-4" />
          Nova Tarefa
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        <Filter className="w-4 h-4 text-slate-400 mt-2" />
        {(['all', 'active', 'inactive'] as const).map(val => (
          <button
            key={val}
            onClick={() => setFilterActive(val)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              filterActive === val ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {val === 'all' ? 'Todas' : val === 'active' ? 'Ativas' : 'Inativas'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma tarefa encontrada</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(task => (
            <div
              key={task.id}
              className={`bg-white rounded-xl border transition ${
                task.active ? 'border-slate-200' : 'border-slate-100 opacity-60'
              }`}
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-slate-800">{task.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${FREQ_COLORS[task.frequency] || 'bg-slate-100 text-slate-600'}`}>
                        {task.frequency === 'specific_days' && task.scheduled_days
                          ? task.scheduled_days.map(d => DAY_LABELS[d]).join(', ')
                          : FREQUENCY_LABELS[task.frequency]}
                      </span>
                    </div>
                    {task.description && (
                      <p className="text-sm text-slate-500 mt-0.5 line-clamp-1">{task.description}</p>
                    )}
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-500">
                      {unitNamesFor(task.unit_ids) && (
                        <span className="bg-slate-100 px-2 py-0.5 rounded-full">{unitNamesFor(task.unit_ids)}</span>
                      )}
                      {task.departments && <span className="bg-slate-100 px-2 py-0.5 rounded-full">{task.departments.name}</span>}
                      <span>{task.haccp_task_inputs?.length || 0} campo{(task.haccp_task_inputs?.length || 0) !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => toggleActive(task)}
                      className={`p-2 rounded-lg transition ${task.active ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-50'}`}
                      title={task.active ? 'Desativar' : 'Ativar'}
                    >
                      {task.active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                    </button>
                    <button
                      onClick={() => { setEditTask(task); setShowForm(true); }}
                      className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteTask(task.id)}
                      disabled={deleting === task.id}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <HaccpTaskForm
          task={editTask}
          onClose={() => { setShowForm(false); setEditTask(null); }}
          onSaved={() => { setShowForm(false); setEditTask(null); loadTasks(); }}
        />
      )}
    </div>
  );
}
