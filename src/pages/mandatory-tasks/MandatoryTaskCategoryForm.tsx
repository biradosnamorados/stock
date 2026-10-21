import { useEffect, useState } from 'react';
import { X, Plus, Trash2, GripVertical, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import UnitMultiSelect from '../../components/UnitMultiSelect';

interface Unit { id: string; name: string }
interface Department { id: string; name: string }

interface TaskDraft {
  id?: string;
  name: string;
  description: string;
  requires_notes: boolean;
  requires_photo: boolean;
  display_order: number;
  unit_ids: string[];
}

interface Category {
  id: string;
  name: string;
  description: string | null;
  category_type: 'opening' | 'closing' | 'shift' | 'custom';
  unit_id: string | null;
  unit_ids?: string[] | null;
  department_id: string | null;
  display_order: number;
  active: boolean;
  mandatory_tasks?: TaskDraft[];
}

interface Props {
  category: Category | null;
  onClose: () => void;
  onSaved: () => void;
}

const TASK_TEMPLATES = [
  'Ligar máquina de café',
  'Verificar frigoríficos',
  'Verificar casa de banho',
  'Abrir esplanada',
  'Verificar terminais POS',
  'Preparar estação de take away',
  'Ligar equipamentos',
  'Fechar esplanada',
  'Lavar máquina de café',
  'Esvaziar lixo',
  'Desligar equipamentos',
  'Fechar POS',
  'Organizar stock',
  'Limpar estações de trabalho',
];

const emptyTask = (order: number): TaskDraft => ({
  name: '', description: '', requires_notes: false, requires_photo: false, display_order: order, unit_ids: [],
});

export default function MandatoryTaskCategoryForm({ category, onClose, onSaved }: Props) {
  const { profile } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTaskUnits, setExpandedTaskUnits] = useState<Set<number>>(new Set());

  const [name, setName] = useState(category?.name || '');
  const [description, setDescription] = useState(category?.description || '');
  const [categoryType, setCategoryType] = useState<'opening' | 'closing' | 'shift' | 'custom'>(category?.category_type || 'opening');
  const [unitIds, setUnitIds] = useState<string[]>(
    category?.unit_ids?.length
      ? category.unit_ids
      : category?.unit_id
        ? [category.unit_id]
        : []
  );
  const [departmentId, setDepartmentId] = useState(category?.department_id || '');
  const [displayOrder, setDisplayOrder] = useState(category?.display_order?.toString() || '0');
  const [active, setActive] = useState(category?.active !== false);
  const [tasks, setTasks] = useState<TaskDraft[]>(
    category?.mandatory_tasks?.map((t, i) => ({
      ...t,
      display_order: i,
      unit_ids: (t as any).unit_ids || [],
    })) || []
  );

  useEffect(() => {
    supabase.from('units').select('id, name').order('name').then(({ data }) => setUnits(data || []));
    supabase.from('departments').select('id, name').order('name').then(({ data }) => setDepartments(data || []));
  }, []);

  const addTask = () => setTasks([...tasks, emptyTask(tasks.length)]);

  const addTemplate = (templateName: string) => {
    setTasks([...tasks, { ...emptyTask(tasks.length), name: templateName }]);
  };

  const updateTask = (index: number, field: keyof TaskDraft, value: any) => {
    const next = [...tasks];
    (next[index] as any)[field] = value;
    setTasks(next);
  };

  const removeTask = (index: number) => {
    setTasks(tasks.filter((_, i) => i !== index));
    setExpandedTaskUnits(prev => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  };

  const toggleTaskUnits = (index: number) => {
    setExpandedTaskUnits(prev => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  };

  const unitName = (id: string) => units.find(u => u.id === id)?.name || id;

  const handleSave = async () => {
    if (!name.trim()) { setError('O nome da checklist é obrigatório.'); return; }
    const validTasks = tasks.filter((t) => t.name.trim());
    if (tasks.length > 0 && validTasks.length === 0) { setError('Adicione pelo menos uma tarefa com nome.'); return; }

    setSaving(true);
    setError(null);

    try {
      const catData = {
        name: name.trim(),
        description: description.trim() || null,
        category_type: categoryType,
        unit_ids: unitIds,
        unit_id: unitIds[0] || null, // keep legacy column in sync
        department_id: departmentId || null,
        display_order: parseInt(displayOrder) || 0,
        active,
        created_by: profile?.id,
      };

      let catId = category?.id;

      if (catId) {
        const { error: upErr } = await supabase.from('mandatory_task_categories').update(catData).eq('id', catId);
        if (upErr) throw upErr;
        await supabase.from('mandatory_tasks').delete().eq('category_id', catId);
      } else {
        const { data, error: insErr } = await supabase.from('mandatory_task_categories').insert(catData).select().maybeSingle();
        if (insErr) throw insErr;
        catId = data?.id;
      }

      if (!catId) throw new Error('Falha ao obter ID da categoria');

      if (validTasks.length > 0) {
        const rows = validTasks.map((t, i) => ({
          category_id: catId,
          name: t.name.trim(),
          description: t.description.trim() || null,
          requires_notes: t.requires_notes,
          requires_photo: t.requires_photo,
          display_order: i,
          active: true,
          unit_ids: t.unit_ids || [],
        }));
        const { error: taskErr } = await supabase.from('mandatory_tasks').insert(rows);
        if (taskErr) throw taskErr;
      }

      onSaved();
    } catch (err: any) {
      setError(err.message || 'Erro ao guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 flex-shrink-0">
          <h2 className="text-lg font-bold text-slate-800">
            {category ? 'Editar Checklist' : 'Nova Checklist'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* Category info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nome da Checklist *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Abertura Cozinha"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Tipo</label>
              <select
                value={categoryType}
                onChange={(e) => setCategoryType(e.target.value as any)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="opening">Abertura</option>
                <option value="closing">Fecho</option>
                <option value="shift">Turno</option>
                <option value="custom">Personalizado</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Departamento</label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Todos os departamentos</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            <div className="md:col-span-2">
              <UnitMultiSelect
                units={units}
                selected={unitIds}
                onChange={setUnitIds}
                label="Unidades onde esta checklist aparece"
                allLabel="Todas as unidades"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Ordem</label>
              <input
                type="number"
                min="0"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Descrição</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descrição opcional..."
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="cat_active"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-slate-300 rounded"
              />
              <label htmlFor="cat_active" className="text-sm text-slate-700">Checklist ativa</label>
            </div>
          </div>

          {/* Tasks */}
          <div className="border-t border-slate-200 pt-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800">Tarefas</h3>
              <button
                type="button"
                onClick={addTask}
                className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                <Plus className="w-4 h-4" />
                Adicionar tarefa
              </button>
            </div>

            {/* Templates */}
            <div className="mb-3">
              <p className="text-xs text-slate-500 mb-2">Adicionar a partir de sugestões:</p>
              <div className="flex flex-wrap gap-1.5">
                {TASK_TEMPLATES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => addTemplate(t)}
                    className="text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition"
                  >
                    + {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {tasks.map((task, index) => {
                const unitsExpanded = expandedTaskUnits.has(index);
                return (
                  <div key={index} className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                    <div className="flex items-start gap-2 p-3">
                      <GripVertical className="w-4 h-4 text-slate-300 mt-2.5 flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <input
                          type="text"
                          value={task.name}
                          onChange={(e) => updateTask(index, 'name', e.target.value)}
                          placeholder="Nome da tarefa *"
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                        />
                        <input
                          type="text"
                          value={task.description}
                          onChange={(e) => updateTask(index, 'description', e.target.value)}
                          placeholder="Descrição opcional"
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                        />
                        <div className="flex flex-wrap items-center gap-4">
                          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={task.requires_notes}
                              onChange={(e) => updateTask(index, 'requires_notes', e.target.checked)}
                              className="w-3.5 h-3.5 rounded text-blue-600"
                            />
                            Notas obrigatórias
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={task.requires_photo}
                              onChange={(e) => updateTask(index, 'requires_photo', e.target.checked)}
                              className="w-3.5 h-3.5 rounded text-blue-600"
                            />
                            Foto obrigatória
                          </label>

                          {/* Unit restriction toggle */}
                          <button
                            type="button"
                            onClick={() => toggleTaskUnits(index)}
                            className={`flex items-center gap-1 text-xs font-medium transition rounded-full px-2 py-0.5 ${
                              task.unit_ids.length > 0
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                          >
                            {task.unit_ids.length > 0
                              ? `Apenas: ${task.unit_ids.map(unitName).join(', ')}`
                              : 'Restringir por unidade'}
                            {unitsExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        </div>

                        {/* Per-task unit selector */}
                        {unitsExpanded && (
                          <div className="pt-1">
                            <UnitMultiSelect
                              units={units}
                              selected={task.unit_ids}
                              onChange={ids => updateTask(index, 'unit_ids', ids)}
                              label=""
                              allLabel="Todas as unidades (sem restrição)"
                            />
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeTask(index)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {tasks.length === 0 && (
                <p className="text-sm text-slate-400 italic text-center py-3">
                  Nenhuma tarefa adicionada. Clique em "Adicionar tarefa" ou escolha uma sugestão.
                </p>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-slate-200 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />A guardar...</> : 'Guardar Checklist'}
          </button>
        </div>
      </div>
    </div>
  );
}
