import { useState, useRef } from 'react';
import { X, CheckCircle2, Camera, FileText, Loader2, User } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Task {
  id: string;
  name: string;
  description: string | null;
  requires_notes: boolean;
  requires_photo: boolean;
}

interface Category {
  id: string;
  name: string;
  category_type: string;
}

interface Props {
  task: Task;
  category: Category;
  onClose: () => void;
  onCompleted: () => void;
}

export default function MandatoryTaskExecute({ task, category, onClose, onCompleted }: Props) {
  const { profile } = useAuth();
  const [notes, setNotes] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!profile) return;
    if (task.requires_notes && !notes.trim()) {
      setError('Por favor, adicione uma nota antes de concluir.');
      return;
    }
    // Photo is always optional — never block submission

    setSaving(true);
    setError(null);

    try {
      let photoUrl: string | null = null;

      if (photoFile) {
        const ext = photoFile.name.split('.').pop();
        const path = `${profile.id}/${task.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('task-photos')
          .upload(path, photoFile, { upsert: false });

        if (uploadError) throw new Error('Erro ao carregar foto: ' + uploadError.message);

        const { data: urlData } = supabase.storage.from('task-photos').getPublicUrl(path);
        photoUrl = urlData.publicUrl;
      }

      const { error: logError } = await supabase.from('mandatory_task_logs').insert({
        task_id: task.id,
        task_name: task.name,
        category_id: category.id,
        category_name: category.name,
        performed_by: profile.id,
        unit_id: profile.unit_id,
        department_id: profile.department_id,
        notes: notes.trim() || null,
        photo_url: photoUrl,
        completed_at: new Date().toISOString(),
      });

      if (logError) throw logError;

      setSuccess(true);
      setTimeout(() => onCompleted(), 1200);
    } catch (err: any) {
      setError(err.message || 'Erro ao guardar tarefa');
    } finally {
      setSaving(false);
    }
  };

  if (success) {
    return (
      <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-3xl p-10 flex flex-col items-center shadow-2xl max-w-sm w-full">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 text-center">{task.name}</h2>
          <p className="text-emerald-600 font-medium mt-2">Tarefa concluída!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-slate-100">
          <div className="flex-1 pr-4">
            <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">{category.name}</p>
            <h2 className="text-xl font-bold text-slate-800 leading-tight">{task.name}</h2>
            {task.description && (
              <p className="text-sm text-slate-500 mt-1">{task.description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl transition flex-shrink-0"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Performed by */}
          <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3 border border-slate-200">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Registado por</p>
              <p className="text-sm font-semibold text-slate-800">{profile?.full_name || profile?.email || 'Utilizador'}</p>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
              <FileText className="w-4 h-4 text-slate-400" />
              Notas {task.requires_notes && <span className="text-red-500">*</span>}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observações opcionais..."
              rows={3}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Photo — always optional */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
              <Camera className="w-4 h-4 text-slate-400" />
              Foto <span className="text-xs font-normal text-slate-400">(opcional)</span>
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhoto}
              className="hidden"
            />
            {photoPreview ? (
              <div className="relative">
                <img
                  src={photoPreview}
                  alt="Preview"
                  className="w-full h-40 object-cover rounded-xl border border-slate-200"
                />
                <button
                  onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                  className="absolute top-2 right-2 bg-slate-800/70 text-white rounded-full p-1.5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full h-20 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center gap-3 text-slate-400 hover:border-blue-300 hover:text-blue-500 transition active:scale-[0.98]"
              >
                <Camera className="w-5 h-5" />
                <span className="text-sm font-medium">Tirar foto / Galeria</span>
              </button>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 rounded-2xl border border-slate-200 text-slate-700 font-semibold text-base hover:bg-slate-50 transition active:scale-[0.98]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-base transition active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  A guardar...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  Concluir Tarefa
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
