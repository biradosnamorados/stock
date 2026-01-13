import { Bell } from 'lucide-react';

export default function Alerts() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-gradient-to-br from-[#F20519] to-[#F2B705] rounded-xl">
          <Bell className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800">Alertas</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
        <Bell className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-slate-800 mb-2">Em Desenvolvimento</h2>
        <p className="text-slate-600">
          Sistema de alertas para stock baixo, preços desatualizados e mais
        </p>
      </div>
    </div>
  );
}
