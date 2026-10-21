import { useEffect, useState } from 'react';
import { Shield, Plus, Pencil, Trash2, Copy, ChevronDown, ChevronRight, Check, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Module {
  id: string;
  code: string;
  name: string;
  display_order: number;
}

interface Action {
  id: string;
  code: string;
  name: string;
}

interface ProfilePermission {
  module_id: string;
  action_id: string;
  granted: boolean;
}

interface Profile {
  id: string;
  name: string;
  description: string | null;
  color: string;
  role: 'Admin' | 'Chefe' | 'Staff';
  active: boolean;
  permissions: ProfilePermission[];
  _userCount?: number;
}

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#64748b', '#10b981',
];

export default function AccessProfiles() {
  const { profile: authProfile } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formColor, setFormColor] = useState('#3b82f6');
  const [formRole, setFormRole] = useState<'Admin' | 'Chefe' | 'Staff'>('Staff');
  const [formPerms, setFormPerms] = useState<Record<string, Record<string, boolean>>>({});

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [{ data: mods }, { data: acts }, { data: profs }] = await Promise.all([
        supabase.from('system_modules').select('id, code, name, display_order').eq('active', true).order('display_order'),
        supabase.from('module_actions').select('id, code, name'),
        supabase.from('access_profiles').select('*, access_profile_permissions(module_id, action_id, granted)'),
      ]);

      setModules(mods || []);
      setActions(acts || []);

      // Count users per profile
      const { data: userCounts } = await supabase
        .from('profiles')
        .select('access_profile_id')
        .not('access_profile_id', 'is', null);

      const countMap: Record<string, number> = {};
      (userCounts || []).forEach((u: any) => {
        if (u.access_profile_id) countMap[u.access_profile_id] = (countMap[u.access_profile_id] || 0) + 1;
      });

      setProfiles(
        (profs || []).map((p: any) => ({
          ...p,
          permissions: p.access_profile_permissions || [],
          _userCount: countMap[p.id] || 0,
        }))
      );
    } finally {
      setLoading(false);
    }
  };

  const openNew = () => {
    setEditing(null);
    setFormName('');
    setFormDesc('');
    setFormColor('#3b82f6');
    setFormRole('Staff');
    setFormPerms({});
    setError(null);
    setShowForm(true);
  };

  const openEdit = (p: Profile) => {
    setEditing(p);
    setFormName(p.name);
    setFormDesc(p.description || '');
    setFormColor(p.color);
    setFormRole(p.role);
    const pm: Record<string, Record<string, boolean>> = {};
    p.permissions.forEach((perm) => {
      if (!pm[perm.module_id]) pm[perm.module_id] = {};
      pm[perm.module_id][perm.action_id] = perm.granted;
    });
    setFormPerms(pm);
    setError(null);
    setShowForm(true);
  };

  const openDuplicate = (p: Profile) => {
    setEditing(null);
    setFormName(p.name + ' (cópia)');
    setFormDesc(p.description || '');
    setFormColor(p.color);
    setFormRole(p.role);
    const pm: Record<string, Record<string, boolean>> = {};
    p.permissions.forEach((perm) => {
      if (!pm[perm.module_id]) pm[perm.module_id] = {};
      pm[perm.module_id][perm.action_id] = perm.granted;
    });
    setFormPerms(pm);
    setError(null);
    setShowForm(true);
  };

  const handleDelete = async (p: Profile) => {
    if (p._userCount && p._userCount > 0) {
      alert(`Este perfil está atribuído a ${p._userCount} utilizador(es). Reatribua-os antes de eliminar.`);
      return;
    }
    if (!confirm(`Eliminar perfil "${p.name}"?`)) return;
    await supabase.from('access_profiles').delete().eq('id', p.id);
    loadAll();
  };

  const togglePerm = (moduleId: string, actionId: string) => {
    setFormPerms((prev) => {
      const next = { ...prev };
      if (!next[moduleId]) next[moduleId] = {};
      next[moduleId] = { ...next[moduleId], [actionId]: !next[moduleId][actionId] };
      return next;
    });
  };

  const grantAllModule = (moduleId: string) => {
    setFormPerms((prev) => {
      const next = { ...prev, [moduleId]: {} };
      actions.forEach((a) => { next[moduleId][a.id] = true; });
      return next;
    });
  };

  const revokeAllModule = (moduleId: string) => {
    setFormPerms((prev) => ({ ...prev, [moduleId]: {} }));
  };

  const handleSave = async () => {
    if (!formName.trim()) { setError('O nome é obrigatório.'); return; }
    setSaving(true);
    setError(null);
    try {
      let profileId = editing?.id;

      if (profileId) {
        await supabase.from('access_profiles').update({
          name: formName.trim(),
          description: formDesc.trim() || null,
          color: formColor,
          role: formRole,
        }).eq('id', profileId);
        await supabase.from('access_profile_permissions').delete().eq('profile_id', profileId);
      } else {
        const { data, error: insErr } = await supabase.from('access_profiles').insert({
          name: formName.trim(),
          description: formDesc.trim() || null,
          color: formColor,
          role: formRole,
          created_by: authProfile?.id,
        }).select().maybeSingle();
        if (insErr) throw insErr;
        profileId = data?.id;
      }

      if (!profileId) throw new Error('Falha ao obter ID do perfil');

      const permRows: any[] = [];
      Object.entries(formPerms).forEach(([moduleId, acts]) => {
        Object.entries(acts).forEach(([actionId, granted]) => {
          if (granted) permRows.push({ profile_id: profileId, module_id: moduleId, action_id: actionId, granted: true });
        });
      });

      if (permRows.length > 0) {
        const { error: permErr } = await supabase.from('access_profile_permissions').insert(permRows);
        if (permErr) throw permErr;
      }

      setShowForm(false);
      setEditing(null);
      loadAll();
    } catch (err: any) {
      setError(err.message || 'Erro ao guardar');
    } finally {
      setSaving(false);
    }
  };

  if (authProfile?.role !== 'Admin') {
    return <div className="p-6 text-center text-slate-500">Apenas administradores podem gerir perfis de acesso.</div>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Perfis de Acesso</h1>
          <p className="text-slate-500 mt-1 text-sm">Grupos de permissões reutilizáveis para atribuir a utilizadores</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition"
        >
          <Plus className="w-4 h-4" />
          Novo Perfil
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {profiles.map((p) => (
          <div key={p.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-md transition">
            {/* Color bar */}
            <div className="h-1.5" style={{ backgroundColor: p.color }} />
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: p.color + '20' }}
                  >
                    <Shield className="w-5 h-5" style={{ color: p.color }} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800">{p.name}</h3>
                    {p.description && (
                      <p className="text-xs text-slate-500 mt-0.5">{p.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                  <button onClick={() => openDuplicate(p)} className="p-1.5 hover:bg-slate-100 rounded-lg transition" title="Duplicar">
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                  <button onClick={() => openEdit(p)} className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition" title="Editar">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(p)} className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition" title="Eliminar">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {p.permissions.filter((perm) => perm.granted).length} permissões
                </span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    p.role === 'Admin' ? 'bg-red-50 text-red-600' :
                    p.role === 'Chefe' ? 'bg-amber-50 text-amber-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {p.role}
                  </span>
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">
                    {p._userCount} utilizador(es)
                  </span>
                </div>
              </div>

              {/* Expand modules */}
              <button
                onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                className="mt-3 w-full flex items-center justify-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium py-1.5 rounded-lg hover:bg-blue-50 transition"
              >
                {expanded === p.id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                Ver permissões
              </button>

              {expanded === p.id && (
                <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
                  {modules.map((mod) => {
                    const modPerms = p.permissions.filter((perm) => perm.module_id === mod.id && perm.granted);
                    if (modPerms.length === 0) return null;
                    return (
                      <div key={mod.id} className="flex items-center justify-between">
                        <span className="text-xs text-slate-600">{mod.name}</span>
                        <div className="flex gap-0.5">
                          {actions.map((act) => {
                            const has = p.permissions.some((perm) => perm.module_id === mod.id && perm.action_id === act.id && perm.granted);
                            if (!has) return null;
                            return (
                              <span key={act.id} className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                                {act.code}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}

        {profiles.length === 0 && (
          <div className="col-span-full bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <Shield className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500 font-medium">Nenhum perfil criado</p>
            <button onClick={openNew} className="mt-4 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition">
              Criar primeiro perfil
            </button>
          </div>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 flex-shrink-0">
              <h2 className="text-lg font-bold text-slate-800">
                {editing ? 'Editar Perfil' : 'Novo Perfil de Acesso'}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-slate-100 rounded-xl transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nome *</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ex: Kitchen Staff"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Função do sistema *</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Staff', 'Chefe', 'Admin'] as const).map(r => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setFormRole(r)}
                        className={`py-2 rounded-xl border-2 text-sm font-semibold transition ${
                          formRole === r
                            ? r === 'Admin' ? 'border-red-500 bg-red-50 text-red-700'
                              : r === 'Chefe' ? 'border-amber-400 bg-amber-50 text-amber-700'
                              : 'border-slate-400 bg-slate-100 text-slate-700'
                            : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5">
                    {formRole === 'Admin' ? 'Acesso total ao sistema e gestão de utilizadores' :
                     formRole === 'Chefe' ? 'Pode gerir encomendas, stock e aprovar operações' :
                     'Acesso operacional básico definido pelas permissões abaixo'}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Descrição</label>
                <input
                  type="text"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Descrição opcional"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Cor</label>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormColor(c)}
                      className="w-8 h-8 rounded-lg border-2 transition"
                      style={{ backgroundColor: c, borderColor: formColor === c ? '#1e293b' : 'transparent' }}
                    />
                  ))}
                </div>
              </div>

              {/* Permissions grid */}
              <div className="border-t border-slate-200 pt-5">
                <h3 className="font-semibold text-slate-800 mb-4">Permissões por Módulo</h3>
                <div className="space-y-3">
                  {modules.map((mod) => {
                    const modPermsCount = actions.filter((a) => formPerms[mod.id]?.[a.id]).length;
                    return (
                      <div key={mod.id} className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm text-slate-800">{mod.name}</span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => grantAllModule(mod.id)}
                              className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                            >
                              Todas
                            </button>
                            <span className="text-slate-300">|</span>
                            <button
                              type="button"
                              onClick={() => revokeAllModule(mod.id)}
                              className="text-xs text-red-500 hover:text-red-600 font-medium"
                            >
                              Nenhuma
                            </button>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {actions.map((act) => {
                            const granted = formPerms[mod.id]?.[act.id] || false;
                            return (
                              <button
                                key={act.id}
                                type="button"
                                onClick={() => togglePerm(mod.id, act.id)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                                  granted
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                                }`}
                              >
                                {granted ? <Check className="w-3 h-3" /> : <X className="w-3 h-3 opacity-40" />}
                                {act.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
              )}
            </div>

            <div className="flex gap-3 p-6 border-t border-slate-200 flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition disabled:opacity-50"
              >
                {saving ? 'A guardar...' : 'Guardar Perfil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
