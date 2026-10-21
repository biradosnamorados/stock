import { useEffect, useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { AlertCircle, CheckCircle2, ChevronLeft, Hash } from 'lucide-react';

interface Unit { id: string; name: string }

async function hashPin(pin: string): Promise<string> {
  const buf = new TextEncoder().encode(pin);
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function Register() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    confirm_password: '',
    pin: '',
    unit_id: '',
  });

  useEffect(() => {
    supabase.from('units').select('id, name').order('name').then(({ data }) => setUnits(data || []));
  }, []);

  const set = (field: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (form.password.length < 6) { setError('A palavra-passe deve ter pelo menos 6 caracteres.'); return; }
    if (form.password !== form.confirm_password) { setError('As palavras-passe não coincidem.'); return; }
    if (form.pin && !/^\d{4}$/.test(form.pin)) { setError('O PIN deve ter exatamente 4 dígitos numéricos.'); return; }
    if (!form.unit_id) { setError('Por favor, selecione a sua unidade.'); return; }

    setLoading(true);

    try {
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
      });

      if (signUpError) throw signUpError;
      if (!authData.user) throw new Error('Falha ao criar utilizador.');

      const userId = authData.user.id;
      const pinHash = form.pin ? await hashPin(form.pin) : null;

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: form.full_name.trim(),
          unit_id: form.unit_id || null,
          pin_hash: pinHash,
          account_status: 'pending_approval',
          active: false,
          role: 'Staff',
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (profileError) throw profileError;

      const { error: reqError } = await supabase.from('registration_requests').insert({
        profile_id: userId,
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        unit_id: form.unit_id || null,
      });

      if (reqError) throw reqError;

      await supabase.auth.signOut();
      setSuccess(true);
    } catch (err: any) {
      if (err.message?.toLowerCase().includes('already registered') || err.message?.toLowerCase().includes('user already registered')) {
        setError('Este email já está registado. Tente entrar com a sua conta.');
      } else {
        setError(err.message || 'Erro ao criar conta. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Pedido enviado!</h2>
            <p className="text-slate-500 leading-relaxed mb-6">
              O seu pedido de acesso foi submetido. Um administrador irá analisar e aprovar a sua conta antes de poder iniciar sessão.
            </p>
            <Link
              to="/login"
              className="inline-flex items-center justify-center w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition"
            >
              Voltar ao login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="px-8 pt-6 pb-4 flex flex-col items-center">
            <img
              src="/logo.png"
              alt="Bira dos Namorados"
              className="h-12 w-12 object-contain mb-3"
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
            <h1 className="text-xl font-bold text-slate-800">Criar Conta</h1>
            <p className="text-slate-500 text-sm mt-0.5">Pedido de acesso</p>
          </div>

          <div className="p-6">
            <Link to="/login" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-5 transition">
              <ChevronLeft className="w-4 h-4" />
              Voltar ao login
            </Link>

            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 mb-5">
              A sua conta ficará pendente de aprovação por um administrador antes de poder aceder à aplicação.
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-start gap-2 mb-5">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={form.full_name}
                  onChange={(e) => set('full_name', e.target.value)}
                  placeholder="O seu nome completo"
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email *</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Palavra-passe *</label>
                  <input
                    type="password"
                    required
                    value={form.password}
                    onChange={(e) => set('password', e.target.value)}
                    placeholder="Mín. 6 caracteres"
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirmar *</label>
                  <input
                    type="password"
                    required
                    value={form.confirm_password}
                    onChange={(e) => set('confirm_password', e.target.value)}
                    placeholder="Repetir"
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5">
                  <Hash className="w-4 h-4 text-slate-400" />
                  PIN de 4 dígitos
                  <span className="text-slate-400 font-normal">(opcional, para tablet)</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={form.pin}
                  onChange={(e) => set('pin', e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="0000"
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base text-center tracking-widest font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Unidade *</label>
                <select
                  required
                  value={form.unit_id}
                  onChange={(e) => set('unit_id', e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
                >
                  <option value="">Selecionar unidade</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3.5 px-4 rounded-xl transition disabled:opacity-50 text-base mt-2"
              >
                {loading ? 'A submeter...' : 'Submeter pedido de acesso'}
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-slate-400 text-xs mt-5">
          Gestão de Stock · Bira dos Namorados
        </p>
      </div>
    </div>
  );
}
