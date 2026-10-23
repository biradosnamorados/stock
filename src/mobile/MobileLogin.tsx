// Entrar na app: ecrã escuro, lembra-se de quem usou o telemóvel, PIN com teclado grande e Face ID.
// O PIN fica guardado no Keychain do iPhone (protegido pelo Face ID) — nunca em texto no aparelho.
import { useEffect, useMemo, useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';
import { Delete, ScanFace, ChevronLeft, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface LoginUser { id: string; full_name: string | null; username: string | null; email: string; has_pin: boolean }
interface Remembered { id: string; name: string; username: string | null; email: string; has_pin: boolean; faceid?: boolean }

const KEY = 'bn_app_user';
const SERVER = 'pt.biradosnamorados.gestao';
const readRemembered = (): Remembered | null => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
const saveRemembered = (r: Remembered | null) => { try { r ? localStorage.setItem(KEY, JSON.stringify(r)) : localStorage.removeItem(KEY); } catch { /* */ } };
const initials = (name: string) => name.split(' ').slice(0, 2).map((n) => n[0]?.toUpperCase()).join('');
const firstName = (r: { name?: string; full_name?: string | null; email: string }) => ((r.name ?? r.full_name) || r.email.split('@')[0]).split(' ')[0];

async function faceIdAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try { return (await NativeBiometric.isAvailable()).isAvailable; } catch { return false; }
}

type View = 'pin' | 'pick' | 'password';

export default function MobileLogin() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [me, setMe] = useState<Remembered | null>(readRemembered);
  const [view, setView] = useState<View>(() => { const r = readRemembered(); return r ? (r.has_pin ? 'pin' : 'password') : 'pick'; });
  const [users, setUsers] = useState<LoginUser[]>([]);
  const [q, setQ] = useState('');
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [canFace, setCanFace] = useState(false);
  const [offerFace, setOfferFace] = useState<string | null>(null); // PIN à espera de "usar Face ID?"

  useEffect(() => { faceIdAvailable().then(setCanFace); }, []);
  useEffect(() => {
    supabase.from('login_users').select('id, full_name, username, email, has_pin').eq('active', true).order('full_name')
      .then(({ data }) => data && setUsers(data as LoginUser[]));
  }, []);

  // Face ID logo ao abrir, se já estiver ativo para esta pessoa
  useEffect(() => {
    if (view === 'pin' && me?.faceid && canFace) faceLogin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, me?.id, canFace]);

  const done = () => navigate('/', { replace: true });

  async function pinLogin(user: Remembered, code: string): Promise<boolean> {
    setBusy(true); setError('');
    try {
      const url = import.meta.env.VITE_SUPABASE_URL;
      const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${url}/functions/v1/pin-authenticate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anon}`, Apikey: anon },
        body: JSON.stringify({ user_id: user.id, pin: code }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error || 'PIN incorreto. Tente outra vez.'); setPin(''); return false; }
      const { error: e } = await supabase.auth.setSession({ access_token: body.access_token, refresh_token: body.refresh_token });
      if (e) { setError('Não foi possível entrar. Tente outra vez.'); setPin(''); return false; }
      return true;
    } catch {
      setError('Sem ligação. Verifique a internet.'); setPin(''); return false;
    } finally { setBusy(false); }
  }

  async function submitPin(code: string) {
    if (!me) return;
    const ok = await pinLogin(me, code);
    if (!ok) return;
    if (canFace && !me.faceid) { setOfferFace(code); return; }
    if (me.faceid) { try { await NativeBiometric.setCredentials({ username: me.id, password: code, server: SERVER }); } catch { /* */ } }
    done();
  }

  async function faceLogin() {
    if (!me) return;
    try {
      await NativeBiometric.verifyIdentity({ reason: 'Entrar na Bira Gestão', title: 'Entrar', useFallback: false });
      const cred = await NativeBiometric.getCredentials({ server: SERVER });
      if (cred.username !== me.id || !cred.password) throw new Error('outra pessoa');
      if (await pinLogin(me, cred.password)) done();
    } catch {
      /* cancelado ou sem credenciais: fica o teclado */
    }
  }

  async function answerFace(yes: boolean) {
    const code = offerFace; setOfferFace(null);
    if (me && code) {
      if (yes) {
        try {
          await NativeBiometric.verifyIdentity({ reason: 'Ativar o Face ID para entrar', title: 'Face ID' });
          await NativeBiometric.setCredentials({ username: me.id, password: code, server: SERVER });
          const r = { ...me, faceid: true }; saveRemembered(r); setMe(r);
        } catch { /* fica sem Face ID */ }
      } else { const r = { ...me, faceid: false }; saveRemembered(r); }
    }
    done();
  }

  useEffect(() => { if (pin.length === 4) submitPin(pin); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pin]);

  function choose(u: LoginUser) {
    const r: Remembered = { id: u.id, name: u.full_name || u.username || u.email, username: u.username, email: u.email, has_pin: u.has_pin };
    if (me?.id !== u.id) { NativeBiometric.deleteCredentials({ server: SERVER }).catch(() => {}); }
    saveRemembered(r); setMe(r); setPin(''); setPassword(''); setError('');
    setView(u.has_pin ? 'pin' : 'password');
  }

  async function passwordLogin(e: FormEvent) {
    e.preventDefault();
    if (!me) return;
    setBusy(true); setError('');
    const { error: err } = await signIn(me.email, password);
    setBusy(false);
    if (err) { setError('Palavra-passe incorreta.'); return; }
    done();
  }

  const filtered = useMemo(() => users.filter((u) => !q.trim() || `${u.full_name ?? ''} ${u.username ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())), [users, q]);
  const shell = 'min-h-screen bg-[#14171a] text-[#F3EEE3] flex flex-col';
  const pad = { paddingTop: 'calc(env(safe-area-inset-top) + 16px)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)', fontFamily: "'Nunito', system-ui, sans-serif" };

  // ── escolher quem é ──
  if (view === 'pick' || !me) {
    return (
      <div className={shell} style={pad}>
        <div className="px-6 pt-6 pb-4 flex flex-col items-center gap-3">
          <img src="/app-icon.png" alt="" className="w-16 h-16 rounded-2xl" />
          <h1 className="text-2xl font-extrabold">Quem está a entrar?</h1>
          <p className="text-[#A8A396] text-sm text-center">Escolha o seu nome. Da próxima vez só pede o PIN.</p>
        </div>
        <div className="px-5">
          <label className="flex items-center gap-2 h-12 px-3 rounded-xl bg-[#22262a]">
            <Search className="w-5 h-5 text-[#A8A396]" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar" className="flex-1 bg-transparent outline-none text-base" aria-label="Procurar pessoa" />
          </label>
        </div>
        <ul className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-2">
          {filtered.map((u) => (
            <li key={u.id}>
              <button onClick={() => choose(u)} className="w-full flex items-center gap-3 h-16 px-3 rounded-2xl bg-[#1c2024] active:bg-[#2a2f34] text-left">
                <span className="w-11 h-11 rounded-full bg-[#015939] flex items-center justify-center font-extrabold">{initials(u.full_name || u.email)}</span>
                <span className="flex-1 min-w-0"><span className="block font-extrabold truncate">{u.full_name || u.username || u.email}</span>
                  {!u.has_pin && <span className="block text-xs text-[#A8A396]">entra com palavra-passe</span>}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // ── palavra-passe ──
  if (view === 'password') {
    return (
      <div className={shell} style={pad}>
        <button onClick={() => setView(me.has_pin ? 'pin' : 'pick')} className="self-start flex items-center gap-1 h-12 px-4 text-[#A8A396] font-bold"><ChevronLeft className="w-5 h-5" /> Voltar</button>
        <form onSubmit={passwordLogin} className="flex-1 px-6 pt-6 flex flex-col gap-5">
          <div className="flex flex-col items-center gap-3">
            <span className="w-20 h-20 rounded-full bg-[#015939] flex items-center justify-center text-3xl font-extrabold">{initials(me.name)}</span>
            <h1 className="text-2xl font-extrabold">Olá, {firstName(me)}</h1>
          </div>
          <label className="flex flex-col gap-2">
            <span className="font-bold text-[#A8A396]">Palavra-passe</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password"
              className="h-14 px-4 rounded-xl bg-[#22262a] text-lg outline-none focus:ring-2 focus:ring-[#FED420]" />
          </label>
          {error && <p role="alert" className="text-[#FF8A8F] font-bold text-center">{error}</p>}
          <button disabled={busy || !password} className="h-14 rounded-2xl bg-[#FED420] text-[#14171a] text-[17px] font-extrabold disabled:opacity-50">{busy ? 'A entrar…' : 'Entrar'}</button>
          <button type="button" onClick={() => setView('pick')} className="text-[#A8A396] font-bold py-2">Não é {firstName(me)}? Trocar de pessoa</button>
        </form>
      </div>
    );
  }

  // ── PIN ──
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'face', '0', 'del'];
  return (
    <div className={shell} style={pad}>
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
        <span className="w-20 h-20 rounded-full bg-[#015939] flex items-center justify-center text-3xl font-extrabold">{initials(me.name)}</span>
        <h1 className="text-2xl font-extrabold">Olá, {firstName(me)}</h1>
        <p className="text-[#A8A396]">{busy ? 'A entrar…' : 'Introduza o seu PIN'}</p>
        <div className="flex gap-5 my-2" aria-label={`${pin.length} de 4 dígitos`}>
          {[0, 1, 2, 3].map((i) => <span key={i} className={`w-4 h-4 rounded-full border-2 ${i < pin.length ? 'bg-[#FED420] border-[#FED420]' : 'border-[#5B635E]'}`} />)}
        </div>
        <p role="alert" className="h-6 text-[#FF8A8F] font-bold text-center">{error}</p>
      </div>

      <div className="grid grid-cols-3 gap-x-6 gap-y-4 px-10 pb-4 max-w-sm w-full mx-auto">
        {keys.map((k) => {
          if (k === 'face') {
            return me.faceid && canFace
              ? <button key={k} onClick={faceLogin} aria-label="Entrar com Face ID" className="h-[72px] rounded-full flex items-center justify-center text-[#F3EEE3] active:bg-[#2a2f34]"><ScanFace className="w-9 h-9" /></button>
              : <span key={k} />;
          }
          if (k === 'del') {
            return <button key={k} onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Apagar" className="h-[72px] rounded-full flex items-center justify-center active:bg-[#2a2f34]"><Delete className="w-7 h-7" /></button>;
          }
          return (
            <button key={k} disabled={busy} onClick={() => { setError(''); setPin((p) => (p.length >= 4 ? p : p + k)); }}
              className="h-[72px] rounded-full bg-[#22262a] active:bg-[#353b41] text-[28px] font-bold disabled:opacity-50">{k}</button>
          );
        })}
      </div>
      <div className="flex justify-between px-8 pt-2">
        <button onClick={() => setView('pick')} className="text-[#A8A396] font-bold py-2">Trocar de pessoa</button>
        <button onClick={() => { setError(''); setView('password'); }} className="text-[#A8A396] font-bold py-2">Usar palavra-passe</button>
      </div>

      {offerFace && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end">
          <div className="w-full bg-[#1c2024] rounded-t-3xl p-6 flex flex-col gap-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
            <ScanFace className="w-12 h-12 text-[#FED420] self-center" />
            <h2 className="text-xl font-extrabold text-center">Entrar com Face ID?</h2>
            <p className="text-[#A8A396] text-center">Da próxima vez basta olhar para o telemóvel. Pode desligar quando quiser em Mais.</p>
            <button onClick={() => answerFace(true)} className="h-14 rounded-2xl bg-[#FED420] text-[#14171a] text-[17px] font-extrabold">Usar Face ID</button>
            <button onClick={() => answerFace(false)} className="h-12 font-bold text-[#A8A396]">Agora não</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Em "Mais": desligar o Face ID neste telemóvel. */
export async function disableFaceId() {
  try { await NativeBiometric.deleteCredentials({ server: SERVER }); } catch { /* */ }
  const r = readRemembered(); if (r) saveRemembered({ ...r, faceid: false });
}
export const faceIdEnabled = () => !!readRemembered()?.faceid;
