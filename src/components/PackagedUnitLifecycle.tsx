import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar, User, MapPin, AlertCircle, X, Package as PackageIcon } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

interface LifecycleEvent {
  event_time: string;
  event_type: string;
  event_description: string;
  performed_by_name: string;
  location_name: string;
  status: string;
  metadata: any;
}

interface PackagedUnitLifecycleProps {
  unitId: string;
  unitCode: string;
  onClose: () => void;
}

export default function PackagedUnitLifecycle({ unitId, unitCode, onClose }: PackagedUnitLifecycleProps) {
  const [events, setEvents] = useState<LifecycleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadLifecycle();
  }, [unitId]);

  const loadLifecycle = async () => {
    try {
      setError('');
      const { data, error: fetchError } = await supabase
        .rpc('get_packaged_unit_lifecycle', {
          unit_id: unitId
        });

      if (fetchError) throw fetchError;
      setEvents(data || []);
    } catch (err) {
      console.error('Error loading lifecycle:', err);
      setError('Erro ao carregar histórico de ciclo de vida');
    } finally {
      setLoading(false);
    }
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'produced':
      case 'packaged':
        return '📦';
      case 'transferred':
        return '🚚';
      case 'received':
        return '✅';
      case 'reserved':
        return '🔒';
      case 'unreserved':
        return '🔓';
      case 'used':
        return '✓';
      case 'waste':
        return '🗑️';
      case 'returned':
        return '↩️';
      case 'blocked':
        return '⚠️';
      case 'unblocked':
        return '🔓';
      default:
        return '•';
    }
  };

  const getEventColor = (eventType: string) => {
    switch (eventType) {
      case 'produced':
      case 'packaged':
        return 'bg-blue-100 border-blue-300';
      case 'transferred':
      case 'received':
        return 'bg-green-100 border-green-300';
      case 'reserved':
        return 'bg-yellow-100 border-yellow-300';
      case 'unreserved':
      case 'unblocked':
        return 'bg-gray-100 border-gray-300';
      case 'used':
        return 'bg-purple-100 border-purple-300';
      case 'waste':
        return 'bg-red-100 border-red-300';
      case 'returned':
        return 'bg-orange-100 border-orange-300';
      case 'blocked':
        return 'bg-yellow-100 border-yellow-300';
      default:
        return 'bg-gray-100 border-gray-300';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center">
            <PackageIcon className="h-6 w-6 text-blue-600 mr-3" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">Ciclo de Vida da Embalagem</h2>
              <p className="text-sm text-gray-600">Código: {unitCode}</p>
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
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
              <AlertCircle className="h-5 w-5 text-red-500 mr-2 mt-0.5" />
              <p className="text-red-800">{error}</p>
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Nenhum evento registado para esta embalagem
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gray-200"></div>

              <div className="space-y-6">
                {events.map((event, index) => (
                  <div key={index} className="relative pl-16">
                    <div className={`absolute left-4 w-8 h-8 rounded-full border-2 flex items-center justify-center text-lg ${getEventColor(event.event_type)} bg-white`}>
                      {getEventIcon(event.event_type)}
                    </div>

                    <div className={`border rounded-lg p-4 ${getEventColor(event.event_type)} bg-opacity-50`}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            {event.event_description}
                          </h3>
                          <div className="flex items-center text-sm text-gray-600 mt-1 space-x-4">
                            <div className="flex items-center">
                              <Calendar className="h-4 w-4 mr-1" />
                              {format(new Date(event.event_time), "d 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: pt })}
                            </div>
                            {event.performed_by_name && (
                              <div className="flex items-center">
                                <User className="h-4 w-4 mr-1" />
                                {event.performed_by_name}
                              </div>
                            )}
                          </div>
                        </div>
                        <span className="px-3 py-1 bg-white border rounded-full text-xs font-medium text-gray-700">
                          {event.status}
                        </span>
                      </div>

                      {event.location_name && (
                        <div className="flex items-center text-sm text-gray-600 mt-2">
                          <MapPin className="h-4 w-4 mr-1" />
                          {event.location_name}
                        </div>
                      )}

                      {event.metadata && Object.keys(event.metadata).length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-300">
                          <p className="text-xs text-gray-600 mb-1">Informação adicional:</p>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            {event.metadata.weight && (
                              <div>
                                <span className="text-gray-600">Peso:</span>{' '}
                                <span className="font-medium">{event.metadata.weight} {event.metadata.unit}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
