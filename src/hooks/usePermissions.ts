import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface ModulePermission {
  module_code: string;
  module_name: string;
  action_code: string;
  action_name: string;
  granted: boolean;
}

interface PermissionMap {
  [moduleCode: string]: {
    [actionCode: string]: boolean;
  };
}

export function usePermissions() {
  const { profile } = useAuth();
  const [permissions, setPermissions] = useState<PermissionMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile) {
      loadPermissions();
    }
  }, [profile?.id]);

  const loadPermissions = async () => {
    if (!profile?.id) return;

    try {
      if (profile.role === 'Admin') {
        const { data: modules } = await supabase
          .from('system_modules')
          .select('code')
          .eq('active', true);

        const { data: actions } = await supabase
          .from('module_actions')
          .select('code');

        const adminPermissions: PermissionMap = {};
        modules?.forEach((module) => {
          adminPermissions[module.code] = {};
          actions?.forEach((action) => {
            adminPermissions[module.code][action.code] = true;
          });
        });

        setPermissions(adminPermissions);
      } else {
        const { data } = await supabase.rpc('get_complete_user_permissions', {
          p_user_id: profile.id,
        });

        const permMap: PermissionMap = {};
        (data as ModulePermission[])?.forEach((perm) => {
          if (!permMap[perm.module_code]) {
            permMap[perm.module_code] = {};
          }
          permMap[perm.module_code][perm.action_code] = perm.granted;
        });

        setPermissions(permMap);
      }
    } catch (error) {
      console.error('Error loading permissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const hasPermission = (moduleCode: string, actionCode: string): boolean => {
    if (profile?.role === 'Admin') return true;
    return permissions[moduleCode]?.[actionCode] || false;
  };

  const canView = (moduleCode: string): boolean => {
    return hasPermission(moduleCode, 'view');
  };

  const canCreate = (moduleCode: string): boolean => {
    return hasPermission(moduleCode, 'create');
  };

  const canUpdate = (moduleCode: string): boolean => {
    return hasPermission(moduleCode, 'update');
  };

  const canDelete = (moduleCode: string): boolean => {
    return hasPermission(moduleCode, 'delete');
  };

  const canExport = (moduleCode: string): boolean => {
    return hasPermission(moduleCode, 'export');
  };

  const canImport = (moduleCode: string): boolean => {
    return hasPermission(moduleCode, 'import');
  };

  return {
    permissions,
    loading,
    hasPermission,
    canView,
    canCreate,
    canUpdate,
    canDelete,
    canExport,
    canImport,
  };
}
