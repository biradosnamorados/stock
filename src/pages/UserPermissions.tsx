import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Shield, Save, RefreshCw, Check, X } from 'lucide-react';

interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  units: {
    name: string;
  } | null;
}

interface SystemModule {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

interface ModuleAction {
  id: string;
  code: string;
  name: string;
}

interface UserPermission {
  module_id: string;
  action_id: string;
  granted: boolean;
}

export default function UserPermissions() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [modules, setModules] = useState<SystemModule[]>([]);
  const [actions, setActions] = useState<ModuleAction[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<{ [key: string]: boolean }>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedUser) {
      loadUserPermissions(selectedUser.id);
    }
  }, [selectedUser]);

  const loadData = async () => {
    try {
      const [usersRes, modulesRes, actionsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, email, full_name, role, units(name)')
          .neq('role', 'Admin')
          .order('full_name'),
        supabase
          .from('system_modules')
          .select('*')
          .eq('active', true)
          .order('display_order'),
        supabase
          .from('module_actions')
          .select('*')
          .order('code'),
      ]);

      if (usersRes.data) setUsers(usersRes.data as User[]);
      if (modulesRes.data) setModules(modulesRes.data);
      if (actionsRes.data) setActions(actionsRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserPermissions = async (userId: string) => {
    try {
      const { data } = await supabase
        .from('user_module_permissions')
        .select('module_id, action_id, granted')
        .eq('user_id', userId);

      const permMap: { [key: string]: boolean } = {};
      data?.forEach((perm: UserPermission) => {
        const key = `${perm.module_id}_${perm.action_id}`;
        permMap[key] = perm.granted;
      });

      setPermissions(permMap);
    } catch (error) {
      console.error('Error loading user permissions:', error);
    }
  };

  const togglePermission = (moduleId: string, actionId: string) => {
    const key = `${moduleId}_${actionId}`;
    setPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const hasPermission = (moduleId: string, actionId: string): boolean => {
    const key = `${moduleId}_${actionId}`;
    return permissions[key] || false;
  };

  const savePermissions = async () => {
    if (!selectedUser) return;

    setSaving(true);
    try {
      await supabase
        .from('user_module_permissions')
        .delete()
        .eq('user_id', selectedUser.id);

      const permissionsToInsert = [];
      for (const module of modules) {
        for (const action of actions) {
          const key = `${module.id}_${action.id}`;
          if (permissions[key]) {
            permissionsToInsert.push({
              user_id: selectedUser.id,
              module_id: module.id,
              action_id: action.id,
              granted: true,
              granted_by: profile?.id,
            });
          }
        }
      }

      if (permissionsToInsert.length > 0) {
        const { error } = await supabase
          .from('user_module_permissions')
          .insert(permissionsToInsert);

        if (error) throw error;
      }

      await supabase.from('audit_logs').insert({
        user_id: profile?.id,
        action: 'update_user_permissions',
        entity: 'user_module_permissions',
        entity_id: selectedUser.id,
        changes: { permissions_count: permissionsToInsert.length },
      });

      alert('Permissões guardadas com sucesso!');
    } catch (error: any) {
      console.error('Error saving permissions:', error);
      alert('Erro ao guardar permissões: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const grantAllForModule = (moduleId: string) => {
    const newPermissions = { ...permissions };
    actions.forEach((action) => {
      const key = `${moduleId}_${action.id}`;
      newPermissions[key] = true;
    });
    setPermissions(newPermissions);
  };

  const revokeAllForModule = (moduleId: string) => {
    const newPermissions = { ...permissions };
    actions.forEach((action) => {
      const key = `${moduleId}_${action.id}`;
      newPermissions[key] = false;
    });
    setPermissions(newPermissions);
  };

  if (profile?.role !== 'Admin') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Shield className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600">Não tem permissão para aceder a esta página</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">A carregar...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800">Gestão de Permissões</h1>
        <p className="text-slate-600 mt-2">Configure o acesso dos utilizadores aos módulos do sistema</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200">
              <h2 className="font-semibold text-slate-800">Utilizadores</h2>
            </div>
            <div className="divide-y divide-slate-200 max-h-[600px] overflow-y-auto">
              {users.map((user) => (
                <button
                  key={user.id}
                  onClick={() => setSelectedUser(user)}
                  className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition ${
                    selectedUser?.id === user.id ? 'bg-blue-50 border-l-4 border-blue-600' : ''
                  }`}
                >
                  <p className="font-medium text-slate-800">{user.full_name || user.email}</p>
                  <p className="text-sm text-slate-500">{user.role}</p>
                  {user.units && (
                    <p className="text-xs text-slate-400 mt-1">{user.units.name}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {selectedUser ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-slate-800">
                    Permissões: {selectedUser.full_name || selectedUser.email}
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    {selectedUser.role} - {selectedUser.units?.name}
                  </p>
                </div>
                <button
                  onClick={savePermissions}
                  disabled={saving}
                  className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>A guardar...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Guardar</span>
                    </>
                  )}
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[600px] overflow-y-auto">
                {modules.map((module) => (
                  <div key={module.id} className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="bg-slate-50 px-4 py-3 flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-slate-800">{module.name}</h3>
                        {module.description && (
                          <p className="text-sm text-slate-500">{module.description}</p>
                        )}
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => grantAllForModule(module.id)}
                          className="text-xs text-green-600 hover:text-green-700 px-2 py-1 border border-green-600 rounded hover:bg-green-50 transition"
                        >
                          Todas
                        </button>
                        <button
                          onClick={() => revokeAllForModule(module.id)}
                          className="text-xs text-red-600 hover:text-red-700 px-2 py-1 border border-red-600 rounded hover:bg-red-50 transition"
                        >
                          Nenhuma
                        </button>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {actions.map((action) => {
                          const granted = hasPermission(module.id, action.id);
                          return (
                            <button
                              key={action.id}
                              onClick={() => togglePermission(module.id, action.id)}
                              className={`flex items-center justify-between px-3 py-2 rounded-lg border-2 transition ${
                                granted
                                  ? 'border-green-500 bg-green-50 text-green-700'
                                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              <span className="text-sm font-medium">{action.name}</span>
                              {granted ? (
                                <Check className="w-4 h-4" />
                              ) : (
                                <X className="w-4 h-4 text-slate-300" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
              <Shield className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">Selecione um utilizador para gerir as suas permissões</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
