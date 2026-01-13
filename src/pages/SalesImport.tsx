import { Upload } from 'lucide-react';

export default function SalesImport() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-gradient-to-br from-[#F2B705] to-[#F20519] rounded-xl">
          <Upload className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800">Importar Vendas</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
        <Upload className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-slate-800 mb-2">Em Desenvolvimento</h2>
        <p className="text-slate-600">
          Importação de CSV Winrest com baixa automática de stock
        </p>
      </div>
    </div>
  );
}
