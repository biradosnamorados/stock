import { useEffect, useState, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Plus, Package, Trash2, CreditCard as Edit3, Download, Filter } from 'lucide-react';
import SmartPackagingWorkflow from '../components/SmartPackagingWorkflow';
import QRCode from 'qrcode';
import { generateLabelCSV, downloadCSV, formatLabelDate, formatWeight, type LabelData } from '../lib/csv-export';

interface ProductionBatch {
  id: string;
  batch_code: string;
  product_id: string;
  production_date: string;
  expiry_date: string | null;
  location_id: string;
  total_produced_quantity: number | null;
  products: {
    id: string;
    code: string;
    name: string;
    unit: string;
    requires_weight: boolean;
    packaging_unit_type: string;
    standard_package_quantity: number;
    allow_remainder_package: boolean;
  };
}

interface PackagedUnit {
  id: string;
  unique_code: string;
  display_code: string;
  weight: number | null;
  unit: string | null;
  status: string;
  created_at: string;
  batch_id: string;
  production_batches: {
    batch_code: string;
    production_date: string;
    expiry_date: string | null;
    products: {
      name: string;
      code: string;
    };
  };
}

interface PackageInput {
  weight: string;
  uniqueCode: string;
  displayCode: string;
}

export default function Packaging() {
  const { profile } = useAuth();
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [packages, setPackages] = useState<PackagedUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showWeightForm, setShowWeightForm] = useState(false);
  const [packageInputs, setPackageInputs] = useState<PackageInput[]>([]);
  const [editingWeight, setEditingWeight] = useState<{ id: string; weight: string } | null>(null);
  const [showSmartWorkflow, setShowSmartWorkflow] = useState(false);
  const [selectedBatchForSmart, setSelectedBatchForSmart] = useState<ProductionBatch | null>(null);
  const [selectedPackages, setSelectedPackages] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({
    product: '',
    batch: '',
    dateFrom: '',
    dateTo: '',
  });

  const [formData, setFormData] = useState({
    batch_id: '',
    quantity: '1',
  });

  useEffect(() => {
    loadData();
  }, [profile]);

  const loadData = async () => {
    try {
      const [batchesRes, packagesRes] = await Promise.all([
        supabase
          .from('production_batches')
          .select('*, products(id, code, name, unit, requires_weight, packaging_unit_type, standard_package_quantity, allow_remainder_package)')
          .eq('status', 'active')
          .order('created_at', { ascending: false }),
        supabase
          .from('packaged_units')
          .select('*, production_batches(batch_code, production_date, expiry_date, products(name, code))')
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      if (batchesRes.data) setBatches(batchesRes.data as ProductionBatch[]);
      if (packagesRes.data) setPackages(packagesRes.data as PackagedUnit[]);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredPackages = packages.filter(pkg => {
    if (filters.product && !pkg.production_batches.products.name.toLowerCase().includes(filters.product.toLowerCase())) {
      return false;
    }
    if (filters.batch && !pkg.production_batches.batch_code.toLowerCase().includes(filters.batch.toLowerCase())) {
      return false;
    }
    if (filters.dateFrom && pkg.created_at < filters.dateFrom) {
      return false;
    }
    if (filters.dateTo && pkg.created_at > filters.dateTo + 'T23:59:59') {
      return false;
    }
    return true;
  });

  const generateDisplayCode = (batchCode: string, sequence: number): string => {
    return `${batchCode}-${String(sequence).padStart(3, '0')}`;
  };

  const handleBatchSelect = async (e: FormEvent) => {
    e.preventDefault();

    const batch = batches.find(b => b.id === formData.batch_id);
    if (!batch) return;

    if (batch.products.standard_package_quantity && batch.products.standard_package_quantity > 0) {
      setSelectedBatchForSmart(batch);
      setShowSmartWorkflow(true);
      setShowForm(false);
      return;
    }

    const quantity = parseInt(formData.quantity);
    const { count } = await supabase
      .from('packaged_units')
      .select('*', { count: 'exact', head: true });

    const startingNumber = (count || 0) + 1;
    const inputs: PackageInput[] = [];

    for (let i = 0; i < quantity; i++) {
      const uniqueCode = `PK-${String(startingNumber + i).padStart(7, '0')}`;
      const displayCode = generateDisplayCode(batch.batch_code, i + 1);
      inputs.push({
        weight: '',
        uniqueCode,
        displayCode,
      });
    }

    setPackageInputs(inputs);
    setShowWeightForm(true);
  };

  const handleWeightChange = (index: number, weight: string) => {
    const updated = [...packageInputs];
    updated[index].weight = weight;
    setPackageInputs(updated);
  };

  const handleSubmitPackages = async () => {
    setSubmitting(true);

    try {
      const batch = batches.find(b => b.id === formData.batch_id);
      if (!batch) throw new Error('Batch not found');

      const packagesToCreate = await Promise.all(packageInputs.map(async (input) => {
        const qrCodeDataUrl = await QRCode.toDataURL(input.uniqueCode, {
          width: 256,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });

        return {
          unique_code: input.uniqueCode,
          display_code: input.displayCode,
          batch_id: batch.id,
          product_id: batch.product_id,
          weight: input.weight ? parseFloat(input.weight) : null,
          unit: batch.products.unit,
          status: 'in_stock',
          location_id: profile?.unit_id,
          created_by: profile?.id,
          qr_code: qrCodeDataUrl
        };
      }));

      const { error: insertError, data: createdPackages } = await supabase
        .from('packaged_units')
        .insert(packagesToCreate)
        .select(`
          id,
          unique_code,
          display_code,
          weight,
          unit,
          qr_code,
          products (id, name, code),
          production_batches (batch_code, production_date, expiry_date)
        `);

      if (insertError) throw insertError;

      await supabase.from('audit_logs').insert({
        user_id: profile?.id,
        action: 'create_packaged_units',
        entity: 'packaged_units',
        changes: { quantity: packageInputs.length, batch_id: batch.id },
      });


      setFormData({ batch_id: '', quantity: '1' });
      setShowForm(false);
      setShowWeightForm(false);
      setPackageInputs([]);
      loadData();
    } catch (err: any) {
      console.error('Error creating packages:', err);
      alert(err.message || 'Failed to create packages');
    } finally {
      setSubmitting(false);
    }
  };



  const togglePackageSelection = (pkgId: string) => {
    const newSelection = new Set(selectedPackages);
    if (newSelection.has(pkgId)) {
      newSelection.delete(pkgId);
    } else {
      newSelection.add(pkgId);
    }
    setSelectedPackages(newSelection);
  };

  const selectByBatch = (batchCode: string) => {
    const batchPackages = filteredPackages
      .filter(p => p.production_batches.batch_code === batchCode)
      .map(p => p.id);
    setSelectedPackages(new Set([...selectedPackages, ...batchPackages]));
  };

  const uniqueBatches = Array.from(new Set(filteredPackages.map(p => p.production_batches.batch_code)));

  const handleDelete = async (pkgId: string, displayCode: string) => {
    const confirmMsg = `Tem a certeza que deseja eliminar a embalagem "${displayCode}"?\n\nATENÇÃO: Esta ação não pode ser desfeita!`;

    if (!confirm(confirmMsg)) return;

    try {
      const { error } = await supabase
        .from('packaged_units')
        .delete()
        .eq('id', pkgId);

      if (error) {
        console.error('Erro ao eliminar embalagem:', error);
        alert('Erro ao eliminar embalagem: ' + error.message);
      } else {
        setPackages(packages.filter(p => p.id !== pkgId));
      }
    } catch (err) {
      console.error('Erro inesperado:', err);
      alert('Erro inesperado ao eliminar embalagem');
    }
  };

  const handleEditWeight = (pkg: PackagedUnit) => {
    setEditingWeight({
      id: pkg.id,
      weight: pkg.weight?.toString() || '',
    });
  };

  const handleSaveWeight = async () => {
    if (!editingWeight) return;

    try {
      const weight = editingWeight.weight ? parseFloat(editingWeight.weight) : null;

      const { error } = await supabase
        .from('packaged_units')
        .update({ weight, updated_at: new Date().toISOString() })
        .eq('id', editingWeight.id);

      if (error) throw error;

      await supabase.from('audit_logs').insert({
        user_id: profile?.id,
        action: 'update_package_weight',
        entity: 'packaged_units',
        entity_id: editingWeight.id,
        changes: { weight },
      });

      setPackages(packages.map(p =>
        p.id === editingWeight.id ? { ...p, weight } : p
      ));
      setEditingWeight(null);
    } catch (err: any) {
      console.error('Erro ao atualizar peso:', err);
      alert('Erro ao atualizar peso: ' + err.message);
    }
  };

  const handleCancelEditWeight = () => {
    setEditingWeight(null);
  };

  const handleExportSelectedCSV = async () => {
    if (selectedPackages.size === 0) {
      alert('Selecione pelo menos uma embalagem para exportar');
      return;
    }

    const { data } = await supabase
      .from('packaged_units')
      .select(`
        id,
        unique_code,
        display_code,
        weight,
        unit,
        products (name, code),
        production_batches (batch_code, production_date, expiry_date)
      `)
      .in('id', Array.from(selectedPackages));

    if (data && data.length > 0) {
      const labels: LabelData[] = data.map(pkg => ({
        product_name: pkg.products?.name || '',
        code_short: pkg.products?.code || '',
        package_code: pkg.display_code || '',
        batch: pkg.production_batches?.batch_code || '',
        production_date: formatLabelDate(pkg.production_batches?.production_date || null),
        expiry_date: formatLabelDate(pkg.production_batches?.expiry_date || null),
        weight: formatWeight(pkg.weight, pkg.unit),
        internal_code: pkg.unique_code || '',
        qr_value: pkg.unique_code || ''
      }));

      const csvContent = generateLabelCSV(labels);
      const batchCode = data[0]?.production_batches?.batch_code || 'selected';
      const filename = `labels_${batchCode.replace(/\//g, '-')}.csv`;
      downloadCSV(csvContent, filename);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">A carregar dados de embalamento...</p>
        </div>
      </div>
    );
  }

  const selectedBatch = batches.find(b => b.id === formData.batch_id);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Embalamento</h1>
          <p className="text-slate-600 mt-2">Criar e gerir unidades embaladas</p>
        </div>
        <div className="flex items-center space-x-3">
          {selectedPackages.size > 0 && (
            <button
              onClick={handleExportSelectedCSV}
              className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition"
            >
              <Download className="w-5 h-5" />
              <span>Exportar Etiquetas CSV ({selectedPackages.size})</span>
            </button>
          )}
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
          >
            <Plus className="w-5 h-5" />
            <span>Nova Embalagem</span>
          </button>
        </div>
      </div>

      {showForm && !showWeightForm && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Criar Unidades Embaladas</h2>

          <form onSubmit={handleBatchSelect} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Lote de Produção
              </label>
              <select
                required
                value={formData.batch_id}
                onChange={(e) => setFormData({ ...formData, batch_id: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Selecione um lote</option>
                {batches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.batch_code} - {batch.products.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Quantidade de Embalagens
              </label>
              <input
                type="number"
                min="1"
                max="100"
                required
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="flex space-x-3">
              <button
                type="submit"
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
              >
                Continuar
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {showWeightForm && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            Introduzir Peso das Embalagens
          </h2>
          <p className="text-sm text-slate-600 mb-4">
            {selectedBatch?.products.requires_weight
              ? 'Introduza o peso de cada embalagem individualmente'
              : 'Confirme a criação das embalagens'}
          </p>

          <div className="space-y-3 max-h-96 overflow-y-auto mb-4">
            {packageInputs.map((input, index) => (
              <div key={index} className="flex items-center space-x-3 p-3 bg-slate-50 rounded-lg">
                <div className="flex-1">
                  <span className="font-mono text-sm font-medium text-slate-800">
                    {input.displayCode}
                  </span>
                </div>
                {selectedBatch?.products.requires_weight && (
                  <div className="w-40">
                    <input
                      type="number"
                      step="0.001"
                      required
                      value={input.weight}
                      onChange={(e) => handleWeightChange(index, e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      placeholder={`Peso (${selectedBatch.products.unit})`}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex space-x-3">
            <button
              type="button"
              onClick={handleSubmitPackages}
              disabled={submitting}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition disabled:opacity-50"
            >
              {submitting ? 'A criar...' : 'Criar Embalagens'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowWeightForm(false);
                setPackageInputs([]);
              }}
              className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
            >
              Voltar
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200 bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Filtros</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Produto</label>
              <input
                type="text"
                placeholder="Filtrar por produto..."
                value={filters.product}
                onChange={(e) => setFilters({ ...filters, product: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Lote</label>
              <input
                type="text"
                placeholder="Filtrar por lote..."
                value={filters.batch}
                onChange={(e) => setFilters({ ...filters, batch: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Data Início</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Data Fim</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-slate-600">Seleção rápida:</span>
                <button
                  onClick={() => setSelectedPackages(new Set(filteredPackages.map(p => p.id)))}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium px-2 py-1 hover:bg-blue-50 rounded"
                >
                  Todos Visíveis
                </button>
                <button
                  onClick={() => setSelectedPackages(new Set())}
                  className="text-sm text-slate-600 hover:text-slate-700 font-medium px-2 py-1 hover:bg-slate-100 rounded"
                >
                  Desmarcar Todos
                </button>
              </div>
              <div className="flex items-center space-x-4">
                {(filters.product || filters.batch || filters.dateFrom || filters.dateTo) && (
                  <>
                    <p className="text-sm text-slate-600">
                      A mostrar {filteredPackages.length} de {packages.length} embalagens
                    </p>
                    <button
                      onClick={() => setFilters({ product: '', batch: '', dateFrom: '', dateTo: '' })}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Limpar filtros
                    </button>
                  </>
                )}
              </div>
            </div>
            {uniqueBatches.length > 0 && (
              <div className="flex items-center space-x-2 flex-wrap gap-2">
                <span className="text-sm text-slate-600">Por lote:</span>
                {uniqueBatches.map(batchCode => {
                  const batchCount = filteredPackages.filter(p => p.production_batches.batch_code === batchCode).length;
                  return (
                    <button
                      key={batchCode}
                      onClick={() => selectByBatch(batchCode)}
                      className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded border border-slate-300 transition"
                    >
                      {batchCode} ({batchCount})
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700 w-12">
                  <input
                    type="checkbox"
                    checked={selectedPackages.size === filteredPackages.length && filteredPackages.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedPackages(new Set(filteredPackages.map(p => p.id)));
                      } else {
                        setSelectedPackages(new Set());
                      }
                    }}
                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                  />
                </th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Código da Embalagem</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Produto</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Lote</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Peso</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Estado</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredPackages.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    <Package className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                    <p>{packages.length === 0 ? 'Ainda não há unidades embaladas' : 'Nenhuma embalagem encontrada com os filtros aplicados'}</p>
                  </td>
                </tr>
              ) : (
                filteredPackages.map((pkg) => (
                  <tr key={pkg.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedPackages.has(pkg.id)}
                        onChange={() => togglePackageSelection(pkg.id)}
                        className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm font-medium text-slate-800">
                        {pkg.display_code}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-slate-800">
                          {pkg.production_batches.products.name}
                        </p>
                        <p className="text-sm text-slate-500">
                          {pkg.production_batches.products.code}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm text-slate-600">
                        {pkg.production_batches.batch_code}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {editingWeight?.id === pkg.id ? (
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            step="0.001"
                            value={editingWeight.weight}
                            onChange={(e) => setEditingWeight({ ...editingWeight, weight: e.target.value })}
                            className="w-32 px-3 py-1 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            placeholder={pkg.unit || 'kg'}
                            autoFocus
                          />
                          <button
                            onClick={handleSaveWeight}
                            className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm transition"
                          >
                            Guardar
                          </button>
                          <button
                            onClick={handleCancelEditWeight}
                            className="px-3 py-1 border border-slate-300 rounded-lg hover:bg-slate-50 text-sm transition"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-slate-600">
                            {pkg.weight ? `${pkg.weight} ${pkg.unit}` : 'N/A'}
                          </span>
                          <button
                            onClick={() => handleEditWeight(pkg)}
                            className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                            title="Editar peso"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                        pkg.status === 'in_stock'
                          ? 'bg-green-50 text-green-700'
                          : pkg.status === 'shipped'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {pkg.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleDelete(pkg.id, pkg.display_code)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showSmartWorkflow && selectedBatchForSmart && (
        <SmartPackagingWorkflow
          batch={selectedBatchForSmart}
          onComplete={async () => {
            setShowSmartWorkflow(false);
            setSelectedBatchForSmart(null);
            setFormData({ batch_id: '', quantity: '1' });
            await loadData();
          }}
          onCancel={() => {
            setShowSmartWorkflow(false);
            setSelectedBatchForSmart(null);
            setShowForm(true);
          }}
        />
      )}
    </div>
  );
}
