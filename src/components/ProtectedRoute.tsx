import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Clock, XCircle } from 'lucide-react';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">A carregar...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    // guardar o destino (ex.: /scanner?code=… vindo de um QR) para voltar lá depois do login
    if (location.pathname !== '/' && location.pathname !== '/login') {
      try { sessionStorage.setItem('bn_after_login', location.pathname + location.search); } catch { /* */ }
    }
    return <Navigate to="/login" replace />;
  }

  let afterLogin: string | null = null;
  try { afterLogin = sessionStorage.getItem('bn_after_login'); } catch { /* */ }
  if (afterLogin && location.pathname === '/') {
    try { sessionStorage.removeItem('bn_after_login'); } catch { /* */ }
    return <Navigate to={afterLogin} replace />;
  }

  const accountStatus = (profile as any)?.account_status;

  if (accountStatus === 'pending_approval') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Conta pendente de aprovação</h2>
          <p className="text-slate-500 text-sm leading-relaxed mb-6">
            O seu pedido de acesso foi recebido e está a ser analisado por um administrador. Será notificado quando a sua conta for ativada.
          </p>
          <button
            onClick={() => signOut()}
            className="w-full py-3 border border-slate-200 rounded-xl text-slate-700 font-semibold hover:bg-slate-50 transition"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  if (accountStatus === 'rejected') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Acesso rejeitado</h2>
          <p className="text-slate-500 text-sm leading-relaxed mb-6">
            O seu pedido de acesso foi rejeitado. Contacte o administrador para mais informações.
          </p>
          <button
            onClick={() => signOut()}
            className="w-full py-3 border border-slate-200 rounded-xl text-slate-700 font-semibold hover:bg-slate-50 transition"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  if (profile && !profile.active) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-slate-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Conta desativada</h2>
          <p className="text-slate-500 text-sm leading-relaxed mb-6">
            A sua conta está desativada. Contacte um administrador.
          </p>
          <button
            onClick={() => signOut()}
            className="w-full py-3 border border-slate-200 rounded-xl text-slate-700 font-semibold hover:bg-slate-50 transition"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  if (profile?.password_reset_required && location.pathname !== '/password-reset') {
    return <Navigate to="/password-reset" replace />;
  }

  if (!profile?.password_reset_required && location.pathname === '/password-reset') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
