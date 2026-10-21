import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Upload, Download, FileText, AlertCircle, CheckCircle, X } from 'lucide-react';

interface ImportResult {
  success: number;
  errors: string[];
  warnings: string[];
}

export default function Import() {
  const [activeTab, setActiveTab] = useState<'suppliers' | 'products' | 'associations'>('suppliers');
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const downloadTemplate = (type: 'suppliers' | 'products' | 'associations') => {
    let csvContent = '';
    let filename = '';

    if (type === 'suppliers') {
      csvContent = `code,name,type,email,phone,address,contact_person,active
FORN001,Fornecedor Exemplo,external,fornecedor@email.com,912345678,Rua Exemplo 123,João Silva,true
FORN002,Distribuidor ABC,external,distribuidor@email.com,913456789,Avenida Central 456,Maria Santos,true
CDP,Centro de Produção,internal,cdp@empresa.com,914567890,Instalações CDP,Pedro Costa,true`;
      filename = 'template_fornecedores.csv';
    } else if (type === 'products') {
      csvContent = `code,name,source_type,unit,shelf_life_days,storage_type,purchase_unit,purchase_unit_quantity,requires_expiry,requires_packaging,is_recipe_input,is_recipe_output,is_distributable,tracking_level,description
PROD001,Produto Comprado CDO,cdo_purchased,kg,30,refrigerated,caixa,10,true,false,true,false,true,full,Produto comprado pela CDO para distribuir
PROD002,Produto Compra Direta,direct_purchase,L,60,ambient,garrafa,12,true,false,true,false,false,simple,Produto comprado diretamente pelo restaurante
CDP001,Produto CDP Embalado,cdp_produced,kg,15,frozen,,,,true,true,false,true,true,full,Produto produzido e embalado na CDP
ING001,Ingrediente Matéria-Prima,ingredient,kg,90,refrigerated,saco,25,true,false,true,false,false,simple,Ingrediente para usar em receitas`;
      filename = 'template_produtos.csv';
    } else {
      csvContent = `product_code,supplier_code,supplier_product_code,current_price,price_unit,min_order_quantity,lead_time_days,is_preferred
PROD001,FORN001,FORN-PROD-001,25.50,kg,10,3,true
PROD001,FORN002,ABC-PROD-001,26.00,kg,5,2,false
PROD002,FORN001,FORN-PROD-002,12.75,L,20,3,true`;
      filename = 'template_associacoes_produto_fornecedor.csv';
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
    }
  };

  const parseCSV = (text: string): string[][] => {
    const lines = text.split('\n').filter(line => line.trim());
    return lines.map(line => {
      const values: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());

      return values;
    });
  };

  const importSuppliers = async (rows: string[][]) => {
    const headers = rows[0];
    const dataRows = rows.slice(1);
    const errors: string[] = [];
    const warnings: string[] = [];
    let success = 0;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNum = i + 2;

      if (row.length < headers.length) {
        errors.push(`Linha ${rowNum}: Número de colunas inválido`);
        continue;
      }

      const supplier: any = {};
      headers.forEach((header, idx) => {
        supplier[header.trim()] = row[idx]?.trim() || null;
      });

      if (!supplier.code || !supplier.name || !supplier.type) {
        errors.push(`Linha ${rowNum}: Campos obrigatórios faltando (code, name, type)`);
        continue;
      }

      if (!['external', 'internal'].includes(supplier.type)) {
        errors.push(`Linha ${rowNum}: Tipo inválido. Use 'external' ou 'internal'`);
        continue;
      }

      try {
        const { error } = await supabase
          .from('suppliers')
          .upsert({
            code: supplier.code,
            name: supplier.name,
            type: supplier.type,
            email: supplier.email,
            phone: supplier.phone,
            address: supplier.address,
            contact_person: supplier.contact_person,
            active: supplier.active === 'true' || supplier.active === '1',
          }, {
            onConflict: 'code'
          });

        if (error) {
          errors.push(`Linha ${rowNum}: ${error.message}`);
        } else {
          success++;
        }
      } catch (err) {
        errors.push(`Linha ${rowNum}: Erro inesperado - ${err}`);
      }
    }

    return { success, errors, warnings };
  };

  const importProducts = async (rows: string[][]) => {
    const headers = rows[0];
    const dataRows = rows.slice(1);
    const errors: string[] = [];
    const warnings: string[] = [];
    let success = 0;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNum = i + 2;

      if (row.length < headers.length) {
        errors.push(`Linha ${rowNum}: Número de colunas inválido`);
        continue;
      }

      const product: any = {};
      headers.forEach((header, idx) => {
        product[header.trim()] = row[idx]?.trim() || null;
      });

      if (!product.code || !product.name || !product.source_type || !product.unit) {
        errors.push(`Linha ${rowNum}: Campos obrigatórios faltando (code, name, source_type, unit)`);
        continue;
      }

      if (!['cdp_produced', 'cdo_purchased', 'direct_purchase', 'ingredient'].includes(product.source_type)) {
        errors.push(`Linha ${rowNum}: source_type inválido. Use 'cdp_produced', 'cdo_purchased', 'direct_purchase' ou 'ingredient'`);
        continue;
      }

      if (!['kg', 'g', 'L', 'ml', 'units'].includes(product.unit)) {
        errors.push(`Linha ${rowNum}: unit inválida. Use 'kg', 'g', 'L', 'ml' ou 'units'`);
        continue;
      }

      if (product.storage_type && !['frozen', 'refrigerated', 'ambient'].includes(product.storage_type)) {
        errors.push(`Linha ${rowNum}: storage_type inválido. Use 'frozen', 'refrigerated' ou 'ambient'`);
        continue;
      }

      if (product.tracking_level && !['full', 'simple'].includes(product.tracking_level)) {
        errors.push(`Linha ${rowNum}: tracking_level inválido. Use 'full' ou 'simple'`);
        continue;
      }

      try {
        const { error } = await supabase
          .from('products')
          .upsert({
            code: product.code,
            name: product.name,
            source_type: product.source_type,
            unit: product.unit,
            shelf_life_days: product.shelf_life_days ? parseInt(product.shelf_life_days) : null,
            storage_type: product.storage_type,
            purchase_unit: product.purchase_unit || null,
            purchase_unit_quantity: product.purchase_unit_quantity ? parseFloat(product.purchase_unit_quantity) : 1,
            description: product.description || null,
            requires_expiry: product.requires_expiry === 'true' || product.requires_expiry === '1' || product.requires_expiry === true,
            requires_packaging: product.requires_packaging === 'true' || product.requires_packaging === '1' || product.requires_packaging === true,
            is_recipe_input: product.is_recipe_input === 'true' || product.is_recipe_input === '1' || product.is_recipe_input === true,
            is_recipe_output: product.is_recipe_output === 'true' || product.is_recipe_output === '1' || product.is_recipe_output === true,
            is_distributable: product.is_distributable === 'true' || product.is_distributable === '1' || product.is_distributable === true,
            tracking_level: product.tracking_level || 'full',
            // Legacy fields for compatibility
            product_type: product.source_type === 'cdp_produced' ? 'cdp_produced' : 'purchased',
            produced_in_cdp: product.source_type === 'cdp_produced',
            purchasable: ['cdo_purchased', 'direct_purchase'].includes(product.source_type),
            requires_batch: product.source_type === 'cdp_produced',
            active: true,
          }, {
            onConflict: 'code'
          });

        if (error) {
          errors.push(`Linha ${rowNum}: ${error.message}`);
        } else {
          success++;
        }
      } catch (err) {
        errors.push(`Linha ${rowNum}: Erro inesperado - ${err}`);
      }
    }

    return { success, errors, warnings };
  };

  const importAssociations = async (rows: string[][]) => {
    const headers = rows[0];
    const dataRows = rows.slice(1);
    const errors: string[] = [];
    const warnings: string[] = [];
    let success = 0;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNum = i + 2;

      if (row.length < headers.length) {
        errors.push(`Linha ${rowNum}: Número de colunas inválido`);
        continue;
      }

      const assoc: any = {};
      headers.forEach((header, idx) => {
        assoc[header.trim()] = row[idx]?.trim() || null;
      });

      if (!assoc.product_code || !assoc.supplier_code) {
        errors.push(`Linha ${rowNum}: Campos obrigatórios faltando (product_code, supplier_code)`);
        continue;
      }

      try {
        const { data: product, error: productError } = await supabase
          .from('products')
          .select('id')
          .eq('code', assoc.product_code)
          .maybeSingle();

        if (productError || !product) {
          errors.push(`Linha ${rowNum}: Produto '${assoc.product_code}' não encontrado`);
          continue;
        }

        const { data: supplier, error: supplierError } = await supabase
          .from('suppliers')
          .select('id')
          .eq('code', assoc.supplier_code)
          .maybeSingle();

        if (supplierError || !supplier) {
          errors.push(`Linha ${rowNum}: Fornecedor '${assoc.supplier_code}' não encontrado`);
          continue;
        }

        const { data: existing } = await supabase
          .from('purchased_product_suppliers')
          .select('id')
          .eq('product_id', product.id)
          .eq('supplier_id', supplier.id)
          .maybeSingle();

        const dataToInsert = {
          product_id: product.id,
          supplier_id: supplier.id,
          supplier_product_code: assoc.supplier_product_code,
          current_price: assoc.current_price ? parseFloat(assoc.current_price) : null,
          price_unit: assoc.price_unit || null,
          min_order_quantity: assoc.min_order_quantity ? parseFloat(assoc.min_order_quantity) : null,
          lead_time_days: assoc.lead_time_days ? parseInt(assoc.lead_time_days) : null,
          is_preferred: assoc.is_preferred === 'true' || assoc.is_preferred === '1',
          active: true,
        };

        if (existing) {
          const { error } = await supabase
            .from('purchased_product_suppliers')
            .update(dataToInsert)
            .eq('id', existing.id);

          if (error) {
            errors.push(`Linha ${rowNum}: ${error.message}`);
          } else {
            success++;
          }
        } else {
          const { error } = await supabase
            .from('purchased_product_suppliers')
            .insert(dataToInsert);

          if (error) {
            errors.push(`Linha ${rowNum}: ${error.message}`);
          } else {
            success++;
          }
        }
      } catch (err) {
        errors.push(`Linha ${rowNum}: Erro inesperado - ${err}`);
      }
    }

    return { success, errors, warnings };
  };

  const handleImport = async () => {
    if (!file) return;

    setImporting(true);
    setResult(null);

    try {
      const text = await file.text();
      const rows = parseCSV(text);

      if (rows.length < 2) {
        setResult({
          success: 0,
          errors: ['Arquivo vazio ou sem dados'],
          warnings: []
        });
        return;
      }

      let importResult: ImportResult;

      if (activeTab === 'suppliers') {
        importResult = await importSuppliers(rows);
      } else if (activeTab === 'products') {
        importResult = await importProducts(rows);
      } else {
        importResult = await importAssociations(rows);
      }

      setResult(importResult);
    } catch (err) {
      setResult({
        success: 0,
        errors: [`Erro ao processar arquivo: ${err}`],
        warnings: []
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800">Importação de Dados</h1>
        <p className="text-slate-600 mt-2">Importe fornecedores e produtos em massa via arquivo CSV</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-200">
          <div className="flex">
            <button
              onClick={() => setActiveTab('suppliers')}
              className={`flex-1 px-6 py-4 text-sm font-medium transition ${
                activeTab === 'suppliers'
                  ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                  : 'bg-slate-50 text-slate-600 hover:text-slate-800'
              }`}
            >
              Fornecedores
            </button>
            <button
              onClick={() => setActiveTab('products')}
              className={`flex-1 px-6 py-4 text-sm font-medium transition ${
                activeTab === 'products'
                  ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                  : 'bg-slate-50 text-slate-600 hover:text-slate-800'
              }`}
            >
              Produtos
            </button>
            <button
              onClick={() => setActiveTab('associations')}
              className={`flex-1 px-6 py-4 text-sm font-medium transition ${
                activeTab === 'associations'
                  ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                  : 'bg-slate-50 text-slate-600 hover:text-slate-800'
              }`}
            >
              Produto-Fornecedor
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="mb-6">
            <div className="flex items-start space-x-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <FileText className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-medium text-blue-900 mb-2">Como usar:</h3>
                <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                  <li>Baixe o arquivo de exemplo clicando no botão abaixo</li>
                  <li>Preencha o arquivo com seus dados (não altere os cabeçalhos)</li>
                  <li>Salve o arquivo como CSV (separado por vírgulas)</li>
                  <li>Faça upload do arquivo preenchido</li>
                  <li>Clique em "Importar Dados"</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <button
              onClick={() => downloadTemplate(activeTab)}
              className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition"
            >
              <Download className="w-5 h-5" />
              <span>Baixar Template CSV</span>
            </button>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Selecione o arquivo CSV
            </label>
            <div className="relative">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="block w-full text-sm text-slate-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-lg file:border-0
                  file:text-sm file:font-medium
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100
                  cursor-pointer"
              />
            </div>
            {file && (
              <p className="mt-2 text-sm text-slate-600">
                Arquivo selecionado: <span className="font-medium">{file.name}</span>
              </p>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleImport}
              disabled={!file || importing}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Importando...</span>
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  <span>Importar Dados</span>
                </>
              )}
            </button>

            {file && !importing && (
              <button
                onClick={() => {
                  setFile(null);
                  setResult(null);
                }}
                className="flex items-center space-x-2 text-slate-600 hover:text-slate-800 px-4 py-3 rounded-lg transition"
              >
                <X className="w-5 h-5" />
                <span>Limpar</span>
              </button>
            )}
          </div>

          {result && (
            <div className="mt-6 space-y-4">
              {result.success > 0 && (
                <div className="flex items-start space-x-3 p-4 bg-green-50 rounded-lg border border-green-200">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h4 className="font-medium text-green-900">Sucesso!</h4>
                    <p className="text-sm text-green-800 mt-1">
                      {result.success} registro(s) importado(s) com sucesso
                    </p>
                  </div>
                </div>
              )}

              {result.errors.length > 0 && (
                <div className="flex items-start space-x-3 p-4 bg-red-50 rounded-lg border border-red-200">
                  <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h4 className="font-medium text-red-900 mb-2">
                      Erros ({result.errors.length})
                    </h4>
                    <div className="text-sm text-red-800 space-y-1 max-h-60 overflow-y-auto">
                      {result.errors.map((error, idx) => (
                        <div key={idx} className="flex items-start space-x-2">
                          <span className="font-mono">•</span>
                          <span>{error}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {result.warnings.length > 0 && (
                <div className="flex items-start space-x-3 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h4 className="font-medium text-yellow-900 mb-2">
                      Avisos ({result.warnings.length})
                    </h4>
                    <div className="text-sm text-yellow-800 space-y-1">
                      {result.warnings.map((warning, idx) => (
                        <div key={idx} className="flex items-start space-x-2">
                          <span className="font-mono">•</span>
                          <span>{warning}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 bg-slate-50 rounded-lg p-6 border border-slate-200">
        <h3 className="font-semibold text-slate-800 mb-4">Campos do CSV</h3>

        {activeTab === 'suppliers' ? (
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="font-medium text-slate-700">code</span>
                <span className="text-red-500">*</span>
                <p className="text-slate-600">Código único do fornecedor</p>
              </div>
              <div>
                <span className="font-medium text-slate-700">name</span>
                <span className="text-red-500">*</span>
                <p className="text-slate-600">Nome do fornecedor</p>
              </div>
              <div>
                <span className="font-medium text-slate-700">type</span>
                <span className="text-red-500">*</span>
                <p className="text-slate-600">external ou internal</p>
              </div>
              <div>
                <span className="font-medium text-slate-700">email</span>
                <p className="text-slate-600">Email de contato</p>
              </div>
              <div>
                <span className="font-medium text-slate-700">phone</span>
                <p className="text-slate-600">Telefone</p>
              </div>
              <div>
                <span className="font-medium text-slate-700">address</span>
                <p className="text-slate-600">Endereço</p>
              </div>
              <div>
                <span className="font-medium text-slate-700">contact_person</span>
                <p className="text-slate-600">Pessoa de contato</p>
              </div>
              <div>
                <span className="font-medium text-slate-700">active</span>
                <p className="text-slate-600">true ou false</p>
              </div>
            </div>
          </div>
        ) : activeTab === 'products' ? (
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="font-medium text-slate-700">code</span>
                <span className="text-red-500">*</span>
                <p className="text-slate-600">Código único do produto</p>
              </div>
              <div>
                <span className="font-medium text-slate-700">name</span>
                <span className="text-red-500">*</span>
                <p className="text-slate-600">Nome do produto</p>
              </div>
              <div>
                <span className="font-medium text-slate-700">source_type</span>
                <span className="text-red-500">*</span>
                <p className="text-slate-600">cdp_produced, cdo_purchased, direct_purchase, ingredient</p>
              </div>
              <div>
                <span className="font-medium text-slate-700">unit</span>
                <span className="text-red-500">*</span>
                <p className="text-slate-600">kg, g, L, ml ou units</p>
              </div>
              <div>
                <span className="font-medium text-slate-700">shelf_life_days</span>
                <p className="text-slate-600">Validade em dias</p>
              </div>
              <div>
                <span className="font-medium text-slate-700">storage_type</span>
                <p className="text-slate-600">frozen, refrigerated, ambient</p>
              </div>
              <div>
                <span className="font-medium text-slate-700">purchase_unit</span>
                <p className="text-slate-600">Ex: caixa, saco (comprados)</p>
              </div>
              <div>
                <span className="font-medium text-slate-700">purchase_unit_quantity</span>
                <p className="text-slate-600">Qtd por unidade (comprados)</p>
              </div>
              <div>
                <span className="font-medium text-slate-700">requires_expiry</span>
                <p className="text-slate-600">Controla validade (true/false)</p>
              </div>
              <div>
                <span className="font-medium text-slate-700">requires_packaging</span>
                <p className="text-slate-600">Requer embalagem QR (true/false)</p>
              </div>
              <div>
                <span className="font-medium text-slate-700">is_recipe_input</span>
                <p className="text-slate-600">Pode ser ingrediente (true/false)</p>
              </div>
              <div>
                <span className="font-medium text-slate-700">is_recipe_output</span>
                <p className="text-slate-600">É produzido de receita (true/false)</p>
              </div>
              <div>
                <span className="font-medium text-slate-700">is_distributable</span>
                <p className="text-slate-600">Pode distribuir (true/false)</p>
              </div>
              <div>
                <span className="font-medium text-slate-700">tracking_level</span>
                <p className="text-slate-600">full (lote+val) ou simple (qtd)</p>
              </div>
              <div className="col-span-2">
                <span className="font-medium text-slate-700">description</span>
                <p className="text-slate-600">Descrição do produto</p>
              </div>
            </div>
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>source_type:</strong><br/>
                • <strong>cdp_produced</strong>: Produto produzido e embalado na CDP<br/>
                • <strong>cdo_purchased</strong>: Produto comprado pela CDO para distribuir<br/>
                • <strong>direct_purchase</strong>: Produto comprado diretamente pela unidade<br/>
                • <strong>ingredient</strong>: Matéria-prima para usar em receitas
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <p className="text-slate-600 mb-4">
              Associe produtos aos seus fornecedores com informações de preço e condições de compra.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="font-medium text-slate-700">product_code</span>
                <span className="text-red-500">*</span>
                <p className="text-slate-600">Código do produto (deve existir)</p>
              </div>
              <div>
                <span className="font-medium text-slate-700">supplier_code</span>
                <span className="text-red-500">*</span>
                <p className="text-slate-600">Código do fornecedor (deve existir)</p>
              </div>
              <div>
                <span className="font-medium text-slate-700">supplier_product_code</span>
                <p className="text-slate-600">Código do produto no fornecedor</p>
              </div>
              <div>
                <span className="font-medium text-slate-700">current_price</span>
                <p className="text-slate-600">Preço atual</p>
              </div>
              <div>
                <span className="font-medium text-slate-700">price_unit</span>
                <p className="text-slate-600">Unidade do preço (kg, L, units...)</p>
              </div>
              <div>
                <span className="font-medium text-slate-700">min_order_quantity</span>
                <p className="text-slate-600">Quantidade mínima de encomenda</p>
              </div>
              <div>
                <span className="font-medium text-slate-700">lead_time_days</span>
                <p className="text-slate-600">Prazo de entrega em dias</p>
              </div>
              <div>
                <span className="font-medium text-slate-700">is_preferred</span>
                <p className="text-slate-600">Fornecedor preferencial (true/false)</p>
              </div>
            </div>
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>Importante:</strong> Os produtos e fornecedores devem existir antes de importar as associações.
                Importe primeiro os fornecedores e produtos, depois faça a associação.
              </p>
            </div>
          </div>
        )}

        <p className="text-xs text-slate-500 mt-4">
          <span className="text-red-500">*</span> Campos obrigatórios
        </p>
      </div>
    </div>
  );
}
