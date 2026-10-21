import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { X, Plus, Trash2, GripVertical } from 'lucide-react';
import { HaccpTask, HaccpTaskInput, HaccpFrequency, HaccpInputType, FREQUENCY_LABELS, INPUT_TYPE_LABELS, DAY_LABELS } from '../../types/haccp';
import UnitMultiSelect from '../../components/UnitMultiSelect';

interface Department { id: string; name: string; }
interface Unit { id: string; name: string; }

interface Props {
  task: HaccpTask | null;
  onClose: () => void;
  onSaved: () => void;
}

const emptyInput = (): Partial<HaccpTaskInput> => ({
  label: '',
  input_type: 'checkbox',
  required: true,
  numeric_min: null,
  numeric_max: null,
  placeholder: null,
  display_order: 0,
});

export default function HaccpTaskForm({ task, onClose, onSaved }: Props) {
  const { profile } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: task?.name || '',
    description: task?.description || '',
    department_id: task?.department_id || '',
    unit_ids: (task as any)?.unit_ids || (task?.unit_id ? [task.unit_id] : []) as string[],
    frequency: (task?.frequency || 'daily') as HaccpFrequency,
    scheduled_days: task?.scheduled_days || [] as number[],
    active: task?.active ?? true,
    display_order: task?.display_order || 0,
  });

  const toggleDay = (day: number) => {
    setFormData(p => ({
      ...p,
      scheduled_days: p.scheduled_days.includes(day)
        ? p.scheduled_days.filter(d => d !== day)
        : [...p.scheduled_days, day].sort((a, b) => a - b),
    }));
  };

  const [inputs, setInputs] = useState<Partial<HaccpTaskInput>[]>(
    task?.haccp_task_inputs?.sort((a, b) => a.display_order - b.display_order) || [emptyInput()]
  );

  useEffect(() => {
    const loadMeta = async () => {
      const [depsRes, unitsRes] = await Promise.all([
        supabase.from('departments').select('id, name').eq('active', true).order('name'),
        supabase.from('units').select('id, name').eq('active', true).order('name'),
      ]);
      if (depsRes.data) setDepartments(depsRes.data);
      if (unitsRes.data) setUnits(unitsRes.data);
    };
    loadMeta();
  }, []);

  const addInput = () => {
    setInputs(prev => [...prev, { ...emptyInput(), display_order: prev.length }]);
  };

  const removeInput = (idx: number) => {
    setInputs(prev => prev.filter((_, i) => i !== idx));
  };

  const updateInput = (idx: number, field: keyof HaccpTaskInput, value: any) => {
    setInputs(prev => prev.map((inp, i) => i === idx ? { ...inp, [field]: value } : inp));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    if (formData.frequency === 'specific_days' && formData.scheduled_days.length === 0) return;
    setSaving(true);
    setError(null);

    try {
      let taskId = task?.id;

      const payload = {
        name: formData.name,
        description: formData.description,
        department_id: formData.department_id || null,
        unit_ids: formData.unit_ids.length > 0 ? formData.unit_ids : [],
        frequency: formData.frequency,
        scheduled_days: formData.frequency === 'specific_days' ? formData.scheduled_days : null,
        active: formData.active,
        display_order: formData.display_order,
      };

      if (task) {
        const { error: updateErr } = await supabase
          .from('haccp_tasks')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', task.id);
        if (updateErr) throw updateErr;

        await supabase.from('haccp_task_inputs').delete().eq('task_id', task.id);
      } else {
        const { data, error: insertErr } = await supabase
          .from('haccp_tasks')
          .insert({ ...payload, created_by: profile?.id })
          .select('id')
          .single();
        if (insertErr) throw insertErr;
        taskId = data.id;
      }

      if (inputs.length > 0) {
        const inputsToInsert = inputs
          .filter(inp => inp.label?.trim())
          .map((inp, idx) => ({
            task_id: taskId,
            label: inp.label!,
            input_type: inp.input_type!,
            required: inp.required ?? true,
            numeric_min: inp.input_type === 'numeric' ? (inp.numeric_min ?? null) : null,
            numeric_max: inp.input_type === 'numeric' ? (inp.numeric_max ?? null) : null,
            placeholder: inp.placeholder || null,
            display_order: idx,
          }));

        if (inputsToInsert.length > 0) {
          const { error: inputErr } = await supabase.from('haccp_task_inputs').insert(inputsToInsert);
          if (inputErr) throw inputErr;
        }
      }

      onSaved();
    } catch (err: any) {
      setError(err.message || 'Erro ao guardar tarefa');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">
            {task ? 'Editar Tarefa HACCP' : 'Nova Tarefa HACCP'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Nome da Tarefa *</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Ex: Temperatura do Frigorifico"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Descrição</label>
              <textarea
                value={formData.description}
                onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={2}
                placeholder="Instruções ou contexto adicional"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Departamento</label>
              <select
                value={formData.department_id}
                onChange={e => setFormData(p => ({ ...p, department_id: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Todos os departamentos</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            <div>
              <UnitMultiSelect
                units={units}
                selected={formData.unit_ids}
                onChange={ids => setFormData(p => ({ ...p, unit_ids: ids }))}
                label="Unidades"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Frequência *</label>
              <select
                value={formData.frequency}
                onChange={e => setFormData(p => ({ ...p, frequency: e.target.value as HaccpFrequency }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {Object.entries(FREQUENCY_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            {formData.frequency === 'specific_days' && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-2">Dias da semana *</label>
                <div className="flex gap-2 flex-wrap">
                  {DAY_LABELS.map((label, day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={`w-11 h-11 rounded-xl text-sm font-semibold transition ${
                        formData.scheduled_days.includes(day)
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {formData.scheduled_days.length === 0 && (
                  <p className="text-xs text-red-500 mt-1">Seleciona pelo menos um dia.</p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Ordem de exibição</label>
              <input
                type="number"
                value={formData.display_order}
                onChange={e => setFormData(p => ({ ...p, display_order: parseInt(e.target.value) || 0 }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="0"
              />
            </div>

            <div className="md:col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="active"
                checked={formData.active}
                onChange={e => setFormData(p => ({ ...p, active: e.target.checked }))}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <label htmlFor="active" className="text-sm text-slate-700">Tarefa ativa</label>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">Campos de entrada</h3>
              <button
                type="button"
                onClick={addInput}
                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                <Plus className="w-4 h-4" />
                Adicionar campo
              </button>
            </div>

            <div className="space-y-3">
              {inputs.map((inp, idx) => (
                <div key={idx} className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                  <div className="flex items-start gap-2">
                    <GripVertical className="w-4 h-4 text-slate-400 mt-2 flex-shrink-0" />
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Etiqueta *</label>
                        <input
                          type="text"
                          value={inp.label || ''}
                          onChange={e => updateInput(idx, 'label', e.target.value)}
                          className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                          placeholder="Ex: Temperatura (°C)"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
                        <select
                          value={inp.input_type || 'checkbox'}
                          onChange={e => updateInput(idx, 'input_type', e.target.value as HaccpInputType)}
                          className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                        >
                          {Object.entries(INPUT_TYPE_LABELS).map(([val, label]) => (
                            <option key={val} value={val}>{label}</option>
                          ))}
                        </select>
                      </div>

                      {inp.input_type === 'numeric' && (
                        <>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Mínimo</label>
                            <input
                              type="number"
                              value={inp.numeric_min ?? ''}
                              onChange={e => updateInput(idx, 'numeric_min', e.target.value === '' ? null : parseFloat(e.target.value))}
                              className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                              placeholder="Sem limite"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Máximo</label>
                            <input
                              type="number"
                              value={inp.numeric_max ?? ''}
                              onChange={e => updateInput(idx, 'numeric_max', e.target.value === '' ? null : parseFloat(e.target.value))}
                              className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                              placeholder="Sem limite"
                            />
                          </div>
                        </>
                      )}

                      {(inp.input_type === 'text' || inp.input_type === 'numeric') && (
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-slate-600 mb-1">Placeholder</label>
                          <input
                            type="text"
                            value={inp.placeholder || ''}
                            onChange={e => updateInput(idx, 'placeholder', e.target.value)}
                            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                            placeholder="Texto de ajuda"
                          />
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`req-${idx}`}
                          checked={inp.required ?? true}
                          onChange={e => updateInput(idx, 'required', e.target.checked)}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <label htmlFor={`req-${idx}`} className="text-xs text-slate-600">Obrigatório</label>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeInput(idx)}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 text-sm font-medium hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'A guardar...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
