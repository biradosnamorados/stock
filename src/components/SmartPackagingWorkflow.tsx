import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Package, Plus, Minus, AlertCircle } from 'lucide-react';
import QRCode from 'qrcode';

interface Product {
  id: string;
  name: string;
  code: string;
  packaging_unit_type: string;
  standard_package_quantity: number;
  allow_remainder_package: boolean;
}

interface ProductionBatch {
  id: string;
  batch_code: string;
  product_id: string;
  production_date: string;
  expiry_date: string | null;
  location_id: string;
  total_produced_quantity: number | null;
  products: Product;
}

interface PackagingCalculation {
  standardPackages: number;
  remainderQuantity: number;
  totalQuantity: number;
}

interface SmartPackagingWorkflowProps {
  batch: ProductionBatch;
  onComplete: () => void;
  onCancel: () => void;
}

export default function SmartPackagingWorkflow({ batch, onComplete, onCancel }: SmartPackagingWorkflowProps) {
  const [step, setStep] = useState<'quantity' | 'confirm' | 'processing'>('quantity');
  const [totalQuantity, setTotalQuantity] = useState(batch.total_produced_quantity?.toString() || '');
  const [standardPackages, setStandardPackages] = useState('');
  const [hasRemainder, setHasRemainder] = useState(false);
  const [remainderQuantity, setRemainderQuantity] = useState('');
  const [calculation, setCalculation] = useState<PackagingCalculation | null>(null);
  const [processing, setProcessing] = useState(false);
  const [createdPackages, setCreatedPackages] = useState<any[]>([]);

  useEffect(() => {
    if (totalQuantity && batch.products.standard_package_quantity) {
      const total = parseFloat(totalQuantity);
      const standardQty = batch.products.standard_package_quantity;

      const calculatedStandard = Math.floor(total / standardQty);
      const calculatedRemainder = total - (calculatedStandard * standardQty);

      setStandardPackages(calculatedStandard.toString());

      if (calculatedRemainder > 0.001) {
        setHasRemainder(true);
        setRemainderQuantity(calculatedRemainder.toFixed(3));
      } else {
        setHasRemainder(false);
        setRemainderQuantity('');
      }

      setCalculation({
        standardPackages: calculatedStandard,
        remainderQuantity: calculatedRemainder,
        totalQuantity: total
      });
    }
  }, [totalQuantity, batch.products.standard_package_quantity]);

  const handleContinue = () => {
    if (!totalQuantity || parseFloat(totalQuantity) <= 0) {
      alert('Por favor insira a quantidade total produzida');
      return;
    }

    if (!standardPackages || parseInt(standardPackages) < 0) {
      alert('Por favor insira o número de embalagens padrão');
      return;
    }

    if (hasRemainder && (!remainderQuantity || parseFloat(remainderQuantity) <= 0)) {
      alert('Por favor insira a quantidade da embalagem divergente');
      return;
    }

    setStep('confirm');
  };

  const generateUniqueCode = () => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000);
    return `PKG-${timestamp}-${random}`;
  };

  const generateDisplayCode = (batchCode: string, index: number, isRemainder: boolean = false) => {
    if (isRemainder) {
      return `${batchCode}-R`;
    }
    return `${batchCode}-${String(index).padStart(3, '0')}`;
  };

  const handleConfirm = async () => {
    setStep('processing');
    setProcessing(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Utilizador não autenticado');

      const standardQty = batch.products.standard_package_quantity;
      const numStandard = parseInt(standardPackages);
      const remainderQty = hasRemainder ? parseFloat(remainderQuantity) : 0;

      const packagesToCreate = [];

      for (let i = 1; i <= numStandard; i++) {
        const uniqueCode = generateUniqueCode();
        const displayCode = generateDisplayCode(batch.batch_code, i);

        const qrCodeDataUrl = await QRCode.toDataURL(uniqueCode, {
          width: 256,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });

        packagesToCreate.push({
          unique_code: uniqueCode,
          display_code: displayCode,
          batch_id: batch.id,
          product_id: batch.product_id,
          weight: standardQty,
          unit: batch.products.packaging_unit_type,
          status: 'in_stock',
          location_id: batch.location_id,
          created_by: user.id,
          qr_code: qrCodeDataUrl
        });
      }

      if (hasRemainder && remainderQty > 0) {
        const uniqueCode = generateUniqueCode();
        const displayCode = generateDisplayCode(batch.batch_code, 0, true);

        const qrCodeDataUrl = await QRCode.toDataURL(uniqueCode, {
          width: 256,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });

        packagesToCreate.push({
          unique_code: uniqueCode,
          display_code: displayCode,
          batch_id: batch.id,
          product_id: batch.product_id,
          weight: remainderQty,
          unit: batch.products.packaging_unit_type,
          status: 'in_stock',
          location_id: batch.location_id,
          created_by: user.id,
          qr_code: qrCodeDataUrl
        });
      }

      const { data: insertedPackages, error: insertError } = await supabase
        .from('packaged_units')
        .insert(packagesToCreate)
        .select(`
          *,
          products (id, name, code),
          production_batches (batch_code, production_date, expiry_date)
        `);

      if (insertError) throw insertError;

      const { error: updateError } = await supabase
        .from('production_batches')
        .update({
          total_produced_quantity: parseFloat(totalQuantity),
          status: 'completed'
        })
        .eq('id', batch.id);

      if (updateError) throw updateError;

      setCreatedPackages(insertedPackages || []);
      onComplete();
    } catch (error) {
      console.error('Erro ao criar embalagens:', error);
      alert('Erro ao criar embalagens. Por favor tente novamente.');
      setStep('confirm');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-xl font-semibold text-slate-800">
            Embalamento Inteligente
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Lote: {batch.batch_code} - {batch.products.name}
          </p>
        </div>

        <div className="p-6">
          {step === 'quantity' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Quantidade Total Produzida *
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={totalQuantity}
                    onChange={(e) => setTotalQuantity(e.target.value)}
                    className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Ex: 15.13"
                    autoFocus
                  />
                  <span className="text-sm font-medium text-slate-600 min-w-[60px]">
                    {batch.products.packaging_unit_type}
                  </span>
                </div>
              </div>

              {calculation && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-blue-900 mb-2">
                        Cálculo Automático
                      </h3>
                      <div className="space-y-2 text-sm text-blue-800">
                        <p>
                          <span className="font-medium">Embalagens padrão:</span>{' '}
                          {calculation.standardPackages} × {batch.products.standard_package_quantity} {batch.products.packaging_unit_type}
                        </p>
                        {calculation.remainderQuantity > 0.001 && (
                          <p>
                            <span className="font-medium">Embalagem divergente:</span>{' '}
                            {calculation.remainderQuantity.toFixed(3)} {batch.products.packaging_unit_type}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Número de Embalagens Padrão ({batch.products.standard_package_quantity} {batch.products.packaging_unit_type})
                </label>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setStandardPackages(Math.max(0, parseInt(standardPackages || '0') - 1).toString())}
                    className="p-2 border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    min="0"
                    value={standardPackages}
                    onChange={(e) => setStandardPackages(e.target.value)}
                    className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center"
                  />
                  <button
                    type="button"
                    onClick={() => setStandardPackages((parseInt(standardPackages || '0') + 1).toString())}
                    className="p-2 border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {batch.products.allow_remainder_package && (
                <div>
                  <label className="flex items-center space-x-3 mb-3">
                    <input
                      type="checkbox"
                      checked={hasRemainder}
                      onChange={(e) => setHasRemainder(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-slate-700">
                      Existe embalagem divergente (resto)?
                    </span>
                  </label>

                  {hasRemainder && (
                    <div className="flex items-center space-x-2 ml-7">
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={remainderQuantity}
                        onChange={(e) => setRemainderQuantity(e.target.value)}
                        className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Quantidade divergente"
                      />
                      <span className="text-sm font-medium text-slate-600 min-w-[60px]">
                        {batch.products.packaging_unit_type}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-6">
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">
                  Resumo do Embalamento
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Quantidade total:</span>
                    <span className="font-medium text-slate-800">
                      {totalQuantity} {batch.products.packaging_unit_type}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Embalagens padrão:</span>
                    <span className="font-medium text-slate-800">
                      {standardPackages} × {batch.products.standard_package_quantity} {batch.products.packaging_unit_type}
                    </span>
                  </div>
                  {hasRemainder && remainderQuantity && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Embalagem divergente:</span>
                      <span className="font-medium text-slate-800">
                        1 × {remainderQuantity} {batch.products.packaging_unit_type}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t border-slate-200">
                    <span className="text-slate-600">Total de embalagens:</span>
                    <span className="font-semibold text-slate-800">
                      {parseInt(standardPackages) + (hasRemainder && remainderQuantity ? 1 : 0)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <Package className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 text-sm text-blue-800">
                    <p className="font-medium mb-1">O que será criado:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>{standardPackages} embalagens padrão com código QR único</li>
                      {hasRemainder && remainderQuantity && (
                        <li>1 embalagem divergente com código QR único</li>
                      )}
                      <li>Todas associadas ao lote {batch.batch_code}</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 'processing' && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-slate-600">A criar embalagens...</p>
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-3 p-6 border-t border-slate-200">
          {step === 'quantity' && (
            <>
              <button
                onClick={onCancel}
                className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleContinue}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
              >
                Continuar
              </button>
            </>
          )}
          {step === 'confirm' && (
            <>
              <button
                onClick={() => setStep('quantity')}
                className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition"
              >
                Voltar
              </button>
              <button
                onClick={handleConfirm}
                disabled={processing}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition disabled:opacity-50"
              >
                Confirmar Embalamento
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
