import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronRight, ListChecks } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import MandatoryTaskCategoryForm from './MandatoryTaskCategoryForm';

interface Unit { id: string; name: string }
interface Department { id: string; name: string }

interface Task {
  id: string;
  name: string;
  description: string | null;
  requires_notes: boolean;
  requires_photo: boolean;
  display_order: number;
  active: boolean;
}

interface Category {
  id: string;
  name: string;
  description: string | null;
  category_type: 'opening' | 'closing' | 'shift' | 'custom';
  unit_id: string | null;
  unit_ids: string[] | null;
  department_id: string | null;
  display_order: number;
  active: boolean;
  mandatory_tasks: Task[];
  units?: Unit | null;
  departments?: Department | null;
}

const TYPE_LABELS: Record<string, string> = {
  opening: 'Abertura',
  closing: 'Fecho',
  shift: 'Turno',
  custom: 'Personalizado',
};

const TYPE_COLORS: Record<string, string> = {
  opening: 'bg-emerald-100 text-emerald-700',
  closing: 'bg-slate-100 text-slate-600',
  shift: 'bg-amber-100 text-amber-700',
  custom: 'bg-blue-100 text-blue-700',
};

export default function MandatoryTasksAdmin() {
  const { profile } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  useEffect(() => { loadCategories(); }, []);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('mandatory_task_categories')
        .select('*, mandatory_tasks(*), departments(id, name)')
        .order('display_order')
        .order('display_order', { referencedTable: 'mandatory_tasks' });

      if (!error && data) setCategories(data as Category[]);
    } finally {
      setLoading(false);
    }
  };

  const [allUnits, setAllUnits] = useState<Unit[]>([]);
  useEffect(() => {
    supabase.from('units').select('id, name').order('name').then(({ data }) => setAllUnits(data || []));
  }, []);

  const unitNames = (ids: string[] | null) => {
    if (!ids || ids.length === 0) return null;
    return ids.map(id => allUnits.find(u => u.id === id)?.name || '').filter(Boolean).join(', ');
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    if (!confirm(`Eliminar categoria "${name}"? Todas as tarefas e registos serão eliminados.`)) return;
    await supabase.from('mandatory_task_categories').delete().eq('id', id);
    loadCategories();
  };

  const toggleCategoryActive = async (cat: Category) => {
    await supabase.from('mandatory_task_categories').update({ active: !cat.active }).eq('id', cat.id);
    loadCategories();
  };

  const handleEditCategory = (cat: Category) => {
    setEditingCategory(cat);
    setShowForm(true);
  };

  const handleNewCategory = () => {
    setEditingCategory(null);
    setShowForm(true);
  };

  if (profile?.role !== 'Admin' && profile?.role !== 'Chefe') {
    return (
      <div className="p-6 text-center text-slate-500">
        Não tem permissão para gerir tarefas.
      </div>
    );
  }

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ListChecks className="w-6 h-6 text-slate-600" />
          <h1 className="text-xl font-bold text-slate-800">Gerir Checklists</h1>
        </div>
        <button
          onClick={handleNewCategory}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Nova Checklist
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : categories.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <ListChecks className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500 font-medium">Nenhuma checklist criada</p>
          <button
            onClick={handleNewCategory}
            className="mt-4 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition"
          >
            Criar primeira checklist
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {categories.map((cat) => {
            const isExpanded = expanded.has(cat.id);
            const tasks = cat.mandatory_tasks || [];
            return (
              <div
                key={cat.id}
                className={`bg-white rounded-2xl border overflow-hidden ${cat.active ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}
              >
                {/* Category header */}
                <div className="flex items-center gap-2 px-4 py-3.5">
                  <button
                    onClick={() => toggleExpand(cat.id)}
                    className="flex-1 flex items-center gap-3 text-left min-w-0"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800">{cat.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[cat.category_type]}`}>
                          {TYPE_LABELS[cat.category_type]}
                        </span>
                        {unitNames(cat.unit_ids) && (
                          <span className="text-xs text-slate-400">{unitNames(cat.unit_ids)}</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{tasks.length} tarefa(s)</p>
                    </div>
                  </button>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => toggleCategoryActive(cat)}
                      className="p-2 rounded-lg hover:bg-slate-100 transition"
                      title={cat.active ? 'Desativar' : 'Ativar'}
                    >
                      {cat.active ? (
                        <ToggleRight className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <ToggleLeft className="w-5 h-5 text-slate-400" />
                      )}
                    </button>
                    <button
                      onClick={() => handleEditCategory(cat)}
                      className="p-2 rounded-lg hover:bg-blue-50 text-blue-600 transition"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(cat.id, cat.name)}
                      className="p-2 rounded-lg hover:bg-red-50 text-red-600 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Tasks list */}
                {isExpanded && (
                  <div className="border-t border-slate-100 divide-y divide-slate-100 bg-slate-50">
                    {tasks.length === 0 ? (
                      <p className="text-sm text-slate-400 px-6 py-4 italic">
                        Nenhuma tarefa nesta checklist. Clique em "Editar" para adicionar tarefas.
                      </p>
                    ) : (
                      tasks.map((task, i) => (
                        <div key={task.id} className="flex items-center gap-3 px-6 py-3">
                          <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-500 text-xs flex items-center justify-center font-medium flex-shrink-0">
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-700">{task.name}</p>
                            {task.description && (
                              <p className="text-xs text-slate-400 truncate">{task.description}</p>
                            )}
                          </div>
                          <div className="flex gap-1.5 flex-shrink-0">
                            {task.requires_notes && (
                              <span className="text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">Notas</span>
                            )}
                            {task.requires_photo && (
                              <span className="text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">Foto</span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <MandatoryTaskCategoryForm
          category={editingCategory}
          onClose={() => { setShowForm(false); setEditingCategory(null); }}
          onSaved={() => { setShowForm(false); setEditingCategory(null); loadCategories(); }}
        />
      )}
    </div>
  );
}
