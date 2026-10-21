import { Building2 } from 'lucide-react';

interface Unit { id: string; name: string }

interface Props {
  units: Unit[];
  selected: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  allLabel?: string;
}

export default function UnitMultiSelect({ units, selected, onChange, label = 'Unidades', allLabel = 'Todas as unidades' }: Props) {
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  };

  const allSelected = selected.length === 0;

  return (
    <div>
      {label && <label className="block text-sm font-medium text-slate-700 mb-2">{label}</label>}
      <div className="border border-slate-300 rounded-xl overflow-hidden divide-y divide-slate-100">
        {/* "All units" row */}
        <button
          type="button"
          onClick={() => onChange([])}
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left transition ${
            allSelected ? 'bg-blue-50' : 'bg-white hover:bg-slate-50'
          }`}
        >
          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition ${
            allSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
          }`}>
            {allSelected && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
              <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>}
          </div>
          <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <span className={allSelected ? 'text-blue-700 font-medium' : 'text-slate-500 italic'}>{allLabel}</span>
        </button>

        {/* Individual units */}
        {units.map(u => {
          const isChecked = selected.includes(u.id);
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => toggle(u.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left transition ${
                isChecked ? 'bg-blue-50' : 'bg-white hover:bg-slate-50'
              }`}
            >
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition ${
                isChecked ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
              }`}>
                {isChecked && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                  <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>}
              </div>
              <span className={isChecked ? 'text-blue-700 font-medium' : 'text-slate-700'}>{u.name}</span>
            </button>
          );
        })}
      </div>

      {selected.length > 0 && (
        <p className="text-xs text-slate-400 mt-1.5">
          {selected.length === 1 ? '1 unidade selecionada' : `${selected.length} unidades selecionadas`}
        </p>
      )}
    </div>
  );
}
