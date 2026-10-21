import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { X, MapPin, Package as PackageIcon, Calendar, Eye, Download } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import PackagedUnitLifecycle from './PackagedUnitLifecycle';
import { generateLabelCSV, downloadCSV, formatLabelDate, formatWeight, type LabelData } from '../lib/csv-export';

interface BatchUnit {
  unit_id: string;
  unique_code: string;
  display_code: string;
  weight: number;
  unit_type: string;
  status: string;
  location_name: string;
  location_id: string;
  packaging_date: string;
  expiry_date: string;
  transferred_at: string;
  received_at: string;
  final_action: string;
  final_action_at: string;
  product_name?: string;
  product_code?: string;
  batch_code?: string;
}

interface BatchTrackingViewProps {
  batchId: string;
  batchNumber: string;
  onClose: () => void;
}

export default function BatchTrackingView({ batchId, batchNumber, onClose }: BatchTrackingViewProps) {
  const [units, setUnits] = useState<BatchUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedUnitCode, setSelectedUnitCode] = useState<string>('');

  useEffect(() => {
    loadBatchUnits();
  }, [batchId]);

  const loadBatchUnits = async () => {
    try {
      setError('');
      const { data, error: fetchError } = await supabase
        .rpc('get_batch_units_locations', {
          batch_id: batchId
        });

      if (fetchError) throw fetchError;

      const { data: batchData } = await supabase
        .from('production_batches')
        .select('batch_code, products(name, code)')
        .eq('id', batchId)
        .maybeSingle();

      const enrichedData = (data || []).map((unit: any) => ({
        ...unit,
        product_name: batchData?.products?.name || '',
        product_code: batchData?.products?.code || '',
        batch_code: batchData?.batch_code || batchNumber
      }));

      setUnits(enrichedData);
    } catch (err) {
      console.error('Error loading batch units:', err);
      setError('Erro ao carregar unidades do lote');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      available: 'bg-green-100 text-green-800',
      in_stock: 'bg-green-100 text-green-800',
      reserved: 'bg-yellow-100 text-yellow-800',
      in_transit: 'bg-blue-100 text-blue-800',
      received: 'bg-blue-100 text-blue-800',
      used: 'bg-gray-100 text-gray-800',
      waste: 'bg-red-100 text-red-800',
      blocked: 'bg-orange-100 text-orange-800',
      returned: 'bg-purple-100 text-purple-800',
    };

    const statusLabels: Record<string, string> = {
      available: 'Disponível',
      in_stock: 'Em Stock',
      reserved: 'Reservado',
      in_transit: 'Em Trânsito',
      received: 'Recebido',
      used: 'Utilizado',
      waste: 'Desperdício',
      blocked: 'Bloqueado',
      returned: 'Devolvido',
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[status] || 'bg-gray-100 text-gray-800'}`}>
        {statusLabels[status] || status}
      </span>
    );
  };

  const getActionBadge = (action: string) => {
    const actionColors: Record<string, string> = {
      used: 'bg-green-100 text-green-800',
      waste: 'bg-red-100 text-red-800',
      returned: 'bg-purple-100 text-purple-800',
      blocked: 'bg-orange-100 text-orange-800',
    };

    const actionLabels: Record<string, string> = {
      used: 'Utilizado',
      waste: 'Desperdício',
      returned: 'Devolvido',
      blocked: 'Bloqueado',
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${actionColors[action] || 'bg-gray-100 text-gray-800'}`}>
        {actionLabels[action] || action}
      </span>
    );
  };

  const groupByLocation = () => {
    const grouped = new Map<string, BatchUnit[]>();
    units.forEach(unit => {
      const location = unit.location_name || 'Sem Localização';
      if (!grouped.has(location)) {
        grouped.set(location, []);
      }
      grouped.get(location)?.push(unit);
    });
    return grouped;
  };

  const groupByStatus = () => {
    const grouped = new Map<string, number>();
    units.forEach(unit => {
      grouped.set(unit.status, (grouped.get(unit.status) || 0) + 1);
    });
    return grouped;
  };

  const totalWeight = units.reduce((sum, unit) => sum + Number(unit.weight), 0);
  const statusCounts = groupByStatus();
  const locationGroups = groupByLocation();

  const handleExportCSV = () => {
    const labels: LabelData[] = units.map(unit => ({
      product_name: unit.product_name || '',
      code_short: unit.product_code || '',
      package_code: unit.display_code || '',
      batch: unit.batch_code || batchNumber,
      production_date: formatLabelDate(unit.packaging_date),
      expiry_date: formatLabelDate(unit.expiry_date),
      weight: formatWeight(unit.weight, unit.unit_type),
      internal_code: unit.unique_code || '',
      qr_value: unit.unique_code || ''
    }));

    const csvContent = generateLabelCSV(labels);
    const filename = `labels_${batchNumber.replace(/\//g, '-')}.csv`;
    downloadCSV(csvContent, filename);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
          <div className="flex items-center justify-between p-6 border-b">
            <div className="flex items-center">
              <PackageIcon className="h-6 w-6 text-blue-600 mr-3" />
              <div>
                <h2 className="text-xl font-bold text-gray-900">Rastreamento do Lote</h2>
                <p className="text-sm text-gray-600">Lote: {batchNumber}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : error ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800">{error}</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-600 mb-1">Total de Unidades</p>
                    <p className="text-2xl font-bold text-blue-900">{units.length}</p>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-sm text-green-600 mb-1">Peso Total</p>
                    <p className="text-2xl font-bold text-green-900">{totalWeight.toFixed(2)} kg</p>
                  </div>
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <p className="text-sm text-purple-600 mb-1">Localizações</p>
                    <p className="text-2xl font-bold text-purple-900">{locationGroups.size}</p>
                  </div>
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <p className="text-sm text-orange-600 mb-1">Estados</p>
                    <p className="text-2xl font-bold text-orange-900">{statusCounts.size}</p>
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Resumo por Estado</h3>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(statusCounts.entries()).map(([status, count]) => (
                      <div key={status} className="flex items-center gap-2">
                        {getStatusBadge(status)}
                        <span className="text-sm text-gray-600">({count})</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-6">
                  {Array.from(locationGroups.entries()).map(([location, locationUnits]) => (
                    <div key={location} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <MapPin className="h-5 w-5 text-gray-600 mr-2" />
                            <h3 className="font-semibold text-gray-900">{location}</h3>
                          </div>
                          <span className="text-sm text-gray-600">
                            {locationUnits.length} {locationUnits.length === 1 ? 'unidade' : 'unidades'}
                          </span>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Código</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Peso</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Estado</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Data Embalagem</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Validade</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Ação Final</th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {locationUnits.map(unit => (
                              <tr key={unit.unit_id} className="hover:bg-gray-50">
                                <td className="px-4 py-3">
                                  <span className="font-mono font-medium text-gray-900">{unit.display_code}</span>
                                </td>
                                <td className="px-4 py-3 text-gray-900">
                                  {unit.weight} {unit.unit_type}
                                </td>
                                <td className="px-4 py-3">
                                  {getStatusBadge(unit.status)}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600">
                                  {unit.packaging_date ? format(new Date(unit.packaging_date), 'dd/MM/yyyy', { locale: pt }) : '-'}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600">
                                  {unit.expiry_date ? format(new Date(unit.expiry_date), 'dd/MM/yyyy', { locale: pt }) : '-'}
                                </td>
                                <td className="px-4 py-3">
                                  {unit.final_action ? (
                                    <div>
                                      {getActionBadge(unit.final_action)}
                                      {unit.final_action_at && (
                                        <p className="text-xs text-gray-500 mt-1">
                                          {format(new Date(unit.final_action_at), 'dd/MM/yyyy', { locale: pt })}
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-gray-400">-</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <button
                                    onClick={() => {
                                      setSelectedUnitId(unit.unit_id);
                                      setSelectedUnitCode(unit.display_code);
                                    }}
                                    className="text-blue-600 hover:text-blue-800 transition"
                                    title="Ver Ciclo de Vida"
                                  >
                                    <Eye className="h-5 w-5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="flex justify-between p-6 border-t bg-gray-50">
            <button
              onClick={handleExportCSV}
              disabled={units.length === 0}
              className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="h-5 w-5" />
              <span>Exportar Etiquetas (CSV)</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>

      {selectedUnitId && (
        <PackagedUnitLifecycle
          unitId={selectedUnitId}
          unitCode={selectedUnitCode}
          onClose={() => {
            setSelectedUnitId(null);
            setSelectedUnitCode('');
          }}
        />
      )}
    </>
  );
}
