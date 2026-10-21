import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { FileBarChart2, Download, Loader2, AlertCircle } from 'lucide-react';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export default function HaccpReport() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'Admin';

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [unitId, setUnitId] = useState(isAdmin ? '' : (profile?.unit_id || ''));
  const [departmentId, setDepartmentId] = useState('');
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      supabase.from('units').select('id, name').eq('active', true).order('name'),
      supabase.from('departments').select('id, name').eq('active', true).order('name'),
    ]).then(([u, d]) => {
      if (u.data) setUnits(u.data);
      if (d.data) setDepartments(d.data);
    });
  }, []);

  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i);

  const handleExport = async () => {
    setError('');
    setLoading(true);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(`${supabaseUrl}/functions/v1/generate-haccp-report-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || supabaseAnonKey}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({
          month,
          year,
          unit_id: unitId || null,
          department_id: departmentId || null,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
        throw new Error(err.error || 'Erro ao gerar relatório');
      }

      const html = await response.text();
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);

      const win = window.open(url, '_blank');
      if (win) {
        win.onload = () => {
          setTimeout(() => {
            win.print();
          }, 500);
        };
      }

      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err: any) {
      setError(err.message || 'Erro ao gerar relatório');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-100 rounded-xl">
          <FileBarChart2 className="w-6 h-6 text-blue-700" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Relatório HACCP</h1>
          <p className="text-sm text-slate-500">Exportar registos mensais por departamento em PDF</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Período</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Mês</label>
              <select
                value={month}
                onChange={e => setMonth(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {MONTHS.map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Ano</label>
              <select
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Filtros</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {isAdmin && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Unidade</label>
                <select
                  value={unitId}
                  onChange={e => setUnitId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Todas as unidades</option>
                  {units.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Departamento</label>
              <select
                value={departmentId}
                onChange={e => setDepartmentId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Todos os departamentos</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="pt-2">
          <button
            onClick={handleExport}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                A gerar relatório...
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                Exportar PDF
              </>
            )}
          </button>
          <p className="text-xs text-slate-400 text-center mt-2">
            O relatório abre numa nova janela — use Ctrl+P / Cmd+P para guardar como PDF
          </p>
        </div>
      </div>

      <div className="mt-4 bg-slate-50 rounded-2xl border border-slate-200 p-4">
        <h3 className="text-xs font-semibold text-slate-600 mb-2">O relatório inclui:</h3>
        <ul className="space-y-1 text-xs text-slate-500">
          <li>• Todos os registos do mês selecionado</li>
          <li>• Agrupados por departamento e tarefa</li>
          <li>• Data, hora e utilizador de cada registo</li>
          <li>• Valores de todos os campos preenchidos</li>
          <li>• Indicação de fotografias submetidas</li>
        </ul>
      </div>
    </div>
  );
}
