import { useState, useEffect } from 'react';
import { Printer, X } from 'lucide-react';
import FullPackageLabel from './FullPackageLabel';
import CompactPackageLabel from './CompactPackageLabel';

interface PackagedUnit {
  id: string;
  unique_code: string;
  display_code: string;
  weight: number;
  unit: string;
  qr_code: string;
  production_batches: {
    batch_code: string;
    production_date: string;
    expiry_date: string | null;
  };
  products: {
    name: string;
    code: string;
  };
}

interface LabelPrintViewProps {
  packagedUnits: PackagedUnit[];
  onClose: () => void;
  autoPrint?: boolean;
}

type LabelType = 'full' | 'compact';
type LabelSize = 'small' | 'large';

export default function LabelPrintView({
  packagedUnits,
  onClose,
  autoPrint = false
}: LabelPrintViewProps) {
  const [labelType, setLabelType] = useState<LabelType>('full');
  const [labelSize, setLabelSize] = useState<LabelSize>('large');

  useEffect(() => {
    if (autoPrint && packagedUnits.length > 0) {
      const timer = setTimeout(() => {
        window.print();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoPrint, packagedUnits.length]);

  const handlePrint = () => {
    window.print();
  };

  const getLabelSizeClass = () => {
    if (labelType === 'compact') {
      return 'label-size-thermal';
    }
    return labelSize === 'small' ? 'label-size-small' : 'label-size-large';
  };

  return (
    <>
      <div className="print-preview-overlay no-print">
        <div className="print-preview-container">
          <div className="print-preview-header">
            <div>
              <h2 className="text-xl font-semibold text-slate-800">
                Pré-visualização de Etiquetas
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                {packagedUnits.length} etiqueta{packagedUnits.length !== 1 ? 's' : ''} para impressão
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>

          <div className="print-preview-controls">
            <div className="control-group">
              <label className="text-sm font-medium text-slate-700">Tipo de Etiqueta</label>
              <div className="radio-group">
                <label className="radio-option">
                  <input
                    type="radio"
                    value="full"
                    checked={labelType === 'full'}
                    onChange={(e) => setLabelType(e.target.value as LabelType)}
                  />
                  <span>Completa (Detalhada)</span>
                </label>
                <label className="radio-option">
                  <input
                    type="radio"
                    value="compact"
                    checked={labelType === 'compact'}
                    onChange={(e) => setLabelType(e.target.value as LabelType)}
                  />
                  <span>Compacta (Térmica)</span>
                </label>
              </div>
            </div>

            {labelType === 'full' && (
              <div className="control-group">
                <label className="text-sm font-medium text-slate-700">Tamanho</label>
                <div className="radio-group">
                  <label className="radio-option">
                    <input
                      type="radio"
                      value="small"
                      checked={labelSize === 'small'}
                      onChange={(e) => setLabelSize(e.target.value as LabelSize)}
                    />
                    <span>Pequeno</span>
                  </label>
                  <label className="radio-option">
                    <input
                      type="radio"
                      value="large"
                      checked={labelSize === 'large'}
                      onChange={(e) => setLabelSize(e.target.value as LabelSize)}
                    />
                    <span>Grande</span>
                  </label>
                </div>
              </div>
            )}

            <button
              onClick={handlePrint}
              className="print-button"
            >
              <Printer className="w-4 h-4" />
              Imprimir Todas
            </button>
          </div>

          <div className="print-preview-scroll">
            <div className={`labels-grid ${getLabelSizeClass()}`}>
              {packagedUnits.map((unit) => (
                <div key={unit.id} className="label-wrapper">
                  {labelType === 'full' ? (
                    <FullPackageLabel packagedUnit={unit} />
                  ) : (
                    <CompactPackageLabel packagedUnit={unit} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={`print-only ${getLabelSizeClass()}`}>
        {packagedUnits.map((unit, index) => (
          <div key={unit.id} className="print-page">
            {labelType === 'full' ? (
              <FullPackageLabel packagedUnit={unit} />
            ) : (
              <CompactPackageLabel packagedUnit={unit} />
            )}
          </div>
        ))}
      </div>
    </>
  );
}
