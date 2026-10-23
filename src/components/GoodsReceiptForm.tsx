import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { X, Plus, Trash2, AlertTriangle, Camera, Sparkles, FileText, Loader2, CheckCircle2 } from 'lucide-react';
import { compressImage } from '../lib/images';
import type { GoodsReceiptLine, PurchaseOrderForReceipt, ProductPurchaseConfig } from '../types/goods-receipts';

interface Supplier {
  id: string;
  name: string;
}

interface Product {
  id: string;
  code: string;
  name: string;
  unit: string;
}

interface GoodsReceiptFormProps {
  onClose: () => void;
  onSuccess: () => void;
  /** abrir já com esta encomenda escolhida (botão "Receber" na encomenda) */
  initialOrderId?: string;
}

interface InvoiceRead {
  invoice_number: string | null;
  invoice_date: string | null;
  supplier_name: string | null;
  total_with_vat: number | null;
  warnings?: string[];
  lines: Array<{
    description: string;
    quantity: number;
    unit: string | null;
    unit_price: number | null;
    batch: string | null;
    expiry_date: string | null;
    qty_in_purchase_units: number | null;
    price_per_purchase_unit: number | null;
    confidence: 'alta' | 'media' | 'baixa';
    product_id: string | null;
    order_line_id: string | null;
    product_name: string | null;
    product_code: string | null;
  }>;
}

export default function GoodsReceiptForm({ onClose, onSuccess, initialOrderId }: GoodsReceiptFormProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [receiptType, setReceiptType] = useState<'with_order' | 'without_order'>('with_order');
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderForReceipt[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [configsByProduct, setConfigsByProduct] = useState<Record<string, ProductPurchaseConfig[]>>({});
  const [selectedOrderId, setSelectedOrderId] = useState(initialOrderId ?? '');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [invoiceTotal, setInvoiceTotal] = useState<number | null>(null);
  const [photos, setPhotos] = useState<{ path: string; url: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [reading, setReading] = useState(false);
  const [readMsg, setReadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [invoiceRead, setInvoiceRead] = useState<InvoiceRead | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<GoodsReceiptLine[]>([]);
  const linesScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (receiptType === 'with_order') {
      loadPurchaseOrders();
      setLines([]);
    } else {
      loadSuppliers();
      setLines([createEmptyLine()]);
    }
  }, [receiptType, profile]);

  useEffect(() => {
    if (receiptType === 'without_order' && selectedSupplierId) {
      loadSupplierProducts(selectedSupplierId);
    } else {
      setProducts([]);
    }
  }, [receiptType, selectedSupplierId]);

  useEffect(() => {
    if (selectedOrderId) {
      loadOrderLines();
    }
  }, [selectedOrderId, purchaseOrders]);

  const loadPurchaseOrders = async () => {
    if (!profile?.unit_id) return;

    const { data, error } = await supabase
      .from('purchase_orders')
      .select(`
        id, order_number, supplier_id,
        suppliers(name),
        purchase_order_lines(
          id, product_id, quantity, unit,
          purchase_config_id, purchase_unit, purchase_unit_quantity,
          products(code, name, unit, purchase_unit, purchase_unit_quantity)
        )
      `)
      .eq('unit_id', profile.unit_id)
      .in('status', ['sent', 'confirmed', 'partially_received'])
      .order('order_date', { ascending: false });

    if (!error && data) {
      setPurchaseOrders(data as any);
    }
  };

  const loadSuppliers = async () => {
    if (!profile?.unit_id) return;

    const { data, error } = await supabase
      .from('suppliers')
      .select(`
        id, name,
        supplier_units!inner(unit_id)
      `)
      .eq('active', true)
      .eq('supplier_units.unit_id', profile.unit_id)
      .order('name');

    if (!error && data) {
      setSuppliers(data.map(s => ({ id: s.id, name: s.name })));
    }
  };

  const loadConfigsForProducts = async (productIds: string[]) => {
    if (productIds.length === 0) return;
    const { data } = await supabase
      .from('product_purchase_configs')
      .select('*')
      .in('product_id', productIds)
      .eq('active', true)
      .order('is_default', { ascending: false });

    if (data) {
      const map: Record<string, ProductPurchaseConfig[]> = {};
      data.forEach(c => {
        if (!map[c.product_id]) map[c.product_id] = [];
        map[c.product_id].push(c as ProductPurchaseConfig);
      });
      setConfigsByProduct(prev => ({ ...prev, ...map }));
    }
  };

  const loadSupplierProducts = async (supplierId: string) => {
    setProducts([]);

    const { data: associations, error: associationsError } = await supabase
      .from('supplier_products')
      .select('product_id')
      .eq('supplier_id', supplierId)
      .eq('active', true);

    if (associationsError) {
      console.error('Erro ao carregar associações do fornecedor:', associationsError);
      return;
    }

    const productIds = (associations || []).map((association) => association.product_id);
    if (productIds.length === 0) return;

    const { data: supplierProducts, error: productsError } = await supabase
      .from('products')
      .select('id, code, name, unit, active, product_type')
      .in('id', productIds)
      .eq('active', true)
      .in('product_type', ['purchased', 'consumable'])
      .order('name');

    if (productsError) {
      console.error('Erro ao carregar produtos do fornecedor:', productsError);
      return;
    }

    setProducts((supplierProducts || []) as Product[]);
    await loadConfigsForProducts(productIds);
  };

  const createEmptyLine = (): GoodsReceiptLine => ({
    product_id: '',
    qty_ordered: null,
    qty_received: 0,
    unit: 'un',
    unit_price: 0,
    batch_code: '',
    expiry_date: '',
    notes: '',
    purchase_config_id: null,
    purchase_unit: null,
    purchase_unit_quantity: null,
  });

  const loadOrderLines = async () => {
    const order = purchaseOrders.find(o => o.id === selectedOrderId);
    if (!order || !order.purchase_order_lines) return;

    setSelectedSupplierId(order.supplier_id);

    const productIds = order.purchase_order_lines.map(l => l.product_id);
    await loadConfigsForProducts(productIds);

    setLines(order.purchase_order_lines.map(line => ({
      product_id: line.product_id,
      order_line_id: line.id,
      qty_ordered: line.quantity,
      qty_received: line.quantity,
      unit: line.unit,
      unit_price: 0,
      batch_code: '',
      expiry_date: '',
      notes: '',
      product_name: line.products.name,
      product_code: line.products.code,
      purchase_config_id: line.purchase_config_id || null,
      purchase_unit: line.purchase_unit || null,
      purchase_unit_quantity: line.purchase_unit_quantity || null,
    })));
  };

  const addLine = () => {
    setLines([...lines, createEmptyLine()]);
    requestAnimationFrame(() => {
      linesScrollRef.current?.scrollTo({ top: linesScrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  };

  const removeLine = (index: number) => {
    if (lines.length > 1) {
      setLines(lines.filter((_, i) => i !== index));
    }
  };

  const applyConfigToLine = (line: GoodsReceiptLine, config: ProductPurchaseConfig | null): GoodsReceiptLine => {
    if (config) {
      return {
        ...line,
        purchase_config_id: config.id,
        purchase_unit: config.purchase_unit,
        purchase_unit_quantity: config.purchase_unit_quantity,
        unit: config.purchase_unit_measure,
      };
    }
    return {
      ...line,
      purchase_config_id: null,
      purchase_unit: null,
      purchase_unit_quantity: null,
    };
  };

  const updateLine = (index: number, field: keyof GoodsReceiptLine, value: any) => {
    const newLines = [...lines];
    newLines[index] = { ...newLines[index], [field]: value };

    if (field === 'product_id' && value) {
      const product = products.find(item => item.id === value);
      const configs = configsByProduct[value] || [];
      const defaultConfig = configs.find(c => c.is_default) || configs[0] || null;

      if (defaultConfig) {
        newLines[index] = applyConfigToLine(newLines[index], defaultConfig);
      } else if (product) {
        newLines[index].unit = product.unit;
        newLines[index].purchase_config_id = null;
        newLines[index].purchase_unit = null;
        newLines[index].purchase_unit_quantity = null;
      }
      newLines[index].product_name = product?.name;
      newLines[index].product_code = product?.code;
    }

    if (field === 'purchase_config_id') {
      const configs = configsByProduct[newLines[index].product_id] || [];
      const chosen = configs.find(c => c.id === value) || null;
      newLines[index] = applyConfigToLine(newLines[index], chosen);
    }

    setLines(newLines);
  };

  const selectProduct = (index: number, productId: string) => {
    updateLine(index, 'product_id', productId);
  };

  // ── fatura: fotos e leitura automática ──
  const uploadPhotos = async (files: FileList | null) => {
    if (!files?.length || !profile?.unit_id) return;
    setUploading(true);
    setReadMsg(null);
    try {
      const month = new Date().toISOString().slice(0, 7);
      const added: { path: string; url: string; name: string }[] = [];
      for (const f of Array.from(files)) {
        const file = f.type.startsWith('image/') ? await compressImage(f, 1800, 0.82) : f;
        const ext = file.type === 'application/pdf' ? 'pdf' : 'jpg';
        const path = `${profile.unit_id}/${month}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from('invoices').upload(path, file, { contentType: file.type || 'image/jpeg' });
        if (error) throw error;
        added.push({ path, url: file.type === 'application/pdf' ? '' : URL.createObjectURL(file), name: f.name });
      }
      setPhotos((p) => [...p, ...added]);
    } catch (err: any) {
      alert('Erro ao enviar a foto: ' + (err?.message ?? err));
    } finally {
      setUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const readInvoice = async () => {
    if (!photos.length) return;
    if (receiptType === 'without_order' && !selectedSupplierId) {
      setReadMsg({ ok: false, text: 'Escolha primeiro o fornecedor, para eu saber que produtos procurar.' });
      return;
    }
    setReading(true);
    setReadMsg(null);
    const { data, error } = await supabase.functions.invoke('invoice-extract', {
      body: {
        paths: photos.map((p) => p.path),
        purchase_order_id: receiptType === 'with_order' ? selectedOrderId || null : null,
        supplier_id: selectedSupplierId || null,
      },
    });
    setReading(false);
    let errText = data?.error as string | undefined;
    if (error && !errText) {
      try { errText = (await (error as any).context?.json?.())?.error; } catch { /* */ }
      errText = errText ?? error.message;
    }
    if (errText) { setReadMsg({ ok: false, text: errText }); return; }
    applyInvoice(data as InvoiceRead);
  };

  const applyInvoice = (r: InvoiceRead) => {
    setInvoiceRead(r);
    if (r.invoice_number) setInvoiceRef(r.invoice_number);
    if (r.invoice_date) setInvoiceDate(r.invoice_date);
    if (r.total_with_vat != null) setInvoiceTotal(r.total_with_vat);

    const qtyOf = (l: InvoiceRead['lines'][number]) => l.qty_in_purchase_units ?? l.quantity;
    const priceOf = (l: InvoiceRead['lines'][number]) => l.price_per_purchase_unit ?? l.unit_price ?? 0;
    const matched = r.lines.filter((l) => l.product_id);

    setLines((current) => {
      let next = current.map((line) => {
        const inv = matched.filter((l) => (line.order_line_id && l.order_line_id === line.order_line_id) || l.product_id === line.product_id);
        if (!inv.length) {
          return receiptType === 'with_order' ? { ...line, qty_received: 0, from_invoice: 'missing' as const } : line;
        }
        const q = inv.reduce((s, l) => s + qtyOf(l), 0);
        const first = inv[0];
        return {
          ...line,
          qty_received: Math.round(q * 1000) / 1000,
          unit_price: Math.round(priceOf(first) * 10000) / 10000 || line.unit_price,
          batch_code: first.batch || line.batch_code,
          expiry_date: first.expiry_date || line.expiry_date,
          from_invoice: first.confidence,
          invoice_description: inv.map((l) => l.description).join(' + '),
        };
      });
      // produtos na fatura que não estavam nas linhas (fora da encomenda, ou receção sem encomenda)
      const extras = matched.filter((l) => !next.some((x) => (l.order_line_id && x.order_line_id === l.order_line_id) || x.product_id === l.product_id));
      const seen = new Set<string>();
      const extraLines = extras.filter((l) => !seen.has(l.product_id!) && seen.add(l.product_id!)).map((l) => {
        const configs = configsByProduct[l.product_id!] || [];
        const def = configs.find((c) => c.is_default) || configs[0] || null;
        const base = { ...createEmptyLine(), product_id: l.product_id!, product_name: l.product_name ?? undefined, product_code: l.product_code ?? undefined };
        const withCfg = def ? applyConfigToLine(base, def) : { ...base, unit: products.find((p) => p.id === l.product_id)?.unit ?? 'un' };
        return {
          ...withCfg,
          qty_received: Math.round(qtyOf(l) * 1000) / 1000,
          unit_price: Math.round(priceOf(l) * 10000) / 10000,
          batch_code: l.batch || '',
          expiry_date: l.expiry_date || '',
          notes: receiptType === 'with_order' ? 'Não estava na encomenda' : '',
          from_invoice: l.confidence,
          invoice_description: l.description,
        };
      });
      if (receiptType === 'without_order') next = next.filter((x) => x.product_id);
      return [...next, ...extraLines];
    });

    const unmatched = r.lines.filter((l) => !l.product_id).length;
    setReadMsg({
      ok: true,
      text: `Fatura lida: ${matched.length} linha(s) associada(s)${unmatched ? `, ${unmatched} sem produto correspondente (ver abaixo)` : ''}. Confirme as quantidades, lotes e validades antes de registar.`,
    });
  };

  const validateForm = () => {
    if (receiptType === 'with_order' && !selectedOrderId) {
      alert('Selecione uma encomenda');
      return false;
    }

    if (receiptType === 'without_order' && !selectedSupplierId) {
      alert('Selecione um fornecedor');
      return false;
    }

    if (!receivedAt) {
      alert('Defina a data e hora de receção');
      return false;
    }

    const validLines = lines.filter(line => line.product_id && line.qty_received > 0);
    if (validLines.length === 0) {
      alert('Adicione pelo menos um produto recebido');
      return false;
    }

    const missingBatch = validLines.some(line => !line.batch_code);
    if (missingBatch) {
      alert('Todos os produtos devem ter código de lote');
      return false;
    }

    const missingExpiry = validLines.some(line => !line.expiry_date);
    if (missingExpiry) {
      alert('Todos os produtos devem ter data de validade');
      return false;
    }

    const missingPrice = validLines.some(line => !line.unit_price || line.unit_price <= 0);
    if (missingPrice) {
      alert('Todos os produtos devem ter preço unitário');
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm() || !profile?.id || !profile?.unit_id) return;

    setLoading(true);
    try {
      const validLines = lines.filter(line => line.product_id && line.qty_received > 0);

      const { data: receiptNumber, error: numberError } = await supabase.rpc('generate_receipt_number', {
        p_unit_id: profile.unit_id
      });
      if (numberError) throw numberError;

      const { data: newReceipt, error: receiptError } = await supabase
        .from('goods_receipts')
        .insert({
          receipt_number: receiptNumber,
          purchase_order_id: receiptType === 'with_order' ? selectedOrderId : null,
          unit_id: profile.unit_id,
          supplier_id: selectedSupplierId,
          received_by: profile.id,
          received_at: receivedAt,
          notes: notes || null,
          invoice_reference: invoiceRef.trim() || null,
          invoice_date: invoiceDate || null,
          invoice_total: invoiceTotal,
          invoice_photo_paths: photos.map((p) => p.path),
          invoice_extraction: invoiceRead as any,
        })
        .select()
        .single();

      if (receiptError || !newReceipt) throw receiptError;

      const { error: linesError } = await supabase
        .from('goods_receipt_lines')
        .insert(validLines.map(line => ({
          receipt_id: newReceipt.id,
          product_id: line.product_id,
          order_line_id: line.order_line_id || null,
          qty_ordered: line.qty_ordered,
          qty_received: line.qty_received,
          unit: line.unit,
          unit_price: line.unit_price,
          batch_code: line.batch_code,
          expiry_date: line.expiry_date,
          notes: line.notes || null,
          purchase_config_id: line.purchase_config_id || null,
          purchase_unit: line.purchase_unit || null,
          purchase_unit_quantity: line.purchase_unit_quantity || null,
        })));

      if (linesError) throw linesError;

      for (const line of validLines) {
        const conversionFactor = line.purchase_unit_quantity || 1;
        const baseUnitQuantity = line.qty_received * conversionFactor;

        await supabase.rpc('update_stock_on_receipt', {
          p_product_id: line.product_id,
          p_unit_id: profile.unit_id,
          p_quantity: baseUnitQuantity,
          p_unit: line.unit
        });

        const { data: productData } = await supabase
          .from('products')
          .select('unit')
          .eq('id', line.product_id)
          .single();

        const unitPricePerBaseUnit = line.unit_price / conversionFactor;

        await supabase.from('product_price_history').insert({
          product_id: line.product_id,
          unit_id: profile.unit_id,
          supplier_id: selectedSupplierId,
          receipt_id: newReceipt.id,
          unit_price: unitPricePerBaseUnit,
          quantity: baseUnitQuantity,
          unit: productData?.unit || line.unit,
          recorded_by: profile.id
        });
      }

      if (receiptType === 'with_order' && selectedOrderId) {
        const order = purchaseOrders.find(o => o.id === selectedOrderId);
        if (order) {
          const allReceived = order.purchase_order_lines.every(orderLine => {
            const receivedLine = validLines.find(l => l.order_line_id === orderLine.id);
            return receivedLine && receivedLine.qty_received >= orderLine.quantity;
          });

          await supabase
            .from('purchase_orders')
            .update({
              status: allReceived ? 'received' : 'partially_received'
            })
            .eq('id', selectedOrderId);
        }
      }

      await supabase.from('audit_logs').insert({
        user_id: profile.id,
        action: 'create_goods_receipt',
        entity: 'goods_receipts',
        entity_id: newReceipt.id,
        changes: { receipt_number: receiptNumber, lines: validLines.length }
      });

      alert('Receção registada com sucesso');
      onSuccess();
    } catch (err) {
      console.error('Erro ao registar receção:', err);
      alert('Erro ao registar receção');
    } finally {
      setLoading(false);
    }
  };

  const getMissingItems = () => {
    if (receiptType !== 'with_order' || !selectedOrderId) return [];

    const order = purchaseOrders.find(o => o.id === selectedOrderId);
    if (!order) return [];

    return order.purchase_order_lines.filter(orderLine => {
      const receivedLine = lines.find(l => l.order_line_id === orderLine.id);
      return !receivedLine || receivedLine.qty_received < orderLine.quantity;
    }).map(orderLine => {
      const receivedLine = lines.find(l => l.order_line_id === orderLine.id);
      const missing = orderLine.quantity - (receivedLine?.qty_received || 0);
      return {
        code: orderLine.products.code,
        name: orderLine.products.name,
        ordered: orderLine.quantity,
        received: receivedLine?.qty_received || 0,
        missing: missing
      };
    });
  };

  const missingItems = getMissingItems();

  const formatUnitLabel = (line: GoodsReceiptLine): string => {
    if (line.purchase_unit && line.purchase_unit_quantity) {
      return `${line.purchase_unit} (${line.purchase_unit_quantity} ${line.unit})`;
    }
    return line.unit || '';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white sm:rounded-xl shadow-xl max-w-6xl w-full h-full sm:h-auto sm:max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800">Receber mercadoria</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex space-x-4 mb-6">
            <button
              onClick={() => setReceiptType('with_order')}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition ${
                receiptType === 'with_order'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Com Encomenda
            </button>
            <button
              onClick={() => setReceiptType('without_order')}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition ${
                receiptType === 'without_order'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Sem Encomenda
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {receiptType === 'with_order' ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Encomenda *
                </label>
                <select
                  required
                  value={selectedOrderId}
                  onChange={(e) => setSelectedOrderId(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Selecione a encomenda</option>
                  {purchaseOrders.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.order_number} - {order.suppliers.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Fornecedor *
                </label>
                <select
                  required
                  value={selectedSupplierId}
                  onChange={(e) => {
                    setSelectedSupplierId(e.target.value);
                    setLines([createEmptyLine()]);
                  }}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Selecione o fornecedor</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Data e Hora de Receção *
              </label>
              <input
                type="datetime-local"
                required
                value={receivedAt}
                onChange={(e) => setReceivedAt(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* ── Fatura ── */}
          <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/60">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2"><FileText className="w-5 h-5" /> Fatura / guia do fornecedor</h3>
              <div className="flex gap-2">
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => uploadPhotos(e.target.files)}
                />
                <button type="button" onClick={() => photoInputRef.current?.click()} disabled={uploading}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                  {photos.length ? 'Mais uma página' : 'Fotografar fatura'}
                </button>
                <button type="button" onClick={readInvoice} disabled={!photos.length || reading || uploading}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-40">
                  {reading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {reading ? 'A ler a fatura…' : 'Preencher a partir da fatura'}
                </button>
              </div>
            </div>

            {photos.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {photos.map((p, i) => (
                  <div key={p.path} className="relative">
                    {p.url ? (
                      <img src={p.url} alt={`Página ${i + 1}`} className="w-20 h-24 object-cover rounded-lg border border-slate-300" />
                    ) : (
                      <div className="w-20 h-24 rounded-lg border border-slate-300 bg-white flex items-center justify-center text-xs text-slate-500">PDF</div>
                    )}
                    <button type="button" onClick={() => setPhotos((ph) => ph.filter((x) => x.path !== p.path))}
                      className="absolute -top-2 -right-2 bg-white border border-slate-300 rounded-full p-0.5 text-slate-500 hover:text-red-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">N.º da fatura / guia</label>
                <input value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} placeholder="Ex.: FT 2026/1234"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Data da fatura</label>
                <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Total c/ IVA (€)</label>
                <input type="number" step="0.01" value={invoiceTotal ?? ''} onChange={(e) => setInvoiceTotal(e.target.value ? parseFloat(e.target.value) : null)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white" />
              </div>
            </div>

            {readMsg && (
              <div className={`p-3 rounded-lg text-sm flex gap-2 ${readMsg.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-amber-50 border border-amber-200 text-amber-800'}`}>
                {readMsg.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
                <span>{readMsg.text}</span>
              </div>
            )}

            {invoiceRead && (invoiceRead.lines.some((l) => !l.product_id) || (invoiceRead.warnings?.length ?? 0) > 0) && (
              <div className="p-3 rounded-lg bg-white border border-amber-200 text-sm space-y-1">
                {invoiceRead.lines.filter((l) => !l.product_id).map((l, i) => (
                  <p key={i} className="text-amber-800">• Na fatura mas sem produto associado: <strong>{l.description}</strong> — {l.quantity} {l.unit ?? ''}{l.unit_price != null ? ` × ${l.unit_price.toFixed(2)} €` : ''}</p>
                ))}
                {invoiceRead.warnings?.map((w, i) => <p key={`w${i}`} className="text-slate-600">• {w}</p>)}
                {receiptType === 'without_order' && invoiceRead.lines.some((l) => !l.product_id) && (
                  <p className="text-slate-500 text-xs pt-1">Se o produto existir, associe-o ao fornecedor em Ajustes → Fornecedores para ser reconhecido da próxima vez.</p>
                )}
              </div>
            )}
          </div>

          {missingItems.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-yellow-800 mb-2">Produtos em Falta ou Parciais</h4>
                  <div className="space-y-1">
                    {missingItems.map((item, i) => (
                      <p key={i} className="text-sm text-yellow-700">
                        {item.code} - {item.name}: Encomendado {item.ordered}, Recebido {item.received},
                        <strong> Em falta {item.missing}</strong>
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3 sticky top-0 bg-white z-10 pb-1">
              <h3 className="text-lg font-semibold text-slate-800">Produtos Recebidos</h3>
              {receiptType === 'without_order' && (
                <button
                  type="button"
                  onClick={addLine}
                  className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition"
                >
                  <Plus className="w-5 h-5" />
                  <span>Adicionar Produto</span>
                </button>
              )}
            </div>

            <div ref={linesScrollRef} className="space-y-3 max-h-[45vh] overflow-y-auto pr-1 -mr-1">
              {lines.map((line, index) => {
                const configs = configsByProduct[line.product_id] || [];

                return (
                  <div key={index} className={`p-4 rounded-lg ${line.from_invoice === 'missing' ? 'bg-amber-50 border border-amber-200' : line.from_invoice === 'baixa' ? 'bg-orange-50 border border-orange-200' : 'bg-slate-50'}`}>
                    {line.from_invoice && (
                      <p className="text-xs mb-2 flex items-center gap-1.5">
                        {line.from_invoice === 'missing' ? (
                          <span className="text-amber-800 font-medium">Não aparece na fatura — confirme se veio.</span>
                        ) : (
                          <>
                            <span className={`px-1.5 py-0.5 rounded font-medium ${line.from_invoice === 'alta' ? 'bg-emerald-100 text-emerald-800' : line.from_invoice === 'media' ? 'bg-amber-100 text-amber-800' : 'bg-orange-100 text-orange-800'}`}>
                              Da fatura{line.from_invoice !== 'alta' ? ' · confirmar' : ''}
                            </span>
                            {line.invoice_description && <span className="text-slate-500 truncate">“{line.invoice_description}”</span>}
                          </>
                        )}
                      </p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                      <div className="md:col-span-3">
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Produto *
                        </label>
                        {receiptType === 'without_order' ? (
                          <select
                            required
                            value={line.product_id}
                            onChange={(e) => selectProduct(index, e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">
                              {products.length > 0 ? 'Selecione o produto' : selectedSupplierId ? 'Sem produtos associados a este fornecedor' : 'Selecione primeiro o fornecedor'}
                            </option>
                            {products.map(product => (
                              <option key={product.id} value={product.id}>
                                {product.code} - {product.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-sm font-medium text-slate-800">
                            {line.product_code} - {line.product_name}
                          </p>
                        )}
                      </div>

                      {configs.length > 1 && (
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Unidade de Compra
                          </label>
                          <select
                            value={line.purchase_config_id || ''}
                            onChange={(e) => updateLine(index, 'purchase_config_id', e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
                          >
                            {configs.map(config => (
                              <option key={config.id} value={config.id}>
                                {config.purchase_unit} ({config.purchase_unit_quantity} {config.purchase_unit_measure})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {line.qty_ordered !== null && (
                        <div className="md:col-span-1">
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Encomendado
                          </label>
                          <p className="text-sm font-medium text-slate-600 pt-2">
                            {line.qty_ordered} {line.purchase_unit || line.unit}
                          </p>
                        </div>
                      )}

                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Qtd. Recebida *
                        </label>
                        <input
                          type="number"
                          required
                          min="1"
                          step="0.001"
                          value={line.qty_received}
                          onChange={(e) => updateLine(index, 'qty_received', parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-xs text-slate-400 mt-1">{formatUnitLabel(line)}</p>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Preço por Unidade de Compra (€) *
                        </label>
                        <input
                          type="number"
                          required
                          min="0.01"
                          step="0.01"
                          value={line.unit_price || ''}
                          onChange={(e) => updateLine(index, 'unit_price', parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                        {line.purchase_unit_quantity && line.purchase_unit_quantity > 1 && (
                          <p className="text-xs text-slate-400 mt-1">
                            = €{(line.unit_price / line.purchase_unit_quantity).toFixed(4)}/{line.unit}
                          </p>
                        )}
                      </div>

                      <div className="md:col-span-1">
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Lote *
                        </label>
                        <input
                          type="text"
                          required
                          value={line.batch_code}
                          onChange={(e) => updateLine(index, 'batch_code', e.target.value)}
                          placeholder="Lote"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div className="md:col-span-1">
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Validade *
                        </label>
                        <input
                          type="date"
                          required
                          value={line.expiry_date}
                          onChange={(e) => updateLine(index, 'expiry_date', e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex items-end space-x-3">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Notas
                        </label>
                        <input
                          type="text"
                          value={line.notes}
                          onChange={(e) => updateLine(index, 'notes', e.target.value)}
                          placeholder="Observações sobre este produto..."
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      {receiptType === 'without_order' && (
                        <button
                          type="button"
                          onClick={() => removeLine(index)}
                          disabled={lines.length === 1}
                          className="p-2 text-red-600 hover:text-red-700 disabled:text-slate-400"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Notas Gerais
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Observações sobre a receção..."
            />
          </div>
        </div>

        <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-slate-700 hover:bg-slate-200 rounded-lg transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:bg-blue-400"
          >
            {loading ? 'A registar...' : 'Registar Receção'}
          </button>
        </div>
      </div>
    </div>
  );
}
