import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface Unit {
  id: string;
  name: string;
}

interface Department {
  id: string;
  name: string;
}

interface ModulePermissions {
  [moduleCode: string]: {
    [actionCode: string]: boolean;
  };
}

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  unit_id: string | null;
  department_id: string | null;
  role: 'Admin' | 'Staff' | 'Chefe';
  active: boolean;
  password_reset_required: boolean;
  account_status: 'active' | 'pending_approval' | 'rejected';
  access_profile_id: string | null;
  access_level?: 'colaborador' | 'responsavel' | 'gerente' | 'admin' | null;
  has_pin: boolean;
  units?: Unit | null;
  departments?: Department | null;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  permissions: ModulePermissions;
  showInactivityPrompt: boolean;
  hasPermission: (moduleCode: string, actionCode?: string) => boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  renewSession: () => void;
}

const INACTIVITY_MS = 30 * 60 * 1000; // 30 minutes

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<ModulePermissions>({});
  const [showInactivityPrompt, setShowInactivityPrompt] = useState(false);

  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset inactivity timer on any user interaction
  const resetTimer = () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    if (!user) return;
    inactivityTimer.current = setTimeout(() => {
      setShowInactivityPrompt(true);
    }, INACTIVITY_MS);
  };

  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, resetTimer));
  }, [user]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      (async () => {
        if (error) {
          console.error('Session error:', error);
          setSession(null);
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }

        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await loadProfile(session.user.id);
          resetTimer();
        }
        setLoading(false);
      })();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        if (event === 'TOKEN_REFRESHED') {
          setSession(session);
          return;
        }

        if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setProfile(null);
          if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
          return;
        }

        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await loadProfile(session.user.id);
          resetTimer();
        } else {
          setProfile(null);
        }
      })();
    });

    return () => {
      subscription.unsubscribe();
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, []);

  const loadProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, units(id, name), departments(id, name)')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('Erro ao carregar perfil:', error);
        if (error.message.includes('JWT') || error.message.includes('token')) {
          await supabase.auth.signOut();
        }
        return;
      }

      setProfile(data);

      if (data) {
        await loadPermissions(data.id, data.role, data.access_profile_id);
      }
    } catch (err) {
      console.error('Erro inesperado ao carregar perfil:', err);
    }
  };

  // Áreas a que a pessoa tem acesso (grelha Equipa × Nível + exceções), calculadas na base de dados.
  // Mantém o formato antigo { modulo: { view: true } } para hasPermission(modulo, 'view').
  const loadPermissions = async (_userId: string, _role: string, _accessProfileId: string | null) => {
    try {
      const { data, error } = await supabase.rpc('my_modules');
      if (error) throw error;
      const permMap: ModulePermissions = {};
      ((data as string[]) ?? []).forEach((code) => {
        permMap[code] = { view: true, create: true, update: true, delete: true, export: true, import: true };
      });
      setPermissions(permMap);
    } catch (error) {
      console.error('Error loading permissions:', error);
      setPermissions({});
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
    setPermissions({});
    setShowInactivityPrompt(false);
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
  };

  const renewSession = async () => {
    await supabase.auth.refreshSession();
    setShowInactivityPrompt(false);
    resetTimer();
  };

  const hasPermission = (moduleCode: string, actionCode = 'view'): boolean => {
    if (profile?.role === 'Admin') return true;
    return permissions[moduleCode]?.[actionCode] || false;
  };

  return (
    <AuthContext.Provider value={{
      user, profile, session, loading, permissions,
      showInactivityPrompt, hasPermission, signIn, signOut, renewSession,
    }}>
      {children}
      {/* Inactivity prompt */}
      {showInactivityPrompt && profile && (
        <InactivityPrompt
          userName={profile.full_name?.split(' ')[0] || profile.email.split('@')[0]}
          onRenew={renewSession}
          onSwitch={async () => {
            await signOut();
            // Navigate to PIN login if device unit is set
            const deviceUnit = localStorage.getItem('bn_device_unit_id');
            window.location.href = deviceUnit ? '/pin-login' : '/login';
          }}
        />
      )}
    </AuthContext.Provider>
  );
}

function InactivityPrompt({ userName, onRenew, onSwitch }: {
  userName: string;
  onRenew: () => void;
  onSwitch: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-slate-900/80 flex items-center justify-center z-[999] p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center">
        <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-1">{userName}, ainda é você?</h2>
        <p className="text-slate-500 text-sm mb-6">A sessão foi interrompida por inatividade.</p>
        <div className="flex flex-col gap-3">
          <button
            onClick={onRenew}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-2xl text-base transition active:scale-95"
          >
            Sim, continuar
          </button>
          <button
            onClick={onSwitch}
            className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-2xl text-base transition active:scale-95"
          >
            Trocar utilizador
          </button>
        </div>
      </div>
    </div>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
