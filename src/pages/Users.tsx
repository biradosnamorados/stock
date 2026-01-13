import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { UserPlus, Edit2, Trash2, Shield, User, X } from 'lucide-react';

interface Store {
  id: string;
  name: string;
  code: string;
}

interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'store_user';
  store_id: string | null;
  created_at: string;
}

interface ProfileWithStore extends Profile {
  store?: Store;
}

export default function Users() {
  const [profiles, setProfiles] = useState<ProfileWithStore[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ProfileWithStore | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'store_user' as 'admin' | 'store_user',
    store_id: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      const [profilesResult, storesResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('*, stores:store_id(id, name, code)')
          .order('created_at', { ascending: false }),
        supabase.from('stores').select('*').order('name'),
      ]);

      if (profilesResult.error) throw profilesResult.error;
      if (storesResult.error) throw storesResult.error;

      const profilesWithStores = profilesResult.data.map((p: any) => ({
        ...p,
        store: p.stores,
      }));

      setProfiles(profilesWithStores);
      setStores(storesResult.data);
    } catch (error: any) {
      alert('Erro ao carregar dados: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const openModal = (profile?: ProfileWithStore) => {
    if (profile) {
      setEditingProfile(profile);
      setFormData({
        email: profile.email,
        password: '',
        full_name: profile.full_name,
        role: profile.role,
        store_id: profile.store_id || '',
      });
    } else {
      setEditingProfile(null);
      setFormData({
        email: '',
        password: '',
        full_name: '',
        role: 'store_user',
        store_id: '',
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingProfile(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.email || !formData.full_name || !formData.role) {
      alert('Preencha todos os campos obrigatórios');
      return;
    }

    if (formData.role === 'store_user' && !formData.store_id) {
      alert('Utilizadores de loja precisam ter uma loja associada');
      return;
    }

    if (!editingProfile && !formData.password) {
      alert('A senha é obrigatória para novos utilizadores');
      return;
    }

    try {
      if (editingProfile) {
        const { error } = await supabase
          .from('profiles')
          .update({
            full_name: formData.full_name,
            role: formData.role,
            store_id: formData.role === 'admin' ? null : formData.store_id || null,
          })
          .eq('id', editingProfile.id);

        if (error) throw error;
        alert('Utilizador atualizado com sucesso!');
      } else {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          throw new Error('Não autenticado');
        }

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: formData.email,
              password: formData.password,
              full_name: formData.full_name,
              role: formData.role,
              store_id: formData.role === 'admin' ? null : formData.store_id,
            }),
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Erro ao criar utilizador');
        }

        alert('Utilizador criado com sucesso!');
      }

      closeModal();
      loadData();
    } catch (error: any) {
      alert('Erro: ' + error.message);
    }
  };

  const handleDelete = async (profile: ProfileWithStore) => {
    if (!confirm(`Tem certeza que deseja eliminar o utilizador ${profile.full_name}?`)) {
      return;
    }

    try {
      const { error } = await supabase.auth.admin.deleteUser(profile.id);

      if (error) throw error;

      alert('Utilizador eliminado com sucesso!');
      loadData();
    } catch (error: any) {
      alert('Erro ao eliminar utilizador: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-[#F20519] to-[#048ABF] rounded-xl animate-pulse mx-auto mb-4" />
          <p className="text-slate-600">A carregar...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Utilizadores</h1>
          <p className="text-slate-600 mt-1">Gestão de utilizadores do sistema</p>
        </div>
        <button
          onClick={() => openModal()}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#F20519] to-[#048ABF] text-white rounded-lg hover:shadow-lg transition"
        >
          <UserPlus className="w-5 h-5" />
          Novo Utilizador
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Nome
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Função
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Loja
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {profiles.map((profile) => (
                <tr key={profile.id} className="hover:bg-slate-50 transition">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          profile.role === 'admin'
                            ? 'bg-gradient-to-br from-[#F20519] to-[#048ABF]'
                            : 'bg-slate-200'
                        }`}
                      >
                        {profile.role === 'admin' ? (
                          <Shield className="w-5 h-5 text-white" />
                        ) : (
                          <User className="w-5 h-5 text-slate-600" />
                        )}
                      </div>
                      <span className="font-medium text-slate-800">{profile.full_name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-600">
                    {profile.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
                        profile.role === 'admin'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {profile.role === 'admin' ? 'Administrador' : 'Utilizador'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-600">
                    {profile.store?.name || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openModal(profile)}
                        className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(profile)}
                        className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-bold text-slate-800">
                {editingProfile ? 'Editar Utilizador' : 'Novo Utilizador'}
              </h2>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#048ABF] focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#048ABF] focus:border-transparent"
                  required
                  disabled={!!editingProfile}
                />
              </div>

              {!editingProfile && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Senha *
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#048ABF] focus:border-transparent"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Função *
                </label>
                <select
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({ ...formData, role: e.target.value as 'admin' | 'store_user' })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#048ABF] focus:border-transparent"
                  required
                >
                  <option value="store_user">Utilizador</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              {formData.role === 'store_user' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Loja *
                  </label>
                  <select
                    value={formData.store_id}
                    onChange={(e) => setFormData({ ...formData, store_id: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#048ABF] focus:border-transparent"
                    required
                  >
                    <option value="">Selecione uma loja</option>
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-[#F20519] to-[#048ABF] text-white rounded-lg hover:shadow-lg transition"
                >
                  {editingProfile ? 'Atualizar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
