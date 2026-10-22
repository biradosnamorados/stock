import { useState, useEffect, useRef, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  AlertCircle, CheckCircle2, ChevronDown, User, Delete, ChevronLeft,
} from 'lucide-react';

type View = 'login' | 'forgot' | 'pin';

interface LoginUser {
  id: string;
  full_name: string | null;
  username: string | null;
  email: string;
  unit_id: string | null;
  has_pin: boolean;
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500',
  'bg-cyan-500', 'bg-orange-500', 'bg-teal-500', 'bg-sky-500',
];
const avatarColor = (id: string) => AVATAR_COLORS[id.charCodeAt(0) % AVATAR_COLORS.length];
const initials = (u: LoginUser) => {
  const name = u.full_name || u.username || u.email;
  return name.split(' ').slice(0, 2).map(n => n[0]?.toUpperCase()).join('');
};

export default function Login() {
  const [view, setView] = useState<View>('login');

  // Login fields
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Forgot
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  // User dropdown
  const [users, setUsers] = useState<LoginUser[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [query, setQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // PIN
  const [pinUser, setPinUser] = useState<LoginUser | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  const { signIn } = useAuth(); // used for email/password login only
  const navigate = useNavigate();

  // Load users from public view
  useEffect(() => {
    supabase
      .from('login_users')
      .select('id, full_name, username, email, unit_id, has_pin')
      .eq('active', true)
      .order('full_name')
      .then(({ data }) => {
        if (data) setUsers(data as LoginUser[]);
      });
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  const filtered = users.filter(u =>
    !query ||
    (u.full_name || '').toLowerCase().includes(query.toLowerCase()) ||
    (u.username || '').toLowerCase().includes(query.toLowerCase()) ||
    u.email.toLowerCase().includes(query.toLowerCase())
  );

  const selectUser = (u: LoginUser) => {
    setIdentifier(u.username || u.email);
    setQuery('');
    setShowDropdown(false);
    if (u.has_pin) {
      setPinUser(u);
      setPin('');
      setPinError('');
      setView('pin');
    }
  };

  // ── Email/password login ──────────────────────────────────────────────────

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      let email = identifier.trim();
      if (!isEmail(email)) {
        const { data, error: rpcErr } = await supabase.rpc('get_email_by_username', { p_username: email });
        if (rpcErr) throw new Error('Erro ao verificar utilizador');
        if (!data) throw new Error('Utilizador ou palavra-passe incorretos');
        email = data as string;
      }
      const { error: signInErr } = await signIn(email, password);
      if (signInErr) throw new Error('Utilizador ou palavra-passe incorretos');
      navigate('/');
    } catch (err: any) {
      setLoginError(err.message || 'Erro ao iniciar sessão');
      setLoginLoading(false);
    }
  };

  // ── PIN login ─────────────────────────────────────────────────────────────

  const appendDigit = (d: string) => {
    if (pinLoading) return;
    setPin(prev => (prev.length >= 4 ? prev : prev + d));
  };

  const deleteDigit = () => setPin(prev => prev.slice(0, -1));

  useEffect(() => {
    if (pin.length === 4 && pinUser) submitPin();
  }, [pin]);

  const submitPin = async () => {
    if (!pinUser || pin.length < 4) return;
    setPinLoading(true);
    setPinError('');
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
        body: JSON.stringify({ user_id: pinUser.id, pin }),
      });

      const body = await res.json();

      if (!res.ok) {
        setPinError(body.error || 'PIN incorreto. Tente novamente.');
        setPin('');
        return;
      }

      const { error: sessionErr } = await supabase.auth.setSession({
        access_token: body.access_token,
        refresh_token: body.refresh_token,
      });

      if (sessionErr) {
        setPinError('Erro ao iniciar sessão. Tente novamente.');
        setPin('');
        return;
      }

      navigate('/');
    } catch {
      setPinError('Erro inesperado. Tente novamente.');
      setPin('');
    } finally {
      setPinLoading(false);
    }
  };

  // ── Forgot password ───────────────────────────────────────────────────────

  const handleForgot = async (e: FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    try {
      await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: `${window.location.origin}/update-password`,
      });
      setForgotSent(true);
    } catch {
      setForgotSent(true);
    } finally {
      setForgotLoading(false);
    }
  };

  // ── PIN view ──────────────────────────────────────────────────────────────

  if (view === 'pin' && pinUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-6">
        <div className="w-full max-w-xs">
          <button
            onClick={() => { setView('login'); setPin(''); setPinError(''); }}
            className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition mb-8"
          >
            <ChevronLeft className="w-4 h-4" />
            Voltar
          </button>

          <div className="flex flex-col items-center mb-8">
            <div className={`w-20 h-20 ${avatarColor(pinUser.id)} rounded-2xl flex items-center justify-center text-3xl font-bold text-white mb-3`}>
              {initials(pinUser)}
            </div>
            <h2 className="text-xl font-bold text-white">
              {pinUser.full_name?.split(' ')[0] || pinUser.email.split('@')[0]}
            </h2>
            <p className="text-slate-400 text-sm mt-1">Introduza o seu PIN</p>
          </div>

          {/* PIN dots */}
          <div className="flex justify-center gap-4 mb-6">
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                  i < pin.length ? 'bg-white border-white scale-110' : 'border-slate-500 bg-transparent'
                }`}
              />
            ))}
          </div>

          {pinError && (
            <div className="bg-red-900/50 border border-red-700 rounded-xl px-4 py-3 text-sm text-red-300 text-center mb-5">
              {pinError}
            </div>
          )}

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {['1','2','3','4','5','6','7','8','9','','0','del'].map((key, i) => {
              if (key === '') return <div key={i} />;
              if (key === 'del') return (
                <button key="del" onClick={deleteDigit} disabled={pinLoading}
                  className="bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white rounded-2xl h-16 flex items-center justify-center transition active:scale-95 disabled:opacity-50">
                  <Delete className="w-5 h-5" />
                </button>
              );
              return (
                <button key={key} onClick={() => appendDigit(key)} disabled={pinLoading || pin.length >= 4}
                  className="bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white text-2xl font-semibold rounded-2xl h-16 flex items-center justify-center transition active:scale-95 disabled:opacity-50">
                  {pinLoading && pin.length === 4 ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                  ) : key}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => { setView('login'); setPinUser(null); setPin(''); setPinError(''); }}
            className="w-full text-center text-slate-500 hover:text-slate-300 text-sm transition"
          >
            Entrar com palavra-passe
          </button>
        </div>
      </div>
    );
  }

  // ── Main login / forgot ───────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="px-8 pt-8 pb-4 flex flex-col items-center">
            <img
              src="/logo.png"
              alt="Bira dos Namorados"
              className="h-16 w-16 object-contain mb-3"
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
            <h1 className="text-2xl font-bold text-slate-800">Bira dos Namorados</h1>
            <p className="text-slate-500 text-sm mt-1">Gestão de Stock</p>
          </div>

          <div className="p-8">
            {view === 'login' && (
              <form onSubmit={handleLogin} className="space-y-5">
                {loginError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{loginError}</span>
                  </div>
                )}

                {/* User selector */}
                <div ref={dropdownRef} className="relative">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Utilizador
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={identifier}
                      onChange={e => { setIdentifier(e.target.value); setQuery(e.target.value); setShowDropdown(true); }}
                      onFocus={() => { setQuery(''); setShowDropdown(true); }}
                      required
                      autoComplete="off"
                      className="w-full px-4 py-3 pr-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-base"
                      placeholder="Selecionar ou escrever..."
                    />
                    <button type="button" tabIndex={-1}
                      onClick={() => setShowDropdown(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <ChevronDown className={`w-5 h-5 transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  {showDropdown && filtered.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                      {filtered.map(u => (
                        <button
                          key={u.id}
                          type="button"
                          onMouseDown={() => selectUser(u)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-blue-50 transition"
                        >
                          <span className={`w-8 h-8 rounded-full ${avatarColor(u.id)} flex items-center justify-center flex-shrink-0 text-white text-xs font-bold`}>
                            {initials(u)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{u.full_name || u.username || u.email}</p>
                            {u.username && (
                              <p className="text-xs text-slate-400">@{u.username}</p>
                            )}
                          </div>
                          {u.has_pin && (
                            <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-full flex-shrink-0">PIN</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-medium text-slate-700">Palavra-passe</label>
                    <button type="button"
                      onClick={() => { setView('forgot'); setForgotEmail(isEmail(identifier) ? identifier : ''); setForgotSent(false); }}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium transition">
                      Esqueceu?
                    </button>
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-base"
                    placeholder="••••••••"
                  />
                </div>

                <button type="submit" disabled={loginLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl transition disabled:opacity-50">
                  {loginLoading ? 'A entrar...' : 'Entrar'}
                </button>

                <div className="relative flex items-center gap-3 py-1">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-xs text-slate-400">ou</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                <Link to="/register"
                  className="w-full flex items-center justify-center py-3 px-4 rounded-xl border-2 border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-700 font-semibold transition text-base">
                  Criar conta
                </Link>
              </form>
            )}

            {view === 'forgot' && (
              <div>
                <button type="button" onClick={() => setView('login')}
                  className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-5 transition">
                  <ChevronLeft className="w-4 h-4" />
                  Voltar ao login
                </button>

                {forgotSent ? (
                  <div className="text-center">
                    <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800 mb-2">Email enviado</h2>
                    <p className="text-slate-500 text-sm leading-relaxed">
                      Se o email existir, será enviado um link de recuperação.
                    </p>
                    <button type="button" onClick={() => setView('login')}
                      className="mt-6 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition">
                      Voltar ao login
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleForgot} className="space-y-5">
                    <div>
                      <h2 className="text-xl font-bold text-slate-800 mb-1">Recuperar palavra-passe</h2>
                      <p className="text-sm text-slate-500">Introduza o seu email para receber um link de recuperação.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                      <input type="email" value={forgotEmail}
                        onChange={e => setForgotEmail(e.target.value)}
                        required autoFocus
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-base"
                        placeholder="seu@email.com" />
                    </div>
                    <button type="submit" disabled={forgotLoading}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl transition disabled:opacity-50">
                      {forgotLoading ? 'A enviar...' : 'Enviar link de recuperação'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-slate-400 text-xs mt-6">
          Gestão de Stock · Bira dos Namorados v1.0
        </p>
      </div>
    </div>
  );
}
