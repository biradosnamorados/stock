import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  X, CheckCircle2, XCircle, MinusCircle, Camera, Image,
  AlertCircle, MessageSquare, Check, User,
} from 'lucide-react';
import {
  HaccpTask, HaccpTaskInput, HaccpFieldStatus, HaccpSessionStatus, HaccpFieldEntry,
} from '../../types/haccp';
import { format } from 'date-fns';

interface Props {
  task: HaccpTask;
  sessionId: string | null;
  existingEntries: HaccpFieldEntry[];
  onClose: () => void;
  onSaved: () => void;
}

interface FieldState {
  status: HaccpFieldStatus | null;
  valueBoolean: boolean | null;
  valueNumeric: string;
  valueText: string;
  valueDatetime: string;
  photoFile: File | null;
  photoUrl: string | null;
  observation: string;
  showObs: boolean;
  filledBy: string | null;
  filledAt: string | null;
  existingEntryId: string | null;
}

const STATUS_CONFIG = {
  compliant: {
    label: 'Conforme',
    icon: CheckCircle2,
    active: 'bg-emerald-500 text-white shadow-lg scale-105',
    idle: 'bg-white border-2 border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-600',
  },
  non_compliant: {
    label: 'Não conforme',
    icon: XCircle,
    active: 'bg-red-500 text-white shadow-lg scale-105',
    idle: 'bg-white border-2 border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-600',
  },
  not_used: {
    label: 'Não utilizado',
    icon: MinusCircle,
    active: 'bg-slate-400 text-white shadow-lg scale-105',
    idle: 'bg-white border-2 border-slate-200 text-slate-400 hover:border-slate-400',
  },
} as const;

export default function HaccpTaskExecute({ task, sessionId, existingEntries, onClose, onSaved }: Props) {
  const { profile } = useAuth();
  const inputs = task.haccp_task_inputs?.sort((a, b) => a.display_order - b.display_order) || [];
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [savedFields, setSavedFields] = useState<Set<string>>(() => {
    const s = new Set<string>();
    existingEntries.forEach(e => { if (e.input_id) s.add(e.input_id); });
    return s;
  });
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(sessionId);

  const buildInitialState = (): Record<string, FieldState> => {
    const init: Record<string, FieldState> = {};
    inputs.forEach(inp => {
      const ex = existingEntries.find(e => e.input_id === inp.id);
      init[inp.id] = {
        status: ex ? ex.field_status : null,
        valueBoolean: ex?.value_boolean ?? null,
        valueNumeric: ex?.value_numeric != null ? String(ex.value_numeric) : '',
        valueText: ex?.value_text ?? '',
        valueDatetime: ex?.value_datetime
          ? new Date(ex.value_datetime).toISOString().slice(0, 16)
          : new Date().toISOString().slice(0, 16),
        photoFile: null,
        photoUrl: ex?.value_photo_url ?? null,
        observation: ex?.observation ?? '',
        showObs: !!(ex?.observation),
        filledBy: ex?.profiles?.full_name || ex?.profiles?.email || null,
        filledAt: ex?.performed_at ?? null,
        existingEntryId: ex?.id ?? null,
      };
    });
    return init;
  };

  const [fields, setFields] = useState<Record<string, FieldState>>(buildInitialState);

  const updateField = (inputId: string, patch: Partial<FieldState>) => {
    setFields(prev => ({ ...prev, [inputId]: { ...prev[inputId], ...patch } }));
  };

  const filledCount = inputs.filter(inp => fields[inp.id]?.status !== null).length;
  const totalCount = inputs.length;
  const pct = totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0;

  const getOrCreateSession = async (): Promise<string> => {
    if (currentSessionId) return currentSessionId;
    const today = new Date().toISOString().split('T')[0];
    const { data: existing } = await supabase
      .from('haccp_task_sessions')
      .select('id')
      .eq('task_id', task.id)
      .eq('session_date', today)
      .is('shift_period', null)
      .maybeSingle();

    if (existing) {
      setCurrentSessionId(existing.id);
      return existing.id;
    }

    const { data: created, error } = await supabase
      .from('haccp_task_sessions')
      .insert({
        task_id: task.id,
        unit_id: profile!.unit_id,
        department_id: profile!.department_id,
        session_date: today,
        status: 'in_progress',
        total_fields: inputs.length,
        filled_fields: 0,
      })
      .select('id')
      .single();
    if (error) throw error;
    setCurrentSessionId(created.id);
    return created.id;
  };

  const saveField = async (inp: HaccpTaskInput) => {
    const f = fields[inp.id];
    if (!f.status) return;
    setSaving(inp.id);
    setGlobalError(null);

    try {
      let photoUrl = f.photoUrl;
      if (f.photoFile) {
        const ext = f.photoFile.name.split('.').pop() || 'jpg';
        const path = `${profile!.id}/${Date.now()}-${inp.id}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('haccp-photos')
          .upload(path, f.photoFile, { upsert: true });
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabase.storage.from('haccp-photos').getPublicUrl(path);
        photoUrl = publicUrl;
      }

      const sid = await getOrCreateSession();

      const entryPayload: Record<string, any> = {
        session_id: sid,
        task_id: task.id,
        input_id: inp.id,
        input_label: inp.label,
        input_type: inp.input_type,
        field_status: f.status,
        observation: f.observation || null,
        performed_by: profile!.id,
        performed_at: new Date().toISOString(),
        value_boolean: null,
        value_numeric: null,
        value_text: null,
        value_photo_url: null,
        value_datetime: null,
      };

      if (f.status !== 'not_used') {
        if (inp.input_type === 'checkbox') entryPayload.value_boolean = f.valueBoolean ?? null;
        else if (inp.input_type === 'numeric') entryPayload.value_numeric = f.valueNumeric !== '' ? parseFloat(f.valueNumeric) : null;
        else if (inp.input_type === 'text') entryPayload.value_text = f.valueText || null;
        else if (inp.input_type === 'datetime') entryPayload.value_datetime = f.valueDatetime || null;
        else if (inp.input_type === 'photo') entryPayload.value_photo_url = photoUrl;
      }

      let newEntryId = f.existingEntryId;
      if (f.existingEntryId) {
        const { error } = await supabase
          .from('haccp_field_entries')
          .update(entryPayload)
          .eq('id', f.existingEntryId);
        if (error) throw error;
      } else {
        const { data: newEntry, error } = await supabase
          .from('haccp_field_entries')
          .insert(entryPayload)
          .select('id')
          .single();
        if (error) throw error;
        newEntryId = newEntry.id;
      }

      // Recompute session status
      const updatedFields = { ...fields, [inp.id]: { ...f, status: f.status } };
      const filledNow = inputs.filter(i => updatedFields[i.id]?.status !== null).length;
      const hasNonCompliant = inputs.some(i => updatedFields[i.id]?.status === 'non_compliant');

      let newStatus: HaccpSessionStatus = 'in_progress';
      if (filledNow === inputs.length) {
        newStatus = hasNonCompliant ? 'non_compliant' : 'completed';
      }

      await supabase.from('haccp_task_sessions').update({
        filled_fields: filledNow,
        status: newStatus,
        updated_at: new Date().toISOString(),
        ...(newStatus === 'completed' || newStatus === 'non_compliant'
          ? { completed_at: new Date().toISOString() }
          : {}),
      }).eq('id', sid);

      setSavedFields(prev => new Set([...prev, inp.id]));
      updateField(inp.id, {
        photoUrl,
        existingEntryId: newEntryId,
        filledBy: profile!.full_name || profile!.email || null,
        filledAt: new Date().toISOString(),
      });

      if (filledNow === inputs.length) {
        setTimeout(() => onSaved(), 800);
      }
    } catch (err: any) {
      setGlobalError(err.message || 'Erro ao guardar');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg max-h-[95vh] flex flex-col shadow-2xl">

        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-slate-800 truncate">{task.name}</h2>
            {task.description && (
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{task.description}</p>
            )}
          </div>
          <button onClick={onClose} className="ml-3 p-2 hover:bg-slate-100 rounded-xl flex-shrink-0">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-slate-600">{filledCount} de {totalCount} verificações</span>
            <span className="text-xs font-bold text-emerald-600">{pct}%</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all duration-500 bg-emerald-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {globalError && (
          <div className="mx-5 mt-3 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {globalError}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {inputs.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">Sem campos configurados.</p>
          ) : (
            inputs.map(inp => (
              <FieldCard
                key={inp.id}
                inp={inp}
                state={fields[inp.id]}
                isSaving={saving === inp.id}
                justSaved={savedFields.has(inp.id) && saving !== inp.id}
                fileRef={el => { fileRefs.current[inp.id] = el; }}
                onChange={patch => updateField(inp.id, patch)}
                onSave={() => saveField(inp)}
              />
            ))
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-2xl border-2 border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 active:scale-95 transition-all"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── FieldCard ─────────────────────────────────────────────────────────────────

interface FieldCardProps {
  inp: HaccpTaskInput;
  state: FieldState;
  isSaving: boolean;
  justSaved: boolean;
  fileRef: (el: HTMLInputElement | null) => void;
  onChange: (patch: Partial<FieldState>) => void;
  onSave: () => void;
}

function FieldCard({ inp, state, isSaving, justSaved, fileRef, onChange, onSave }: FieldCardProps) {
  const localFileRef = useRef<HTMLInputElement | null>(null);
  const needsValue = state.status === 'compliant' || state.status === 'non_compliant';

  const borderColor =
    state.status === 'compliant' ? 'border-emerald-300 bg-emerald-50' :
    state.status === 'non_compliant' ? 'border-red-300 bg-red-50' :
    state.status === 'not_used' ? 'border-slate-300 bg-slate-50' :
    'border-slate-200 bg-white';

  return (
    <div className={`rounded-2xl border-2 transition-all duration-200 ${borderColor}`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-slate-800">
              {inp.label}
              {inp.required && <span className="text-red-400 ml-0.5">*</span>}
            </span>
            {state.filledBy && state.filledAt && (
              <div className="flex items-center gap-1 mt-0.5 text-xs text-slate-400">
                <User className="w-3 h-3" />
                <span>{state.filledBy}</span>
                <span>· {format(new Date(state.filledAt), 'HH:mm')}</span>
              </div>
            )}
          </div>
          {justSaved && (
            <span className="flex-shrink-0 text-xs text-emerald-600 font-medium flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Guardado
            </span>
          )}
        </div>

        {/* 3-state buttons */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {(['compliant', 'non_compliant', 'not_used'] as HaccpFieldStatus[]).map(s => {
            const cfg = STATUS_CONFIG[s];
            const Icon = cfg.icon;
            const isActive = state.status === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => {
                  const patch: Partial<FieldState> = { status: s };
                  if (inp.input_type === 'checkbox' && s !== 'not_used') {
                    patch.valueBoolean = s === 'compliant';
                  }
                  onChange(patch);
                }}
                className={`flex flex-col items-center gap-1 py-3 rounded-xl text-xs font-bold transition-all active:scale-95 ${isActive ? cfg.active : cfg.idle}`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-center leading-tight">{cfg.label}</span>
              </button>
            );
          })}
        </div>

        {/* Value input */}
        {needsValue && inp.input_type !== 'checkbox' && (
          <div className="mb-3">
            {inp.input_type === 'numeric' && (
              <div>
                <input
                  type="number"
                  value={state.valueNumeric}
                  onChange={e => onChange({ valueNumeric: e.target.value })}
                  step="0.1"
                  inputMode="decimal"
                  placeholder={inp.placeholder || '0'}
                  className="w-full bg-white border-2 border-slate-200 rounded-xl px-4 py-3 text-xl font-bold text-center focus:border-emerald-400 outline-none"
                />
                {(inp.numeric_min !== null || inp.numeric_max !== null) && (
                  <p className="text-xs text-slate-400 text-center mt-1">
                    {inp.numeric_min !== null && inp.numeric_max !== null
                      ? `Entre ${inp.numeric_min} e ${inp.numeric_max}`
                      : inp.numeric_min !== null ? `Mínimo: ${inp.numeric_min}` : `Máximo: ${inp.numeric_max}`}
                  </p>
                )}
              </div>
            )}
            {inp.input_type === 'text' && (
              <textarea
                value={state.valueText}
                onChange={e => onChange({ valueText: e.target.value })}
                rows={2}
                placeholder={inp.placeholder || 'Escreva aqui...'}
                className="w-full bg-white border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-emerald-400 outline-none resize-none"
              />
            )}
            {inp.input_type === 'datetime' && (
              <input
                type="datetime-local"
                value={state.valueDatetime}
                onChange={e => onChange({ valueDatetime: e.target.value })}
                className="w-full bg-white border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-emerald-400 outline-none"
              />
            )}
            {inp.input_type === 'photo' && (
              <PhotoField
                photoUrl={state.photoUrl}
                photoFile={state.photoFile}
                fileRef={localFileRef}
                onChange={onChange}
              />
            )}
          </div>
        )}

        {state.status === 'not_used' && (
          <div className="mb-3 flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-2">
            <MinusCircle className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <span className="text-xs text-slate-500 font-medium">Não utilizado durante o turno</span>
          </div>
        )}

        {state.status !== null && (
          <div className="space-y-2">
            {!state.showObs ? (
              <button
                type="button"
                onClick={() => onChange({ showObs: true })}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Adicionar observação
              </button>
            ) : (
              <textarea
                value={state.observation}
                onChange={e => onChange({ observation: e.target.value })}
                placeholder="Observação opcional..."
                rows={2}
                className="w-full bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-xs focus:border-slate-400 outline-none resize-none"
              />
            )}

            <button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              className={`w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                isSaving ? 'bg-slate-200 text-slate-400 cursor-not-allowed' :
                state.status === 'compliant' ? 'bg-emerald-600 text-white hover:bg-emerald-700' :
                state.status === 'non_compliant' ? 'bg-red-600 text-white hover:bg-red-700' :
                'bg-slate-600 text-white hover:bg-slate-700'
              }`}
            >
              {isSaving ? 'A guardar...' : 'Guardar verificação'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PhotoField ────────────────────────────────────────────────────────────────

interface PhotoFieldProps {
  photoUrl: string | null;
  photoFile: File | null;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onChange: (patch: Partial<FieldState>) => void;
}

function PhotoField({ photoUrl, photoFile, fileRef, onChange }: PhotoFieldProps) {
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photoFile) {
      setPreviewDataUrl(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => setPreviewDataUrl(e.target?.result as string ?? null);
    reader.readAsDataURL(photoFile);
  }, [photoFile]);

  const previewUrl = previewDataUrl || photoUrl;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onChange({ photoFile: file });
    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

  return (
    <div className="space-y-2">
      {previewUrl ? (
        <div className="relative">
          <img
            src={previewUrl}
            alt="Fotografia"
            className="w-full rounded-xl object-cover border-2 border-slate-200"
            style={{ maxHeight: '220px' }}
          />
          <button
            type="button"
            onClick={() => {
              onChange({ photoFile: null, photoUrl: null });
              setPreviewDataUrl(null);
              if (fileRef.current) fileRef.current.value = '';
            }}
            className="absolute top-2 right-2 w-7 h-7 bg-slate-900/60 hover:bg-red-600 rounded-full flex items-center justify-center transition"
          >
            <X className="w-3.5 h-3.5 text-white" />
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="absolute bottom-2 right-2 flex items-center gap-1 bg-slate-900/60 hover:bg-slate-900/80 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg transition"
          >
            <Camera className="w-3.5 h-3.5" />
            Substituir
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50 transition text-slate-500 hover:text-blue-600 active:scale-[0.98]"
        >
          <Camera className="w-7 h-7" />
          <span className="text-sm font-medium">Tirar ou escolher fotografia</span>
          <span className="text-xs text-slate-400">JPEG, PNG, WebP · máx. 10 MB</span>
        </button>
      )}

      <input
        ref={fileRef as React.RefObject<HTMLInputElement>}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
