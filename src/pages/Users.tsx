import { useEffect, useState, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Users as UsersIcon, Plus, CreditCard as Edit, Lock, UserCheck, UserX, AlertCircle, Shield, Hash, KeyRound } from 'lucide-react';
import { Link } from 'react-router-dom';

interface User {
  id: string;
  email: string;
  full_name: string | null;
  username: string | null;
  role: string;
  active: boolean;
  password_reset_required: boolean;
  access_profile_id: string | null;
  pin_hash: string | null;
  units: { name: string; id: string } | null;
  departments: { name: string; id: string } | null;
  created_at: string;
}

interface Unit { id: string; name: string }
interface Department { id: string; name: string }
interface AccessProfile { id: string; name: string; color: string; role: string }

async function hashPin(pin: string): Promise<string> {
  const buf = new TextEncoder().encode(pin);
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function Users() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [accessProfiles, setAccessProfiles] = useState<AccessProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pinModal, setPinModal] = useState<User | null>(null);
  const [newPin, setNewPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pwModal, setPwModal] = useState<User | null>(null);
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    username: '',
    unit_id: '',
    department_id: '',
    access_profile_id: '',
    password: '',
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [usersRes, unitsRes, depsRes, profilesRes] = await Promise.all([
        supabase.from('profiles').select('*, units(name, id), departments(name, id)').order('created_at', { ascending: false }),
        supabase.from('units').select('id, name').eq('active', true).order('name'),
        supabase.from('departments').select('id, name').eq('active', true).order('name'),
        supabase.from('access_profiles').select('id, name, color, role').eq('active', true).order('name'),
      ]);

      if (usersRes.data) setUsers(usersRes.data as any);
      if (unitsRes.data) setUnits(unitsRes.data);
      if (depsRes.data) setDepartments(depsRes.data);
      if (profilesRes.data) setAccessProfiles(profilesRes.data);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      // Derive role from the selected access profile
      const selectedProfile = accessProfiles.find(ap => ap.id === formData.access_profile_id);
      const derivedRole = selectedProfile?.role || 'Staff';

      if (editingUser) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            full_name: formData.full_name,
            username: formData.username || null,
            role: derivedRole,
            unit_id: formData.unit_id || null,
            department_id: formData.department_id || null,
            access_profile_id: formData.access_profile_id || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingUser.id);

        if (updateError) throw updateError;

        await supabase.from('audit_logs').insert({
          user_id: profile?.id,
          action: 'update_user',
          entity: 'profiles',
          entity_id: editingUser.id,
          changes: { ...formData, role: derivedRole },
        });
      } else {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        const response = await fetch(`${supabaseUrl}/functions/v1/create-admin-user`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'apikey': supabaseAnonKey,
          },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
            full_name: formData.full_name,
            username: formData.username || null,
            role: derivedRole,
            unit_id: formData.unit_id || null,
            department_id: formData.department_id || null,
            access_profile_id: formData.access_profile_id || null,
            created_by: profile?.id,
          }),
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Failed to create user');

        await supabase.from('audit_logs').insert({
          user_id: profile?.id,
          action: 'create_user',
          entity: 'profiles',
          entity_id: result.user_id,
          changes: { email: formData.email, role: derivedRole },
        });
      }

      resetForm();
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to save user');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({ email: '', full_name: '', username: '', unit_id: '', department_id: '', access_profile_id: '', password: '' });
    setShowForm(false);
    setEditingUser(null);
    setError('');
  };

  const toggleUserStatus = async (user: User) => {
    try {
      const { error } = await supabase.from('profiles')
        .update({ active: !user.active, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) throw error;
      await supabase.from('audit_logs').insert({
        user_id: profile?.id,
        action: user.active ? 'deactivate_user' : 'activate_user',
        entity: 'profiles',
        entity_id: user.id,
      });
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to update user status');
    }
  };

  const resetPassword = async (user: User) => {
    setPwModal(user);
    setNewPw('');
    setConfirmPw('');
    setPwError('');
  };

  const submitPasswordReset = async () => {
    if (!pwModal) return;
    if (newPw.length < 6) { setPwError('A palavra-passe deve ter pelo menos 6 caracteres.'); return; }
    if (newPw !== confirmPw) { setPwError('As palavras-passe não coincidem.'); return; }
    setPwLoading(true);
    setPwError('');
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Apikey': supabaseAnonKey,
        },
        body: JSON.stringify({
          user_id: pwModal.id,
          new_password: newPw,
          admin_id: profile?.id,
        }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Erro ao redefinir palavra-passe');
      setPwModal(null);
      setNewPw('');
      setConfirmPw('');
      loadData();
    } catch (err: any) {
      setPwError(err.message || 'Erro ao redefinir palavra-passe');
    } finally {
      setPwLoading(false);
    }
  };

  const savePin = async () => {
    if (!pinModal) return;
    if (!/^\d{4}$/.test(newPin)) { setPinError('O PIN deve ter exatamente 4 dígitos.'); return; }
    setPinError('');
    try {
      const hash = await hashPin(newPin);
      const { error } = await supabase.from('profiles').update({ pin_hash: hash }).eq('id', pinModal.id);
      if (error) throw error;
      setPinModal(null);
      setNewPin('');
      loadData();
    } catch (err: any) {
      setPinError(err.message || 'Erro ao guardar PIN');
    }
  };

  const startEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      full_name: user.full_name || '',
      username: user.username || '',
      unit_id: user.units?.id || '',
      department_id: user.departments?.id || '',
      access_profile_id: user.access_profile_id || '',
      password: '',
    });
    setShowForm(true);
  };

  const openNew = () => {
    setEditingUser(null);
    setFormData({ email: '', full_name: '', username: '', unit_id: '', department_id: '', access_profile_id: '', password: '' });
    setError('');
    setShowForm(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">A carregar utilizadores...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Utilizadores</h1>
          <p className="text-slate-600 mt-2">Gerir utilizadores e permissões do sistema</p>
        </div>
        <div className="flex gap-3">
          <Link
            to="/access-profiles"
            className="flex items-center gap-2 bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg transition"
          >
            <Shield className="w-4 h-4" />
            <span>Perfis de Acesso</span>
          </Link>
          <button
            onClick={openNew}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Utilizador</span>
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            {editingUser ? 'Editar Utilizador' : 'Criar Novo Utilizador'}
          </h2>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
                <input
                  type="email"
                  required
                  disabled={!!editingUser}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Nome de Utilizador</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/\s+/g, '') })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="ex: joao.silva (opcional)"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Unidade</label>
                <select
                  value={formData.unit_id}
                  onChange={(e) => setFormData({ ...formData, unit_id: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Selecionar unidade</option>
                  {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Departamento</label>
                <select
                  value={formData.department_id}
                  onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Selecionar departamento</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Perfil de Acesso *</label>
                <select
                  required
                  value={formData.access_profile_id}
                  onChange={(e) => setFormData({ ...formData, access_profile_id: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Selecionar perfil</option>
                  {accessProfiles.map((ap) => (
                    <option key={ap.id} value={ap.id}>
                      {ap.name} ({ap.role})
                    </option>
                  ))}
                </select>
                {formData.access_profile_id && (() => {
                  const ap = accessProfiles.find(p => p.id === formData.access_profile_id);
                  return ap ? (
                    <p className="text-xs text-slate-500 mt-1">
                      Função atribuída automaticamente: <strong>{ap.role}</strong>
                    </p>
                  ) : null;
                })()}
              </div>

              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Palavra-passe Temporária
                    <span className="ml-1 text-xs text-slate-400 font-normal">(pode usar o PIN como pw)</span>
                  </label>
                  <input
                    type="password"
                    required={!editingUser}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Min. 6 caracteres"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition disabled:opacity-50"
              >
                {submitting ? 'A guardar...' : editingUser ? 'Atualizar Utilizador' : 'Criar Utilizador'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Nome</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Utilizador</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Perfil de Acesso</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Unidade</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Departamento</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">PIN</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Estado</th>
                <th className="text-right px-6 py-4 text-sm font-semibold text-slate-700">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    <UsersIcon className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                    <p>Sem utilizadores</p>
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const ap = accessProfiles.find((p) => p.id === user.access_profile_id);
                  return (
                    <tr key={user.id} className="hover:bg-slate-50 transition">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-800">{user.full_name || 'N/A'}</span>
                          {user.password_reset_required && <Lock className="w-3.5 h-3.5 text-orange-500" />}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{user.email}</p>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500 font-mono">
                        {user.username || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-6 py-4">
                        {ap ? (
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium text-white"
                              style={{ backgroundColor: ap.color }}
                            >
                              {ap.name}
                            </span>
                            <span className={`text-xs font-medium ${
                              ap.role === 'Admin' ? 'text-red-600' :
                              ap.role === 'Chefe' ? 'text-amber-700' :
                              'text-slate-500'
                            }`}>
                              {ap.role}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
                            <AlertCircle className="w-3 h-3" />
                            Sem perfil
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{user.units?.name || '—'}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{user.departments?.name || '—'}</td>
                      <td className="px-6 py-4">
                        {user.pin_hash ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                            <Hash className="w-3 h-3" />
                            Definido
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Sem PIN</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                          user.active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {user.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => startEdit(user)} className="p-2 hover:bg-slate-100 rounded-lg transition" title="Editar">
                            <Edit className="w-4 h-4 text-slate-600" />
                          </button>
                          <button
                            onClick={() => { setPinModal(user); setNewPin(''); setPinError(''); }}
                            className="p-2 hover:bg-slate-100 rounded-lg transition"
                            title="Definir PIN"
                          >
                            <Hash className="w-4 h-4 text-slate-600" />
                          </button>
                          <button onClick={() => resetPassword(user)} className="p-2 hover:bg-slate-100 rounded-lg transition" title="Redefinir palavra-passe">
                            <KeyRound className="w-4 h-4 text-slate-600" />
                          </button>
                          <button onClick={() => toggleUserStatus(user)} className="p-2 hover:bg-slate-100 rounded-lg transition" title={user.active ? 'Desativar' : 'Ativar'}>
                            {user.active ? <UserX className="w-4 h-4 text-red-600" /> : <UserCheck className="w-4 h-4 text-emerald-600" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Password Reset Modal */}
      {pwModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-1">Redefinir palavra-passe</h3>
            <p className="text-sm text-slate-500 mb-5">
              Definir nova palavra-passe para <strong>{pwModal.full_name || pwModal.email}</strong>
            </p>
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="Nova palavra-passe (min. 6)"
              minLength={6}
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-3"
            />
            <input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="Confirmar palavra-passe"
              minLength={6}
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-3"
            />
            {pwError && (
              <p className="text-sm text-red-600 mb-3">{pwError}</p>
            )}
            <p className="text-xs text-slate-400 mb-5">
              O utilizador será solicitado a alterar esta palavra-passe no próximo login.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setPwModal(null); setNewPw(''); setConfirmPw(''); setPwError(''); }}
                disabled={pwLoading}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-700 font-semibold hover:bg-slate-50 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={submitPasswordReset}
                disabled={pwLoading}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition disabled:opacity-50"
              >
                {pwLoading ? 'A guardar...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PIN Modal */}
      {pinModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-1">Definir PIN</h3>
            <p className="text-sm text-slate-500 mb-5">
              Definir PIN de 4 dígitos para <strong>{pinModal.full_name || pinModal.email}</strong>
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="4 dígitos"
              className="w-full px-4 py-3 border border-slate-300 rounded-xl text-center text-2xl tracking-[0.5em] font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-3"
            />
            {pinError && (
              <p className="text-sm text-red-600 mb-3">{pinError}</p>
            )}
            <p className="text-xs text-slate-400 mb-5">
              O utilizador utilizará este PIN para entrar no tablet. A palavra-passe de email não é alterada.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setPinModal(null); setNewPin(''); setPinError(''); }}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-700 font-semibold hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={savePin}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition"
              >
                Guardar PIN
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
