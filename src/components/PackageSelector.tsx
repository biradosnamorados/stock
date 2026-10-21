import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Package, Calendar, Weight } from 'lucide-react';

interface PackagedUnit {
  id: string;
  unique_code: string;
  display_code: string;
  weight: number;
  unit: string;
  status: string;
  created_at: string;
  batch_id: string;
  production_batches: {
    batch_code: string;
    production_date: string;
    expiry_date: string;
  };
}

interface PackageSelectorProps {
  productId: string;
  productName: string;
  requestedQuantity: number;
  requestedUnit: string;
  selectedPackages: string[];
  onPackagesChange: (packageIds: string[], totalWeight: number) => void;
  fromUnitId: string;
}

export default function PackageSelector({
  productId,
  productName,
  requestedQuantity,
  requestedUnit,
  selectedPackages,
  onPackagesChange,
  fromUnitId,
}: PackageSelectorProps) {
  const [packages, setPackages] = useState<PackagedUnit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAvailablePackages();
  }, [productId, fromUnitId]);

  const loadAvailablePackages = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .rpc('get_available_units_fifo', {
          p_product_id: productId,
          p_location_id: fromUnitId
        });

      if (error) throw error;

      const enrichedData = await Promise.all((data || []).map(async (pkg: any) => {
        const { data: batchData } = await supabase
          .from('production_batches')
          .select('batch_number, production_date, expiry_date')
          .eq('id', pkg.batch_id)
          .maybeSingle();

        return {
          id: pkg.unit_id,
          unique_code: pkg.unique_code,
          display_code: pkg.display_code,
          weight: pkg.weight,
          unit: pkg.unit_type,
          status: 'available',
          created_at: pkg.packaging_date,
          batch_id: pkg.batch_id,
          production_batches: {
            batch_code: batchData?.batch_number || 'N/A',
            production_date: batchData?.production_date || pkg.packaging_date,
            expiry_date: pkg.expiry_date || batchData?.expiry_date
          }
        };
      }));

      setPackages(enrichedData);
    } catch (err) {
      console.error('Error loading packages:', err);
    } finally {
      setLoading(false);
    }
  };

  const togglePackage = (packageId: string) => {
    let newSelected: string[];
    if (selectedPackages.includes(packageId)) {
      newSelected = selectedPackages.filter(id => id !== packageId);
    } else {
      newSelected = [...selectedPackages, packageId];
    }

    const totalWeight = packages
      .filter(p => newSelected.includes(p.id))
      .reduce((sum, p) => sum + Number(p.weight), 0);

    onPackagesChange(newSelected, totalWeight);
  };

  const totalSelected = packages
    .filter(p => selectedPackages.includes(p.id))
    .reduce((sum, p) => sum + Number(p.weight), 0);

  const suggestFIFO = () => {
    let accumulated = 0;
    const suggested: string[] = [];

    for (const pkg of packages) {
      if (accumulated >= requestedQuantity) break;
      suggested.push(pkg.id);
      accumulated += Number(pkg.weight);
    }

    const totalWeight = packages
      .filter(p => suggested.includes(p.id))
      .reduce((sum, p) => sum + Number(p.weight), 0);

    onPackagesChange(suggested, totalWeight);
  };

  if (loading) {
    return (
      <div className="text-center py-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-sm text-slate-600 mt-2">A carregar embalagens...</p>
      </div>
    );
  }

  if (packages.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-800">
          Não há embalagens disponíveis em stock para <strong>{productName}</strong>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-slate-800">{productName}</h4>
          <p className="text-sm text-slate-600">
            Pedido: {requestedQuantity} {requestedUnit} |
            Selecionado: <span className={totalSelected >= requestedQuantity ? 'text-green-600 font-semibold' : 'text-orange-600 font-semibold'}>
              {totalSelected.toFixed(2)} {requestedUnit}
            </span>
          </p>
        </div>
        <button
          onClick={suggestFIFO}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition"
        >
          Sugerir FIFO
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto space-y-2">
        {packages.map((pkg) => {
          const isSelected = selectedPackages.includes(pkg.id);
          const daysToExpiry = pkg.production_batches.expiry_date
            ? Math.ceil((new Date(pkg.production_batches.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
            : null;

          return (
            <div
              key={pkg.id}
              onClick={() => togglePackage(pkg.id)}
              className={`
                p-3 border-2 rounded-lg cursor-pointer transition
                ${isSelected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
                }
              `}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <Package className="w-4 h-4 text-slate-600" />
                    <span className="font-mono font-semibold text-slate-800">
                      {pkg.display_code}
                    </span>
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                      {pkg.production_batches.batch_code}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center space-x-4 text-xs text-slate-600">
                    <div className="flex items-center space-x-1">
                      <Weight className="w-3 h-3" />
                      <span>{pkg.weight} {pkg.unit}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Calendar className="w-3 h-3" />
                      <span>
                        Prod: {new Date(pkg.production_batches.production_date).toLocaleDateString('pt-PT')}
                      </span>
                    </div>
                    {daysToExpiry !== null && (
                      <span className={daysToExpiry <= 7 ? 'text-red-600 font-semibold' : daysToExpiry <= 14 ? 'text-orange-600' : ''}>
                        Exp: {daysToExpiry}d
                      </span>
                    )}
                  </div>
                </div>

                <div className={`
                  w-5 h-5 rounded border-2 flex items-center justify-center
                  ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}
                `}>
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
