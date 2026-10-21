import { useEffect, useRef } from 'react';
import { X, Printer } from 'lucide-react';
import QRCodeLib from 'qrcode';
import { format } from 'date-fns';

interface PackageLabelData {
  productName: string;
  productCode: string;
  batchCode: string;
  uniqueCode: string;
  displayCode: string;
  productionDate: string;
  expiryDate: string | null;
  weight: number | null;
  unit: string | null;
}

interface PackagingLabelProps {
  labelData: PackageLabelData;
  onClose: () => void;
}

export default function PackagingLabel({ labelData, onClose }: PackagingLabelProps) {
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (qrCanvasRef.current) {
      const qrData = `${window.location.origin}/scanner?code=${labelData.uniqueCode}`;
      QRCodeLib.toCanvas(qrCanvasRef.current, qrData, {
        width: 180,
        margin: 1,
      }).catch(console.error);
    }
  }, [labelData.uniqueCode]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-slate-200 flex items-center justify-between print:hidden">
          <h3 className="text-lg font-semibold text-slate-800">Etiqueta de Embalagem</h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-8 print:p-4">
          <div className="border-4 border-slate-800 rounded-lg p-6 print:border-2">
            <div className="text-center mb-4">
              <h2 className="text-2xl font-bold text-slate-900 print:text-xl">
                {labelData.productName}
              </h2>
              <p className="text-sm text-slate-600 font-mono mt-1">
                Cód: {labelData.productCode}
              </p>
            </div>

            <div className="flex justify-center mb-4">
              <canvas ref={qrCanvasRef} className="border-2 border-slate-300 rounded" />
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="font-semibold text-slate-700">Embalagem:</span>
                <span className="font-mono font-bold text-slate-900">{labelData.displayCode}</span>
              </div>

              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="font-semibold text-slate-700">Lote:</span>
                <span className="font-mono font-bold text-slate-900">{labelData.batchCode}</span>
              </div>

              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="font-semibold text-slate-700">Produção:</span>
                <span className="font-medium text-slate-900">
                  {format(new Date(labelData.productionDate), 'dd/MM/yyyy')}
                </span>
              </div>

              {labelData.expiryDate && (
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="font-semibold text-slate-700">Validade:</span>
                  <span className="font-medium text-slate-900">
                    {format(new Date(labelData.expiryDate), 'dd/MM/yyyy')}
                  </span>
                </div>
              )}

              {labelData.weight && (
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="font-semibold text-slate-700">Peso:</span>
                  <span className="font-medium text-slate-900">
                    {labelData.weight} {labelData.unit}
                  </span>
                </div>
              )}

              <div className="flex justify-between pt-2">
                <span className="font-semibold text-slate-700">Código:</span>
                <span className="font-mono text-xs text-slate-600">{labelData.uniqueCode}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .fixed.inset-0 {
            position: static;
            background: white;
          }
          .fixed.inset-0, .fixed.inset-0 * {
            visibility: visible;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
