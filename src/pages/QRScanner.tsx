import { useState, useEffect } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, CheckCircle, XCircle, ArrowLeft, AlertTriangle, RotateCcw, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface PackageInfo {
  id: string;
  unique_code: string;
  display_code: string;
  weight: number;
  unit: string;
  status: string;
  product_name: string;
  product_code: string;
  batch_number: string;
  location_name: string;
  packaging_date: string;
  expiry_date: string;
}

type ActionType = 'used' | 'waste' | 'returned' | 'blocked';

export default function QRScanner() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [scanning, setScanning] = useState(false);
  const [packageInfo, setPackageInfo] = useState<PackageInfo | null>(null);
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [html5QrCode, setHtml5QrCode] = useState<Html5Qrcode | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [browserSupported, setBrowserSupported] = useState(true);

  useEffect(() => {
    const checkBrowserSupport = () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setBrowserSupported(false);
        setError('Seu browser não suporta acesso à câmara. Por favor, use um browser moderno ou a opção de entrada manual.');
        return false;
      }

      const isSecureContext = window.isSecureContext ||
                              window.location.protocol === 'https:' ||
                              window.location.hostname === 'localhost' ||
                              window.location.hostname === '127.0.0.1';

      if (!isSecureContext) {
        setBrowserSupported(false);
        setError('A câmara só funciona em HTTPS ou localhost. Use a opção "Introduzir Código Manualmente".');
        return false;
      }

      return true;
    };

    checkBrowserSupport();

    return () => {
      if (html5QrCode) {
        html5QrCode.stop().catch(console.error);
      }
    };
  }, [html5QrCode]);

  const startScanning = async () => {
    try {
      setError('');

      console.log('Checking for cameras...');
      let devices;
      try {
        devices = await Html5Qrcode.getCameras();
        console.log('Cameras found:', devices);
      } catch (cameraCheckErr: any) {
        console.error('Error checking cameras:', cameraCheckErr);

        if (cameraCheckErr.name === 'NotAllowedError') {
          setError('Permissão de câmara negada. Por favor, autorize o acesso à câmara quando o browser solicitar.');
          return;
        }

        if (cameraCheckErr.name === 'NotFoundError') {
          setError('Nenhuma câmara foi encontrada neste dispositivo. Verifique se o dispositivo tem câmara ou use "Introduzir Código Manualmente".');
          return;
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setError('Seu browser não suporta acesso à câmara. Use um browser moderno (Chrome, Firefox, Safari, Edge).');
          return;
        }

        if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
          setError('A câmara apenas funciona em HTTPS. Acesse via https:// ou use "Introduzir Código Manualmente".');
          return;
        }

        setError('Não foi possível verificar as câmaras disponíveis. Use "Introduzir Código Manualmente" como alternativa.');
        return;
      }

      if (!devices || devices.length === 0) {
        setError('Nenhuma câmara encontrada no dispositivo. Use "Introduzir Código Manualmente".');
        return;
      }

      setScanning(true);

      await new Promise(resolve => setTimeout(resolve, 100));

      console.log('Starting QR scanner...');
      const qrCodeScanner = new Html5Qrcode('qr-reader');
      setHtml5QrCode(qrCodeScanner);

      await qrCodeScanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        onScanSuccess,
        () => {}
      );

      console.log('QR scanner started successfully');
    } catch (err: any) {
      console.error('Error starting scanner:', err);
      console.error('Error name:', err.name);
      console.error('Error message:', err.message);

      setScanning(false);

      let errorMessage = 'Erro ao iniciar câmara.';

      if (err.name === 'NotAllowedError' || err.message?.toLowerCase().includes('permission')) {
        errorMessage = 'Permissão de câmara negada. Autorize o acesso à câmara nas definições do browser e recarregue a página.';
      } else if (err.name === 'NotFoundError') {
        errorMessage = 'Nenhuma câmara encontrada. Verifique se o dispositivo tem uma câmara disponível ou use "Introduzir Código Manualmente".';
      } else if (err.name === 'NotReadableError') {
        errorMessage = 'A câmara está em uso por outra aplicação. Feche outras aplicações que usam a câmara e tente novamente.';
      } else if (err.name === 'NotSupportedError' || err.message?.toLowerCase().includes('https') || err.message?.toLowerCase().includes('secure')) {
        errorMessage = 'A câmara precisa de HTTPS. Use "Introduzir Código Manualmente" ou acesse via https://.';
      } else if (err.name === 'OverconstrainedError') {
        errorMessage = 'A câmara não suporta a configuração solicitada. Use "Introduzir Código Manualmente".';
      } else if (err.message) {
        errorMessage = `${err.message}. Use "Introduzir Código Manualmente" como alternativa.`;
      }

      setError(errorMessage);
    }
  };

  const stopScanning = async () => {
    if (html5QrCode) {
      try {
        await html5QrCode.stop();
        setScanning(false);
      } catch (err) {
        console.error('Error stopping scanner:', err);
      }
    }
  };

  const onScanSuccess = async (decodedText: string) => {
    await stopScanning();
    await fetchPackageInfo(decodedText);
  };

  const fetchPackageInfo = async (code: string) => {
    try {
      setError('');

      const { data, error: fetchError } = await supabase
        .from('packaged_units')
        .select(`
          id,
          unique_code,
          display_code,
          weight,
          unit,
          status,
          packaging_date,
          expiry_date,
          products (
            name,
            code
          ),
          production_batches (
            batch_number
          ),
          units (
            name
          )
        `)
        .eq('unique_code', code)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (!data) {
        setError('Embalagem não encontrada. Código QR inválido.');
        return;
      }

      if (data.status === 'used' || data.status === 'consumed') {
        setError('Esta embalagem já foi marcada como utilizada.');
        return;
      }

      if (data.status === 'waste') {
        setError('Esta embalagem já foi marcada como desperdício.');
        return;
      }

      setPackageInfo({
        id: data.id,
        unique_code: data.unique_code,
        display_code: data.display_code,
        weight: data.weight,
        unit: data.unit,
        status: data.status,
        product_name: data.products?.name || 'N/A',
        product_code: data.products?.code || 'N/A',
        batch_number: data.production_batches?.batch_number || 'N/A',
        location_name: data.units?.name || 'N/A',
        packaging_date: data.packaging_date,
        expiry_date: data.expiry_date,
      });
    } catch (err) {
      console.error('Error fetching package info:', err);
      setError('Erro ao buscar informações da embalagem.');
    }
  };

  const handleSubmitAction = async () => {
    if (!selectedAction || !packageInfo || !user || !profile) return;

    setSubmitting(true);
    setError('');

    try {
      const { error: actionError } = await supabase
        .from('packaged_unit_usage_actions')
        .insert({
          packaged_unit_id: packageInfo.id,
          action_type: selectedAction,
          performed_by: user.id,
          location_id: profile.unit_id,
          reason: reason || null,
          notes: notes || null,
          qr_code_scanned: true,
        });

      if (actionError) throw actionError;

      const newStatus = selectedAction === 'used' ? 'used' : selectedAction;

      const { error: updateError } = await supabase
        .from('packaged_units')
        .update({
          status: newStatus,
          final_action: selectedAction,
          final_action_at: new Date().toISOString(),
          final_action_by: user.id,
          final_action_reason: reason || null,
          updated_by: user.id,
        })
        .eq('id', packageInfo.id);

      if (updateError) throw updateError;

      setPackageInfo(null);
      setSelectedAction(null);
      setReason('');
      setNotes('');
      alert('Ação registada com sucesso!');
    } catch (err) {
      console.error('Error submitting action:', err);
      setError('Erro ao registar ação. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetScanner = () => {
    setPackageInfo(null);
    setSelectedAction(null);
    setReason('');
    setNotes('');
    setError('');
    setShowManualInput(false);
    setManualCode('');
  };

  const handleManualCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;

    await fetchPackageInfo(manualCode.trim());
    setShowManualInput(false);
    setManualCode('');
  };

  const getActionColor = (action: ActionType) => {
    switch (action) {
      case 'used': return 'bg-green-500 hover:bg-green-600';
      case 'waste': return 'bg-red-500 hover:bg-red-600';
      case 'returned': return 'bg-blue-500 hover:bg-blue-600';
      case 'blocked': return 'bg-yellow-500 hover:bg-yellow-600';
    }
  };

  const getActionLabel = (action: ActionType) => {
    switch (action) {
      case 'used': return 'Utilizado';
      case 'waste': return 'Desperdício';
      case 'returned': return 'Devolvido';
      case 'blocked': return 'Bloqueado';
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
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[status] || 'bg-gray-100 text-gray-800'}`}>
        {statusLabels[status] || status}
      </span>
    );
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-5 w-5 mr-1" />
          Voltar
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Leitura de QR Code</h1>

        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start">
            <Info className="h-5 w-5 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Requisitos para usar a câmara:</p>
              <ul className="list-disc list-inside space-y-1 text-blue-700">
                <li>Permissão de câmara concedida no browser</li>
                <li>Acesso via HTTPS ou localhost</li>
                <li>Câmara disponível e não em uso</li>
              </ul>
              <p className="mt-2">Se não conseguir usar a câmara, pode introduzir o código manualmente.</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md flex items-start">
            <AlertTriangle className="h-5 w-5 text-red-500 mr-2 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-800">{error}</p>
            </div>
            <button onClick={() => setError('')} className="text-red-500 hover:text-red-700">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {!packageInfo && !scanning && !showManualInput && (
          <div className="text-center">
            <div className="mb-6">
              <div className="w-48 h-48 mx-auto bg-gray-100 rounded-lg flex items-center justify-center">
                <svg className="w-32 h-32 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
              </div>
            </div>
            <div className="space-y-3">
              <button
                onClick={startScanning}
                disabled={!browserSupported}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Ler QR Code com Câmara
              </button>
              <button
                onClick={() => setShowManualInput(true)}
                className="w-full px-6 py-3 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 font-medium"
              >
                Introduzir Código Manualmente
              </button>
            </div>
          </div>
        )}

        {showManualInput && !packageInfo && (
          <div>
            <h3 className="text-lg font-semibold mb-4">Introduzir Código Manualmente</h3>
            <form onSubmit={handleManualCodeSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Código da Embalagem
                </label>
                <input
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Ex: PKG-001-01012024-0001"
                  required
                  autoFocus
                />
              </div>
              <div className="flex space-x-3">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Procurar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowManualInput(false);
                    setManualCode('');
                  }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {scanning && (
          <div>
            <div id="qr-reader" className="mb-4"></div>
            <button
              onClick={stopScanning}
              className="w-full px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
            >
              Cancelar
            </button>
          </div>
        )}

        {packageInfo && (
          <div>
            <div className="bg-gray-50 rounded-lg p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">Informações da Embalagem</h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Código</p>
                  <p className="font-medium">{packageInfo.display_code}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Estado</p>
                  <div>{getStatusBadge(packageInfo.status)}</div>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Produto</p>
                  <p className="font-medium">{packageInfo.product_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Código Produto</p>
                  <p className="font-medium">{packageInfo.product_code}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Lote</p>
                  <p className="font-medium">{packageInfo.batch_number}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Peso/Quantidade</p>
                  <p className="font-medium">{packageInfo.weight} {packageInfo.unit}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Data Embalagem</p>
                  <p className="font-medium">{new Date(packageInfo.packaging_date).toLocaleDateString('pt-PT')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Data Validade</p>
                  <p className="font-medium">{packageInfo.expiry_date ? new Date(packageInfo.expiry_date).toLocaleDateString('pt-PT') : 'N/A'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-gray-600">Localização</p>
                  <p className="font-medium">{packageInfo.location_name}</p>
                </div>
              </div>
            </div>

            {!selectedAction ? (
              <div>
                <h3 className="text-lg font-semibold mb-4">Selecione uma Ação</h3>
                <div className="grid grid-cols-2 gap-4">
                  {(['used', 'waste', 'returned', 'blocked'] as ActionType[]).map((action) => (
                    <button
                      key={action}
                      onClick={() => setSelectedAction(action)}
                      className={`p-4 ${getActionColor(action)} text-white rounded-lg font-medium transition-colors`}
                    >
                      {getActionLabel(action)}
                    </button>
                  ))}
                </div>
                <button
                  onClick={resetScanner}
                  className="mt-4 w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                >
                  <RotateCcw className="h-4 w-4 inline mr-2" />
                  Ler Outro QR Code
                </button>
              </div>
            ) : (
              <div>
                <h3 className="text-lg font-semibold mb-4">
                  Confirmar Ação: <span className={`${getActionColor(selectedAction)} px-3 py-1 rounded text-white`}>
                    {getActionLabel(selectedAction)}
                  </span>
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Motivo {selectedAction !== 'used' && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder={selectedAction === 'waste' ? 'Ex: Produto estragado' : selectedAction === 'blocked' ? 'Ex: Problema de qualidade' : 'Motivo (opcional)'}
                      required={selectedAction !== 'used'}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notas (opcional)
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Adicione notas adicionais..."
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handleSubmitAction}
                      disabled={submitting || (selectedAction !== 'used' && !reason.trim())}
                      className={`flex-1 px-4 py-2 ${getActionColor(selectedAction)} text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center`}
                    >
                      {submitting ? (
                        'A processar...'
                      ) : (
                        <>
                          <CheckCircle className="h-5 w-5 mr-2" />
                          Confirmar
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setSelectedAction(null)}
                      disabled={submitting}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50"
                    >
                      <XCircle className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
