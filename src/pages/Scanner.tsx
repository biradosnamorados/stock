import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { QrCode, Package, Calendar, MapPin, Activity, Camera, X } from 'lucide-react';
import { format } from 'date-fns';
import { Html5Qrcode } from 'html5-qrcode';

interface PackagedUnitDetail {
  id: string;
  unique_code: string;
  display_code: string;
  weight: number | null;
  unit: string | null;
  status: string;
  created_at: string;
  opened_at: string | null;
  consumed_at: string | null;
  production_batches: {
    batch_code: string;
    production_date: string;
    expiry_date: string | null;
    products: {
      name: string;
      code: string;
      storage_type: string | null;
    };
  };
  units: {
    name: string;
  };
}

export default function Scanner() {
  const { profile } = useAuth();
  const [code, setCode] = useState('');
  const [packageData, setPackageData] = useState<PackagedUnitDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerInitializedRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qrCode = params.get('code');
    if (qrCode) {
      setCode(qrCode);
      scanPackage(qrCode);
    }
  }, []);

  const scanPackage = async (scanCode: string) => {
    setLoading(true);
    setError('');
    setPackageData(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('packaged_units')
        .select(`
          *,
          production_batches(
            batch_code,
            production_date,
            expiry_date,
            products(name, code, storage_type)
          ),
          units(name)
        `)
        .eq('unique_code', scanCode)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (!data) {
        setError('Package not found');
      } else {
        setPackageData(data as PackagedUnitDetail);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to scan package');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim()) {
      scanPackage(code.trim());
    }
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current && scannerInitializedRef.current) {
        scannerRef.current
          .stop()
          .catch((err) => console.error('Failed to stop scanner:', err));
      }
    };
  }, []);

  const startScanner = async () => {
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
          setError('Camera permission denied. Please allow camera access when prompted.');
          return;
        }

        if (cameraCheckErr.name === 'NotFoundError') {
          setError('No camera found on this device. Please check if your device has a camera.');
          return;
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setError('Your browser does not support camera access. Please use a modern browser.');
          return;
        }

        if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
          setError('Camera only works on HTTPS. Please access via https:// or use localhost.');
          return;
        }

        setError('Could not verify available cameras. Please check your browser permissions.');
        return;
      }

      if (!devices || devices.length === 0) {
        setError('No camera found on this device.');
        return;
      }

      setShowCamera(true);

      await new Promise(resolve => setTimeout(resolve, 100));

      console.log('Starting QR scanner...');
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode('qr-reader');
      }

      await scannerRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          setCode(decodedText);
          stopScanner();
          scanPackage(decodedText);
        },
        () => {}
      );
      scannerInitializedRef.current = true;

      console.log('QR scanner started successfully');
    } catch (err: any) {
      console.error('Error starting scanner:', err);
      console.error('Error name:', err.name);
      console.error('Error message:', err.message);

      setShowCamera(false);

      let errorMessage = 'Failed to start camera.';

      if (err.name === 'NotAllowedError' || err.message?.toLowerCase().includes('permission')) {
        errorMessage = 'Camera permission denied. Please grant camera access in your browser settings and reload.';
      } else if (err.name === 'NotFoundError') {
        errorMessage = 'No camera found. Please check if your device has an available camera.';
      } else if (err.name === 'NotReadableError') {
        errorMessage = 'Camera is in use by another application. Please close other apps using the camera.';
      } else if (err.name === 'NotSupportedError' || err.message?.toLowerCase().includes('https') || err.message?.toLowerCase().includes('secure')) {
        errorMessage = 'Camera requires HTTPS. Please access via https:// or localhost.';
      } else if (err.name === 'OverconstrainedError') {
        errorMessage = 'Camera does not support the requested configuration.';
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && scannerInitializedRef.current) {
      try {
        await scannerRef.current.stop();
        scannerInitializedRef.current = false;
      } catch (err) {
        console.error('Failed to stop scanner:', err);
      }
    }
    setShowCamera(false);
  };

  const updatePackageStatus = async (newStatus: string) => {
    if (!packageData) return;

    try {
      const updates: any = { status: newStatus };

      if (newStatus === 'opened') {
        updates.opened_at = new Date().toISOString();
        updates.opened_by = profile?.id;
      } else if (newStatus === 'consumed') {
        updates.consumed_at = new Date().toISOString();
        updates.consumed_by = profile?.id;
      }

      const { error: updateError } = await supabase
        .from('packaged_units')
        .update(updates)
        .eq('id', packageData.id);

      if (updateError) throw updateError;

      await supabase.from('audit_logs').insert({
        user_id: profile?.id,
        action: `package_${newStatus}`,
        entity: 'packaged_units',
        entity_id: packageData.id,
        changes: updates,
      });

      scanPackage(code);
    } catch (err: any) {
      alert(err.message || 'Failed to update package status');
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800">QR Scanner</h1>
        <p className="text-slate-600 mt-2">Scan or enter package code to view details</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        {showCamera ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">Scan QR Code</h3>
              <button
                onClick={stopScanner}
                className="p-2 text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div id="qr-reader" className="rounded-lg overflow-hidden"></div>
            <p className="text-sm text-slate-600 text-center">
              Position the QR code within the camera frame
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Package Code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="PK-0000001 or scan QR code"
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="submit"
                disabled={loading || !code.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg transition disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                <QrCode className="w-5 h-5" />
                <span>{loading ? 'Scanning...' : 'Search'}</span>
              </button>
              <button
                type="button"
                onClick={startScanner}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg transition flex items-center justify-center space-x-2"
              >
                <Camera className="w-5 h-5" />
                <span>Scan QR</span>
              </button>
            </div>
          </form>
        )}

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}
      </div>

      {packageData && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-blue-600 px-6 py-4">
            <h2 className="text-xl font-semibold text-white">Package Details</h2>
          </div>

          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center space-x-2 text-sm text-slate-600 mb-1">
                  <Package className="w-4 h-4" />
                  <span>Package Code</span>
                </div>
                <p className="text-lg font-mono font-semibold text-slate-800">
                  {packageData.display_code}
                </p>
              </div>

              <div>
                <div className="flex items-center space-x-2 text-sm text-slate-600 mb-1">
                  <Activity className="w-4 h-4" />
                  <span>Status</span>
                </div>
                <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${
                  packageData.status === 'in_stock'
                    ? 'bg-green-50 text-green-700'
                    : packageData.status === 'opened'
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-slate-100 text-slate-600'
                }`}>
                  {packageData.status.replace('_', ' ')}
                </span>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-6">
              <h3 className="font-semibold text-slate-800 mb-4">Product Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-600">Product</p>
                  <p className="font-medium text-slate-800">
                    {packageData.production_batches.products.name}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">Batch Code</p>
                  <p className="font-mono font-medium text-slate-800">
                    {packageData.production_batches.batch_code}
                  </p>
                </div>
                {packageData.weight && (
                  <div>
                    <p className="text-sm text-slate-600">Weight</p>
                    <p className="font-medium text-slate-800">
                      {packageData.weight} {packageData.unit}
                    </p>
                  </div>
                )}
                {packageData.production_batches.products.storage_type && (
                  <div>
                    <p className="text-sm text-slate-600">Storage</p>
                    <p className="font-medium text-slate-800 capitalize">
                      {packageData.production_batches.products.storage_type}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-slate-200 pt-6">
              <h3 className="font-semibold text-slate-800 mb-4">Dates</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center space-x-2 text-sm text-slate-600 mb-1">
                    <Calendar className="w-4 h-4" />
                    <span>Production Date</span>
                  </div>
                  <p className="font-medium text-slate-800">
                    {format(new Date(packageData.production_batches.production_date), 'dd/MM/yyyy')}
                  </p>
                </div>
                {packageData.production_batches.expiry_date && (
                  <div>
                    <div className="flex items-center space-x-2 text-sm text-slate-600 mb-1">
                      <Calendar className="w-4 h-4" />
                      <span>Expiry Date</span>
                    </div>
                    <p className="font-medium text-slate-800">
                      {format(new Date(packageData.production_batches.expiry_date), 'dd/MM/yyyy')}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-slate-200 pt-6">
              <h3 className="font-semibold text-slate-800 mb-4">Location</h3>
              <div className="flex items-center space-x-2">
                <MapPin className="w-5 h-5 text-slate-600" />
                <span className="font-medium text-slate-800">{packageData.units.name}</span>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-6">
              <h3 className="font-semibold text-slate-800 mb-4">Actions</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <button
                  onClick={() => updatePackageStatus('opened')}
                  disabled={packageData.status !== 'in_stock' && packageData.status !== 'received'}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Open
                </button>
                <button
                  onClick={() => updatePackageStatus('consumed')}
                  disabled={packageData.status === 'consumed'}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Consume
                </button>
                <button
                  onClick={() => updatePackageStatus('waste')}
                  disabled={packageData.status === 'waste'}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Waste
                </button>
                <button
                  onClick={() => updatePackageStatus('blocked')}
                  disabled={packageData.status === 'blocked'}
                  className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Block
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
