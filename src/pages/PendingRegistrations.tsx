import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { UserCheck, UserX, Clock, CheckCircle2, XCircle, Building2, Briefcase, Shield, Search, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { LEVELS } from '../lib/access';

interface Unit { id: string; name: string }
interface Department { id: string; name: string }

interface Request {
  id: string;
  profile_id: string;
  full_name: string;
  email: string;
  unit_id: string | null;
  department_id: string | null;
  rejection_reason: string | null;
  reviewed_at: string | null;
  requested_at: string;
  status: 'pending' | 'approved' | 'rejected';
  units: { name: string } | null;
  departments: { name: string } | null;
}

type FilterStatus = 'pending' | 'approved' | 'rejected' | 'all';

export default function PendingRegistrations() {
  const { profile: authProfile } = useAuth();
  const [requests, setRequests] = useState<Request[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>('pending');
  const [search, setSearch] = useState('');

  const [approvingReq, setApprovingReq] = useState<Request | null>(null);
  const [approveUnitId, setApproveUnitId] = useState('');
  const [approveDeptId, setApproveDeptId] = useState('');
  const [approveLevel, setApproveLevel] = useState('colaborador');
  const [approving, setApproving] = useState(false);

  const [rejectingReq, setRejectingReq] = useState<Request | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [reqRes, unitsRes, deptsRes] = await Promise.all([
        supabase
          .from('registration_requests')
          .select('*, units(name), departments(name)')
          .order('requested_at', { ascending: false }),
        supabase.from('units').select('id, name').order('name'),
        supabase.from('departments').select('id, name').eq('active', true).order('name'),
      ]);
      if (reqRes.data) setRequests(reqRes.data as Request[]);
      if (unitsRes.data) setUnits(unitsRes.data);
      if (deptsRes.data) setDepartments(deptsRes.data);
    } finally {
      setLoading(false);
    }
  };

  const openApprove = (req: Request) => {
    setApprovingReq(req);
    setApproveUnitId(req.unit_id || '');
    setApproveDeptId(req.department_id || '');
    setApproveLevel('colaborador');
  };

  const handleApprove = async () => {
    if (!approvingReq || !authProfile) return;
    setApproving(true);
    try {
      const { error: upErr } = await supabase.from('profiles').update({
        active: true,
        account_status: 'active',
        unit_id: approveUnitId || null,
        department_id: approveDeptId || null,
        access_level: approveLevel,
        updated_at: new Date().toISOString(),
      }).eq('id', approvingReq.profile_id);
      if (upErr) { alert('Erro ao aprovar: ' + upErr.message); return; }

      await supabase.from('registration_requests').update({
        reviewed_by: authProfile.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: null,
        status: 'approved',
      }).eq('id', approvingReq.id);

      await supabase.from('audit_logs').insert({
        user_id: authProfile.id,
        action: 'approve_registration',
        entity: 'profiles',
        entity_id: approvingReq.profile_id,
      });

      setApprovingReq(null);
      loadAll();
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!rejectingReq || !authProfile) return;
    setRejecting(true);
    try {
      await supabase.from('profiles').update({
        active: false,
        account_status: 'rejected',
        updated_at: new Date().toISOString(),
      }).eq('id', rejectingReq.profile_id);

      await supabase.from('registration_requests').update({
        reviewed_by: authProfile.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: rejectReason.trim() || null,
        status: 'rejected',
      }).eq('id', rejectingReq.id);

      await supabase.from('audit_logs').insert({
        user_id: authProfile.id,
        action: 'reject_registration',
        entity: 'profiles',
        entity_id: rejectingReq.profile_id,
      });

      setRejectingReq(null);
      setRejectReason('');
      loadAll();
    } finally {
      setRejecting(false);
    }
  };

  const filtered = requests.filter((r) => {
    const status = r.status;
    if (filter !== 'all' && status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.full_name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q);
    }
    return true;
  });

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  if (authProfile?.role !== 'Admin') {
    return <div className="p-6 text-center text-slate-500">Apenas administradores podem gerir registos.</div>;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            Pedidos de Registo
            {pendingCount > 0 && (
              <span className="inline-flex items-center justify-center w-6 h-6 bg-red-500 text-white text-xs font-bold rounded-full">
                {pendingCount}
              </span>
            )}
          </h1>
          <p className="text-slate-500 mt-1 text-sm">Aprovar ou rejeitar novos pedidos de acesso</p>
        </div>
        <button onClick={loadAll} className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 transition">
          <RefreshCw className="w-4 h-4 text-slate-600" />
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Pesquisar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition ${
                filter === s ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {s === 'pending' ? 'Pendentes' : s === 'approved' ? 'Aprovados' : s === 'rejected' ? 'Rejeitados' : 'Todos'}
              {s === 'pending' && pendingCount > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Clock className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500 font-medium">
            {filter === 'pending' ? 'Nenhum pedido pendente' : 'Sem resultados'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((req) => {
            const status = req.status;
            return (
              <div key={req.id} className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      status === 'pending' ? 'bg-amber-100' : status === 'approved' ? 'bg-emerald-100' : 'bg-red-100'
                    }`}>
                      {status === 'pending' && <Clock className="w-5 h-5 text-amber-600" />}
                      {status === 'approved' && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                      {status === 'rejected' && <XCircle className="w-5 h-5 text-red-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-800">{req.full_name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          status === 'pending' ? 'bg-amber-100 text-amber-700' :
                          status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {status === 'pending' ? 'Pendente' : status === 'approved' ? 'Aprovado' : 'Rejeitado'}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 mt-0.5">{req.email}</p>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        {req.units?.name && (
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <Building2 className="w-3.5 h-3.5" />{req.units.name}
                          </span>
                        )}
                        {req.departments?.name && (
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <Briefcase className="w-3.5 h-3.5" />{req.departments.name}
                          </span>
                        )}
                        <span className="text-xs text-slate-400">
                          {format(new Date(req.requested_at), 'dd/MM/yyyy HH:mm')}
                        </span>
                      </div>
                      {status === 'rejected' && req.rejection_reason && (
                        <p className="text-xs text-red-600 mt-1.5 bg-red-50 rounded-lg px-3 py-1.5">
                          Motivo: {req.rejection_reason}
                        </p>
                      )}
                    </div>
                  </div>

                  {status === 'pending' && (
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => openApprove(req)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition"
                      >
                        <UserCheck className="w-4 h-4" />
                        Aprovar
                      </button>
                      <button
                        onClick={() => { setRejectingReq(req); setRejectReason(''); }}
                        className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition"
                      >
                        <UserX className="w-4 h-4" />
                        Rejeitar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Approve modal */}
      {approvingReq && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                <UserCheck className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Aprovar Registo</h3>
                <p className="text-sm text-slate-500">{approvingReq.full_name} · {approvingReq.email}</p>
              </div>
            </div>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Unidade</label>
                <select
                  value={approveUnitId}
                  onChange={(e) => setApproveUnitId(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Sem unidade</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Equipa</label>
                <select
                  value={approveDeptId}
                  onChange={(e) => setApproveDeptId(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Sem equipa</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5">
                  <Shield className="w-4 h-4 text-slate-400" />
                  Nível
                </label>
                <select
                  value={approveLevel}
                  onChange={(e) => setApproveLevel(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setApprovingReq(null)}
                className="flex-1 py-3 border border-slate-200 rounded-xl text-slate-700 font-semibold hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleApprove}
                disabled={approving}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition disabled:opacity-50"
              >
                {approving ? 'A aprovar...' : 'Confirmar Aprovação'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectingReq && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <UserX className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Rejeitar Registo</h3>
                <p className="text-sm text-slate-500">{rejectingReq.full_name}</p>
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Motivo de rejeição <span className="text-slate-400 font-normal">(opcional)</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Indicar o motivo..."
                className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setRejectingReq(null)}
                className="flex-1 py-3 border border-slate-200 rounded-xl text-slate-700 font-semibold hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleReject}
                disabled={rejecting}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition disabled:opacity-50"
              >
                {rejecting ? 'A rejeitar...' : 'Confirmar Rejeição'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
