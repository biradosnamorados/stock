import { FileText } from 'lucide-react';

export default function TechnicalSheets() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-gradient-to-br from-[#038C5A] to-[#F2B705] rounded-xl">
          <FileText className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800">Fichas Técnicas</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
        <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-slate-800 mb-2">Em Desenvolvimento</h2>
        <p className="text-slate-600">
          Módulo de fichas técnicas para cálculo de custos e ingredientes
        </p>
      </div>
    </div>
  );
}
