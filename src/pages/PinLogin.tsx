import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Delete, Settings, ChevronLeft } from 'lucide-react';

interface StaffUser {
  id: string;
  full_name: string | null;
  email: string;
  department_id: string | null;
  unit_id: string | null;
  pin_hash: string | null;
  departments?: { name: string } | null;
}

interface Unit {
  id: string;
  name: string;
}

type Screen = 'select_unit' | 'user_grid' | 'pin_entry';

// Simple hash — SHA-256 hex of the 4-digit PIN string
async function hashPin(pin: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const DEVICE_UNIT_KEY = 'bn_device_unit_id';
const DEVICE_UNIT_NAME_KEY = 'bn_device_unit_name';

export default function PinLogin() {
  const navigate = useNavigate();

  const [screen, setScreen] = useState<Screen>(() => {
    const stored = localStorage.getItem(DEVICE_UNIT_KEY);
    return stored ? 'user_grid' : 'select_unit';
  });

  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(() => {
    const id = localStorage.getItem(DEVICE_UNIT_KEY);
    const name = localStorage.getItem(DEVICE_UNIT_NAME_KEY);
    return id && name ? { id, name } : null;
  });

  const [users, setUsers] = useState<StaffUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<StaffUser | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Load units on mount
  useEffect(() => {
    supabase.from('units').select('id, name').order('name').then(({ data }) => setUnits(data || []));
  }, []);

  // Load users when unit is selected
  useEffect(() => {
    if (!selectedUnit) return;
    setLoadingUsers(true);
    supabase
      .from('profiles')
      .select('id, full_name, email, department_id, unit_id, pin_hash, departments(name)')
      .eq('unit_id', selectedUnit.id)
      .eq('active', true)
      .order('full_name')
      .then(({ data }) => {
        setUsers((data as StaffUser[]) || []);
        setLoadingUsers(false);
      });
  }, [selectedUnit]);

  const selectUnit = (unit: Unit) => {
    setSelectedUnit(unit);
    localStorage.setItem(DEVICE_UNIT_KEY, unit.id);
    localStorage.setItem(DEVICE_UNIT_NAME_KEY, unit.name);
    setScreen('user_grid');
  };

  const selectUser = (user: StaffUser) => {
    setSelectedUser(user);
    setPin('');
    setError(null);
    setScreen('pin_entry');
  };

  const appendDigit = useCallback((d: string) => {
    setPin((prev) => {
      if (prev.length >= 4) return prev;
      return prev + d;
    });
  }, []);

  const deleteDigit = useCallback(() => {
    setPin((prev) => prev.slice(0, -1));
  }, []);

  // Auto-submit when 4 digits entered
  useEffect(() => {
    if (pin.length === 4 && selectedUser) {
      handlePinSubmit(pin, selectedUser);
    }
  }, [pin, selectedUser]);

  const handlePinSubmit = async (currentPin: string, user: StaffUser) => {
    if (currentPin.length < 4) return;
    setLoading(true);
    setError(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const res = await fetch(`${supabaseUrl}/functions/v1/pin-authenticate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
          'Apikey': anonKey,
        },
        body: JSON.stringify({ user_id: user.id, pin: currentPin }),
      });

      const body = await res.json();

      if (!res.ok) {
        setError(body.error || 'PIN incorreto. Tente novamente.');
        setPin('');
        setLoading(false);
        return;
      }

      const { access_token, refresh_token } = body;
      const { error: sessionErr } = await supabase.auth.setSession({ access_token, refresh_token });

      if (sessionErr) {
        setError('Erro ao iniciar sessão. Tente novamente.');
        setPin('');
        setLoading(false);
        return;
      }

      navigate('/');
    } catch (err: any) {
      setError('Erro inesperado. Tente novamente.');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const changeUnit = () => {
    localStorage.removeItem(DEVICE_UNIT_KEY);
    localStorage.removeItem(DEVICE_UNIT_NAME_KEY);
    setSelectedUnit(null);
    setUsers([]);
    setScreen('select_unit');
  };

  const initials = (user: StaffUser) => {
    const name = user.full_name || user.email;
    return name.split(' ').slice(0, 2).map((n) => n[0]?.toUpperCase()).join('');
  };

  const AVATAR_COLORS = [
    'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500',
    'bg-cyan-500', 'bg-violet-500', 'bg-orange-500', 'bg-teal-500',
  ];
  const avatarColor = (id: string) => AVATAR_COLORS[id.charCodeAt(0) % AVATAR_COLORS.length];

  // ── Unit selection ──────────────────────────────────────────────────────
  if (screen === 'select_unit') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <img src="/logo.png" alt="Bira dos Namorados" className="h-14 mx-auto mb-4 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
            <h1 className="text-3xl font-bold text-white">Bira dos Namorados</h1>
            <p className="text-slate-400 mt-2">Selecione a unidade deste dispositivo</p>
          </div>

          <div className="space-y-3">
            {units.map((unit) => (
              <button
                key={unit.id}
                onClick={() => selectUnit(unit)}
                className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-500 text-white rounded-2xl px-6 py-5 text-left transition active:scale-[0.98] group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold">{unit.name}</span>
                  <ChevronLeft className="w-5 h-5 text-slate-500 rotate-180 group-hover:text-white transition" />
                </div>
              </button>
            ))}
          </div>

          <p className="text-center text-slate-500 text-xs mt-8">
            A unidade será guardada neste dispositivo
          </p>
        </div>
      </div>
    );
  }

  // ── User grid ────────────────────────────────────────────────────────────
  if (screen === 'user_grid') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-8 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Quem é você?</h1>
            <p className="text-slate-400 text-sm mt-0.5">{selectedUnit?.name}</p>
          </div>
          <button
            onClick={changeUnit}
            className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition p-2 rounded-xl hover:bg-slate-800"
          >
            <Settings className="w-4 h-4" />
            Mudar unidade
          </button>
        </div>

        {/* User grid */}
        <div className="flex-1 overflow-y-auto px-6 pb-8">
          {loadingUsers ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <p className="text-lg">Nenhum utilizador encontrado</p>
              <p className="text-sm mt-2">Configure utilizadores para esta unidade no painel de administração.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mt-4">
              {users.map((user) => (
                <button
                  key={user.id}
                  onClick={() => selectUser(user)}
                  className="bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-500 rounded-2xl p-5 flex flex-col items-center gap-3 transition active:scale-[0.97] group"
                >
                  <div className={`w-16 h-16 ${avatarColor(user.id)} rounded-2xl flex items-center justify-center text-2xl font-bold text-white`}>
                    {initials(user)}
                  </div>
                  <div className="text-center">
                    <p className="text-white font-semibold text-sm leading-tight">
                      {user.full_name?.split(' ')[0] || user.email.split('@')[0]}
                    </p>
                    {user.departments?.name && (
                      <p className="text-slate-400 text-xs mt-0.5">{user.departments.name}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Email login fallback */}
        <div className="text-center pb-6">
          <button
            onClick={() => navigate('/login')}
            className="text-slate-500 hover:text-slate-300 text-sm transition"
          >
            Entrar com email e palavra-passe
          </button>
        </div>
      </div>
    );
  }

  // ── PIN entry ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-xs">
        {/* Back button */}
        <button
          onClick={() => { setScreen('user_grid'); setSelectedUser(null); setPin(''); setError(null); }}
          className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition mb-8"
        >
          <ChevronLeft className="w-4 h-4" />
          Voltar
        </button>

        {/* User avatar */}
        <div className="flex flex-col items-center mb-8">
          <div className={`w-20 h-20 ${avatarColor(selectedUser!.id)} rounded-2xl flex items-center justify-center text-3xl font-bold text-white mb-3`}>
            {initials(selectedUser!)}
          </div>
          <h2 className="text-xl font-bold text-white">
            {selectedUser!.full_name?.split(' ')[0] || selectedUser!.email.split('@')[0]}
          </h2>
          {selectedUser!.departments?.name && (
            <p className="text-slate-400 text-sm mt-0.5">{selectedUser!.departments.name}</p>
          )}
        </div>

        {/* PIN dots */}
        <div className="flex justify-center gap-4 mb-8">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                i < pin.length
                  ? 'bg-white border-white scale-110'
                  : 'border-slate-600 bg-transparent'
              }`}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded-xl px-4 py-3 text-sm text-red-300 text-center mb-5">
            {error}
          </div>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3">
          {['1','2','3','4','5','6','7','8','9','','0','del'].map((key) => {
            if (key === '') return <div key="empty" />;
            if (key === 'del') {
              return (
                <button
                  key="del"
                  onClick={deleteDigit}
                  disabled={loading}
                  className="bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white rounded-2xl h-16 flex items-center justify-center transition active:scale-95 disabled:opacity-50"
                >
                  <Delete className="w-5 h-5" />
                </button>
              );
            }
            return (
              <button
                key={key}
                onClick={() => appendDigit(key)}
                disabled={loading || pin.length >= 4}
                className="bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white text-2xl font-semibold rounded-2xl h-16 flex items-center justify-center transition active:scale-95 disabled:opacity-50"
              >
                {loading && pin.length === 4 && key === pin[3] ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                ) : key}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
