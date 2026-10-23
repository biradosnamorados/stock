import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { QrCode, ClipboardList, CheckSquare, Package, ShoppingCart, Truck, AlertTriangle, ChevronRight, Calendar, Megaphone, Activity, RefreshCw, X, Plus, Trash2, CreditCard as Edit2, Check, ShieldCheck, Clock } from 'lucide-react';
import { format, formatDistanceToNow, isToday, parseISO, startOfDay } from 'date-fns';
import { pt } from 'date-fns/locale';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OverdueSummary {
  haccpOverdue: number;
  mandatoryOverdue: number;
}

interface PendingTaskItem {
  id: string;
  name: string;
  type: 'haccp' | 'mandatory';
  totalFields: number;
  filledFields: number;
  status: 'pending' | 'in_progress';
}

interface ExpiringItem {
  id: string;
  product: string;
  batch: string;
  expiry_date: string;
  quantity: number | null;
  daysLeft: number;
}

interface PendingOrder {
  id: string;
  order_number: string;
  status: string;
  from_unit: string;
  to_unit: string;
  role: 'sender' | 'receiver';
}

interface PendingPurchaseOrder {
  id: string;
  order_number: string;
  status: string;
  supplier: string;
  expected_delivery_date: string | null;
}

interface Notice {
  id: string;
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  start_date: string;
  end_date: string;
  target_unit_id: string | null;
  target_department_id: string | null;
}

interface ActivityItem {
  id: string;
  type: 'haccp' | 'mandatory';
  description: string;
  timestamp: string;
}

interface NoticeForm {
  title: string;
  message: string;
  target_unit_id: string;
  target_department_id: string;
  start_date: string;
  end_date: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const priorityConfig = {
  urgent: { label: 'Urgente',  bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-200',    dot: 'bg-red-500' },
  high:   { label: 'Alta',     bg: 'bg-orange-100',  text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
  medium: { label: 'Média',    bg: 'bg-amber-100',   text: 'text-amber-700',  border: 'border-amber-200',  dot: 'bg-amber-500' },
  low:    { label: 'Baixa',    bg: 'bg-blue-50',     text: 'text-blue-700',   border: 'border-blue-200',   dot: 'bg-blue-400' },
};

const statusLabel: Record<string, string> = {
  pending:     'Pendente',
  preparing:   'Em preparação',
  shipped:     'Enviado',
  received:    'Recebido',
  scheduled:   'Agendado',
  in_progress: 'Em curso',
  completed:   'Concluído',
  reviewed:    'Revisto',
};

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function expiryBadge(days: number) {
  if (days < 0)  return { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Expirado' };
  if (days === 0) return { bg: 'bg-red-100',   text: 'text-red-700',    label: 'Hoje' };
  if (days <= 2)  return { bg: 'bg-red-100',   text: 'text-red-700',    label: `${days}d` };
  if (days <= 5)  return { bg: 'bg-orange-100', text: 'text-orange-700', label: `${days}d` };
  return               { bg: 'bg-amber-100',  text: 'text-amber-700',  label: `${days}d` };
}

// ─── Shared card wrapper ───────────────────────────────────────────────────────

function SectionCard({ title, icon: Icon, count, urgent, children, onNavigate }: {
  title: string;
  icon: React.ElementType;
  count?: number;
  urgent?: boolean;
  children: React.ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border ${urgent ? 'border-red-200' : 'border-slate-200'} overflow-hidden`}>
      <div className={`flex items-center justify-between px-5 py-4 border-b ${urgent ? 'bg-red-50 border-red-100' : 'border-slate-100'}`}>
        <div className="flex items-center gap-2">
          <Icon className={`w-5 h-5 ${urgent ? 'text-red-600' : 'text-slate-600'}`} />
          <h2 className={`font-semibold text-base ${urgent ? 'text-red-800' : 'text-slate-800'}`}>{title}</h2>
          {count !== undefined && count > 0 && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${urgent ? 'bg-red-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {count}
            </span>
          )}
        </div>
        {onNavigate && (
          <button onClick={onNavigate} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
            Ver tudo <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="divide-y divide-slate-50">{children}</div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="px-5 py-6 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
      <Check className="w-4 h-4 text-green-500" />
      {message}
    </div>
  );
}

// ─── Admin Notice Manager ─────────────────────────────────────────────────────

function NoticeManager({ onSaved }: { onSaved: () => void }) {
  const { profile } = useAuth();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Notice | null>(null);

  const today = new Date().toISOString().split('T')[0];
  const emptyForm: NoticeForm = {
    title: '', message: '', target_unit_id: '', target_department_id: '',
    start_date: today, end_date: today, priority: 'medium',
  };
  const [form, setForm] = useState<NoticeForm>(emptyForm);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    const [{ data: n }, { data: u }, { data: d }] = await Promise.all([
      supabase.from('dashboard_notices').select('*').order('created_at', { ascending: false }),
      supabase.from('units').select('id, name').order('name'),
      supabase.from('departments').select('id, name').order('name'),
    ]);
    setNotices((n as Notice[]) || []);
    setUnits(u || []);
    setDepartments(d || []);
  };

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (n: Notice) => {
    setEditing(n);
    setForm({
      title: n.title, message: n.message,
      target_unit_id: n.target_unit_id || '',
      target_department_id: n.target_department_id || '',
      start_date: n.start_date, end_date: n.end_date, priority: n.priority,
    });
    setShowForm(true);
  };

  const save = async () => {
    const payload = {
      title: form.title, message: form.message,
      target_unit_id: form.target_unit_id || null,
      target_department_id: form.target_department_id || null,
      start_date: form.start_date, end_date: form.end_date,
      priority: form.priority, created_by: profile!.id,
    };
    if (editing) {
      await supabase.from('dashboard_notices').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('dashboard_notices').insert(payload);
    }
    setShowForm(false);
    loadAll();
    onSaved();
  };

  const remove = async (id: string) => {
    await supabase.from('dashboard_notices').delete().eq('id', id);
    loadAll();
    onSaved();
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-slate-600" />
          <h2 className="font-semibold text-base text-slate-800">Gerir Avisos</h2>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-1 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition font-medium">
          <Plus className="w-3.5 h-3.5" /> Novo aviso
        </button>
      </div>

      {showForm && (
        <div className="p-5 bg-slate-50 border-b border-slate-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Título</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Mensagem</label>
              <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                rows={3} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Unidade (opcional)</label>
              <select value={form.target_unit_id} onChange={e => setForm(f => ({ ...f, target_unit_id: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Todas as unidades</option>
                {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Departamento (opcional)</label>
              <select value={form.target_department_id} onChange={e => setForm(f => ({ ...f, target_department_id: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Todos os departamentos</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Data início</label>
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Data fim</label>
              <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Prioridade</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as NoticeForm['priority'] }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={save} disabled={!form.title || !form.message || !form.end_date}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-40">
              {editing ? 'Guardar alterações' : 'Criar aviso'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-100 transition">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="divide-y divide-slate-50">
        {notices.length === 0 && <EmptyState message="Sem avisos criados" />}
        {notices.map(n => {
          const cfg = priorityConfig[n.priority];
          return (
            <div key={n.id} className="px-5 py-4 flex items-start gap-3">
              <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium text-sm text-slate-800">{n.title}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                </div>
                <p className="text-xs text-slate-500 truncate">{n.message}</p>
                <p className="text-xs text-slate-400 mt-0.5">{n.start_date} → {n.end_date}</p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => openEdit(n)} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
                  <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                </button>
                <button onClick={() => remove(n.id)} className="p-1.5 rounded-lg hover:bg-red-50 transition">
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const isAdmin = profile?.role === 'Admin';

  const [overdue, setOverdue] = useState<OverdueSummary>({ haccpOverdue: 0, mandatoryOverdue: 0 });
  const [pendingTaskItems, setPendingTaskItems] = useState<PendingTaskItem[]>([]);
  const [expiring, setExpiring] = useState<ExpiringItem[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [pendingPurchaseOrders, setPendingPurchaseOrders] = useState<PendingPurchaseOrder[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [dismissedNotices, setDismissedNotices] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('bn_dismissed_notices') || '[]')); }
    catch { return new Set(); }
  });

  const dismissNotice = (id: string) => {
    const next = new Set([...dismissedNotices, id]);
    setDismissedNotices(next);
    localStorage.setItem('bn_dismissed_notices', JSON.stringify([...next]));
  };

  const loadData = useCallback(async () => {
    if (!profile?.unit_id) { setLoading(false); return; }
    setLoading(true);
    try {
      const todayStart = startOfDay(new Date()).toISOString();
      const today = new Date().toISOString().split('T')[0];
      const tenDays = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const [
        haccpTasksRes,
        haccpDoneRes,
        mandCategoriesRes,
        mandTasksRes,
        mandDoneRes,
        expiringRes,
        ordersRes,
        purchaseOrdersRes,
        noticesRes,
        haccpActivityRes,
        mandActivityRes,
      ] = await Promise.all([
        // HACCP tasks active for this unit (with name and input count)
        supabase.from('haccp_tasks').select('id, name, frequency, scheduled_days, haccp_task_inputs(id)')
          .eq('active', true)
          .or(`unit_id.eq.${profile.unit_id},unit_id.is.null`),

        // HACCP sessions today for this unit (all statuses to detect in_progress)
        supabase.from('haccp_task_sessions').select('task_id, status, filled_fields')
          .eq('session_date', today)
          .eq('unit_id', profile.unit_id),

        // Mandatory categories for this unit (with name)
        supabase.from('mandatory_task_categories').select('id, name')
          .eq('active', true)
          .or(`unit_ids.eq.{},unit_ids.is.null,unit_ids.cs.{${profile.unit_id}}`),

        // Mandatory tasks linked to those categories (with name)
        supabase.from('mandatory_tasks').select('id, name, category_id')
          .eq('active', true),

        // Mandatory tasks done today by this user
        supabase.from('mandatory_task_logs').select('task_id')
          .gte('completed_at', todayStart)
          .eq('performed_by', profile.id),

        // Expiring goods receipt lines
        supabase.from('goods_receipt_lines')
          .select('id, batch_code, expiry_date, qty_received, products(name), goods_receipts!inner(unit_id)')
          .eq('goods_receipts.unit_id', profile.unit_id)
          .not('expiry_date', 'is', null)
          .gte('expiry_date', today)
          .lte('expiry_date', tenDays)
          .order('expiry_date'),

        // Pending internal orders for this unit
        supabase.from('internal_orders')
          .select('id, order_number, status, from_unit_id, to_unit_id, from_unit:units!from_unit_id(name), to_unit:units!to_unit_id(name)')
          .or(`from_unit_id.eq.${profile.unit_id},to_unit_id.eq.${profile.unit_id}`)
          .in('status', ['pending', 'preparing', 'shipped'])
          .order('created_at', { ascending: false })
          .limit(10),

        // Pending purchase orders for this unit
        supabase.from('purchase_orders')
          .select('id, order_number, status, expected_delivery_date, suppliers(name)')
          .eq('unit_id', profile.unit_id)
          .not('status', 'in', '("received","cancelled")')
          .order('created_at', { ascending: false })
          .limit(10),

        // Active notices
        supabase.from('dashboard_notices').select('*')
          .lte('start_date', today)
          .gte('end_date', today)
          .order('priority', { ascending: false }),

        // Recent HACCP activity by user
        supabase.from('haccp_task_logs').select('id, task_name, completed_at')
          .eq('performed_by', profile.id)
          .order('completed_at', { ascending: false })
          .limit(5),

        // Recent mandatory activity by user
        supabase.from('mandatory_task_logs').select('id, task_name, completed_at')
          .eq('performed_by', profile.id)
          .order('completed_at', { ascending: false })
          .limit(5),
      ]);

      // ── Overdue + pending task items ──
      const todayDow = new Date().getDay();
      const haccpSessionMap: Record<string, any> = {};
      (haccpDoneRes.data || []).forEach((s: any) => { haccpSessionMap[s.task_id] = s; });

      const pendingItems: PendingTaskItem[] = [];

      const haccpDueTasks = (haccpTasksRes.data || []).filter((t: any) => {
        if (t.frequency === 'specific_days') {
          if (!Array.isArray(t.scheduled_days) || !t.scheduled_days.includes(todayDow)) return false;
        }
        return true;
      });

      let haccpOverdue = 0;
      haccpDueTasks.forEach((t: any) => {
        const session = haccpSessionMap[t.id];
        const isDone = session && (session.status === 'completed' || session.status === 'non_compliant');
        if (!isDone) {
          haccpOverdue++;
          pendingItems.push({
            id: t.id,
            name: t.name,
            type: 'haccp',
            totalFields: (t.haccp_task_inputs || []).length,
            filledFields: session?.filled_fields ?? 0,
            status: session?.status === 'in_progress' ? 'in_progress' : 'pending',
          });
        }
      });

      const validCatIds = new Set((mandCategoriesRes.data || []).map((c: any) => c.id));
      const mandDoneIds = new Set((mandDoneRes.data || []).map((l: any) => l.task_id));
      const mandatoryOverdue = (mandTasksRes.data || [])
        .filter((t: any) => validCatIds.has(t.category_id) && !mandDoneIds.has(t.id)).length;

      (mandTasksRes.data || [])
        .filter((t: any) => validCatIds.has(t.category_id) && !mandDoneIds.has(t.id))
        .slice(0, 5)
        .forEach((t: any) => {
          pendingItems.push({
            id: t.id,
            name: t.name,
            type: 'mandatory',
            totalFields: 0,
            filledFields: 0,
            status: 'pending',
          });
        });

      setOverdue({ haccpOverdue, mandatoryOverdue });
      setPendingTaskItems(pendingItems.slice(0, 8));

      // ── Expiring items ──
      setExpiring((expiringRes.data || []).map((row: any) => ({
        id: row.id,
        product: (row.products as any)?.name || '—',
        batch: row.batch_code || '—',
        expiry_date: row.expiry_date,
        quantity: row.qty_received,
        daysLeft: daysUntil(row.expiry_date),
      })));

      // ── Pending orders ──
      setPendingOrders((ordersRes.data || []).map((o: any) => ({
        id: o.id,
        order_number: o.order_number,
        status: o.status,
        from_unit: (o.from_unit as any)?.name || '—',
        to_unit: (o.to_unit as any)?.name || '—',
        role: o.from_unit_id === profile.unit_id ? 'sender' : 'receiver',
      })));

      // ── Pending purchase orders ──
      setPendingPurchaseOrders((purchaseOrdersRes.data || []).map((o: any) => ({
        id: o.id,
        order_number: o.order_number,
        status: o.status,
        supplier: (o.suppliers as any)?.name || '—',
        expected_delivery_date: o.expected_delivery_date,
      })));

      // ── Notices (filter by unit/dept) ──
      const filteredNotices: Notice[] = (noticesRes.data || []).filter((n: Notice) => {
        if (n.target_unit_id && n.target_unit_id !== profile.unit_id) return false;
        if (n.target_department_id && profile.department_id && n.target_department_id !== profile.department_id) return false;
        return true;
      });
      setNotices(filteredNotices);

      // ── Activity feed ──
      const acts: ActivityItem[] = [
        ...(haccpActivityRes.data || []).map((l: any) => ({
          id: `h-${l.id}`, type: 'haccp' as const,
          description: `HACCP: ${l.task_name}`, timestamp: l.completed_at,
        })),
        ...(mandActivityRes.data || []).map((l: any) => ({
          id: `m-${l.id}`, type: 'mandatory' as const,
          description: `Tarefa: ${l.task_name}`, timestamp: l.completed_at,
        })),
      ];
      acts.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      setActivity(acts.slice(0, 8));

      setLastRefresh(new Date());
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    if (!authLoading && profile) loadData();
  }, [profile, authLoading, loadData]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">A carregar painel...</p>
        </div>
      </div>
    );
  }

  const totalOverdue = overdue.haccpOverdue + overdue.mandatoryOverdue;
  const visibleNotices = notices.filter(n => !dismissedNotices.has(n.id));

  const quickActions = [
    { label: 'Ler QR',       icon: QrCode,       path: '/scanner',         color: 'bg-blue-600 hover:bg-blue-700 text-white' },
    { label: 'HACCP',        icon: ClipboardList, path: '/haccp',           color: 'bg-teal-600 hover:bg-teal-700 text-white',   badge: overdue.haccpOverdue || undefined },
    { label: 'Tarefas',      icon: CheckSquare,   path: '/mandatory-tasks', color: 'bg-green-600 hover:bg-green-700 text-white',  badge: overdue.mandatoryOverdue || undefined },
    { label: 'Enc. Internas',icon: ShoppingCart,  path: '/internal-orders', color: 'bg-slate-700 hover:bg-slate-800 text-white',  badge: pendingOrders.length || undefined },
    { label: 'Compras',      icon: Package,       path: '/purchases', color: 'bg-amber-600 hover:bg-amber-700 text-white',  badge: pendingPurchaseOrders.length || undefined },
    { label: 'Receber',     icon: Truck,         path: '/purchases?tab=rececoes', color: 'bg-orange-600 hover:bg-orange-700 text-white' },
  ];

  return (
    <div className="min-h-full bg-slate-50">

      {/* Page header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">
              Olá, {profile?.full_name?.split(' ')[0] || profile?.email}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {format(new Date(), "EEEE, d 'de' MMMM", { locale: pt })}
              {profile?.units?.name && (
                <> · <span className="font-medium text-slate-600">{profile.units.name}</span></>
              )}
            </p>
          </div>
          <button onClick={loadData} disabled={loading}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition disabled:opacity-40">
            <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 space-y-5">

        {/* Overdue alert banner */}
        {totalOverdue > 0 && (
          <div className="bg-red-600 text-white rounded-2xl px-5 py-4 flex items-center gap-3 shadow-sm">
            <AlertTriangle className="w-6 h-6 flex-shrink-0" />
            <div>
              <p className="font-bold text-base">
                {totalOverdue === 1 ? '1 tarefa em atraso' : `${totalOverdue} tarefas em atraso`}
              </p>
              <p className="text-red-100 text-sm">
                {[
                  overdue.haccpOverdue     > 0 && `${overdue.haccpOverdue} HACCP`,
                  overdue.mandatoryOverdue > 0 && `${overdue.mandatoryOverdue} obrigatórias`,
                ].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Ações rápidas</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {quickActions.map(action => {
              const Icon = action.icon;
              return (
                <button key={action.path} onClick={() => navigate(action.path)}
                  className={`relative flex flex-col items-center justify-center gap-2 py-5 rounded-2xl ${action.color} transition active:scale-95 shadow-sm`}>
                  {action.badge !== undefined && action.badge > 0 && (
                    <span className="absolute top-2 right-2 min-w-[18px] h-[18px] bg-white text-red-600 text-xs font-bold rounded-full flex items-center justify-center px-1">
                      {action.badge}
                    </span>
                  )}
                  <Icon className="w-6 h-6" />
                  <span className="text-xs font-semibold text-center leading-tight">{action.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Notices */}
        {visibleNotices.length > 0 && (
          <div className="space-y-2">
            {visibleNotices.map(n => {
              const cfg = priorityConfig[n.priority];
              return (
                <div key={n.id} className={`${cfg.bg} border ${cfg.border} rounded-2xl px-5 py-4 flex gap-3`}>
                  <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-white/50 ${cfg.text}`}>{cfg.label}</span>
                      <span className={`font-semibold text-sm ${cfg.text}`}>{n.title}</span>
                    </div>
                    <p className={`text-sm ${cfg.text} opacity-90 leading-snug`}>{n.message}</p>
                  </div>
                  <button onClick={() => dismissNotice(n.id)}
                    className="p-1 rounded-lg hover:bg-black/10 transition flex-shrink-0 self-start">
                    <X className={`w-4 h-4 ${cfg.text}`} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Pending Tasks — operational cards */}
        {totalOverdue > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Para fazer hoje</h2>
                <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{totalOverdue}</span>
              </div>
            </div>
            <div className="space-y-2">
              {pendingTaskItems.map(item => {
                const isHaccp = item.type === 'haccp';
                const pct = item.totalFields > 0 ? Math.round((item.filledFields / item.totalFields) * 100) : 0;
                const isInProgress = item.status === 'in_progress';
                return (
                  <button
                    key={`${item.type}-${item.id}`}
                    onClick={() => navigate(isHaccp ? '/haccp' : '/mandatory-tasks')}
                    className={`w-full text-left rounded-2xl border-2 p-4 flex items-center gap-3 transition active:scale-[0.99] hover:shadow-sm ${
                      isInProgress ? 'bg-blue-50 border-blue-300' : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isHaccp
                        ? isInProgress ? 'bg-blue-100' : 'bg-emerald-100'
                        : isInProgress ? 'bg-blue-100' : 'bg-amber-100'
                    }`}>
                      {isHaccp
                        ? <ShieldCheck className={`w-5 h-5 ${isInProgress ? 'text-blue-600' : 'text-emerald-600'}`} />
                        : <CheckSquare className={`w-5 h-5 ${isInProgress ? 'text-blue-600' : 'text-amber-600'}`} />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm truncate">{item.name}</p>
                      {item.totalFields > 0 ? (
                        <div className="mt-1.5">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-slate-400">
                              {isInProgress ? `${item.filledFields}/${item.totalFields} verificações` : `0/${item.totalFields} verificações`}
                            </span>
                            <span className={`text-xs font-semibold ${isInProgress ? 'text-blue-600' : 'text-slate-400'}`}>
                              {isInProgress ? `${pct}%` : 'Pendente'}
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                            <div
                              className={`h-1 rounded-full ${isInProgress ? 'bg-blue-500' : 'bg-slate-300'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 mt-0.5">
                          {isHaccp ? 'HACCP' : 'Tarefa obrigatória'} · {isInProgress ? 'Em curso' : 'Pendente'}
                        </p>
                      )}
                    </div>
                    <div className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-bold ${
                      isInProgress ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {isInProgress ? 'Continuar' : 'Iniciar'}
                    </div>
                  </button>
                );
              })}
              {/* See all link */}
              {(overdue.haccpOverdue > pendingTaskItems.filter(i => i.type === 'haccp').length ||
                overdue.mandatoryOverdue > pendingTaskItems.filter(i => i.type === 'mandatory').length) && (
                <div className="flex gap-2">
                  {overdue.haccpOverdue > 0 && (
                    <button onClick={() => navigate('/haccp')}
                      className="flex-1 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition flex items-center justify-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                      Ver todos HACCP ({overdue.haccpOverdue})
                    </button>
                  )}
                  {overdue.mandatoryOverdue > 0 && (
                    <button onClick={() => navigate('/mandatory-tasks')}
                      className="flex-1 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition flex items-center justify-center gap-1.5">
                      <CheckSquare className="w-3.5 h-3.5 text-amber-500" />
                      Ver tarefas ({overdue.mandatoryOverdue})
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* All clear state */}
        {totalOverdue === 0 && !loading && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Check className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-emerald-800 text-sm">Tudo em dia!</p>
              <p className="text-xs text-emerald-600">Sem HACCP ou tarefas obrigatórias pendentes.</p>
            </div>
          </div>
        )}

        {/* Two-column grid on large screens */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Expiring Soon */}
          <SectionCard
            title="A Expirar Brevemente"
            icon={Calendar}
            count={expiring.length}
            urgent={expiring.some(e => e.daysLeft <= 2)}
            onNavigate={() => navigate('/stock')}
          >
            {expiring.length === 0
              ? <EmptyState message="Sem produtos a expirar nos próximos 10 dias" />
              : expiring.slice(0, 6).map(item => {
                const badge = expiryBadge(item.daysLeft);
                return (
                  <div key={item.id} className="px-5 py-3.5 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{item.product}</p>
                      <p className="text-xs text-slate-500">Lote: {item.batch}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${badge.bg} ${badge.text}`}>
                        {badge.label}
                      </span>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {format(parseISO(item.expiry_date), 'dd/MM/yy')}
                      </p>
                    </div>
                  </div>
                );
              })}
            {expiring.length > 6 && (
              <button onClick={() => navigate('/stock')}
                className="w-full px-5 py-3 text-xs text-blue-600 font-medium text-center hover:bg-blue-50 transition">
                + {expiring.length - 6} produtos adicionais
              </button>
            )}
          </SectionCard>

          {/* Pending Purchase Orders */}
          <SectionCard
            title="Encomendas a Fornecedores"
            icon={Package}
            count={pendingPurchaseOrders.length}
            onNavigate={() => navigate('/purchases')}
          >
            {pendingPurchaseOrders.length === 0
              ? <EmptyState message="Sem encomendas pendentes a fornecedores" />
              : pendingPurchaseOrders.slice(0, 5).map(o => (
                <button key={o.id} onClick={() => navigate('/purchases')}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition text-left">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">{o.order_number}</p>
                    <p className="text-xs text-slate-500 truncate">{o.supplier}
                      {o.expected_delivery_date && ` · ${format(parseISO(o.expected_delivery_date), 'dd/MM')}`}
                    </p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ml-2 ${
                    o.status === 'sent'     ? 'bg-blue-100 text-blue-700'   :
                    o.status === 'draft'    ? 'bg-slate-100 text-slate-600' :
                    o.status === 'pending'  ? 'bg-amber-100 text-amber-700' :
                                             'bg-green-100 text-green-700'
                  }`}>
                    {statusLabel[o.status] || o.status}
                  </span>
                </button>
              ))}
          </SectionCard>
        </div>

        {/* Pending Internal Orders */}
        <SectionCard
          title="Encomendas Internas Pendentes"
          icon={ShoppingCart}
          count={pendingOrders.length}
          urgent={pendingOrders.some(o => o.status === 'shipped' && o.role === 'receiver')}
          onNavigate={() => navigate('/internal-orders')}
        >
          {pendingOrders.length === 0
            ? <EmptyState message="Sem encomendas pendentes" />
            : pendingOrders.slice(0, 6).map(order => {
              const needsAction =
                (order.status === 'pending'   && order.role === 'sender')   ||
                (order.status === 'preparing' && order.role === 'sender')   ||
                (order.status === 'shipped'   && order.role === 'receiver');

              return (
                <button key={order.id} onClick={() => navigate('/internal-orders')}
                  className={`w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition text-left ${needsAction ? 'border-l-4 border-blue-500 pl-4' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-sm font-medium text-slate-800">{order.order_number}</span>
                      {needsAction && (
                        <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded font-medium">
                          Ação necessária
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate">{order.from_unit} → {order.to_unit}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      order.status === 'pending'   ? 'bg-amber-100 text-amber-700'  :
                      order.status === 'preparing' ? 'bg-blue-100 text-blue-700'   :
                      order.status === 'shipped'   ? 'bg-teal-100 text-teal-700'   :
                                                     'bg-slate-100 text-slate-600'
                    }`}>
                      {statusLabel[order.status] || order.status}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </div>
                </button>
              );
            })}
        </SectionCard>

        {/* Recent Activity */}
        <SectionCard title="Atividade Recente" icon={Activity}>
          {activity.length === 0
            ? <EmptyState message="Sem atividade recente registada" />
            : activity.map(item => (
              <div key={item.id} className="px-5 py-3 flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  item.type === 'haccp' ? 'bg-teal-500' : 'bg-green-500'
                }`} />
                <p className="flex-1 text-sm text-slate-700 truncate">{item.description}</p>
                <span className="text-xs text-slate-400 flex-shrink-0">
                  {isToday(parseISO(item.timestamp))
                    ? format(parseISO(item.timestamp), 'HH:mm')
                    : formatDistanceToNow(parseISO(item.timestamp), { locale: pt, addSuffix: true })}
                </span>
              </div>
            ))}
        </SectionCard>

        {/* Admin: Notice Manager */}
        {isAdmin && <NoticeManager onSaved={loadData} />}

        <p className="text-center text-xs text-slate-400 pb-6">
          Atualizado às {format(lastRefresh, 'HH:mm:ss')}
        </p>
      </div>
    </div>
  );
}
