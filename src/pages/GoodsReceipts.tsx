import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { ClipboardList, Plus, Eye, X } from 'lucide-react';
import GoodsReceiptForm from '../components/GoodsReceiptForm';
import type { GoodsReceipt } from '../types/goods-receipts';

export default function GoodsReceipts({ embedded = false, refreshKey = 0 }: { embedded?: boolean; refreshKey?: number } = {}) {
  const { profile } = useAuth();
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<GoodsReceipt | null>(null);

  const [photoUrls, setPhotoUrls] = useState<string[]>([]);

  useEffect(() => {
    loadReceipts();
  }, [profile, refreshKey]);

  useEffect(() => {
    setPhotoUrls([]);
    const paths = selectedReceipt?.invoice_photo_paths ?? [];
    if (!paths.length) return;
    Promise.all(paths.map(async (p) => (await supabase.storage.from('invoices').createSignedUrl(p, 3600)).data?.signedUrl ?? ''))
      .then((u) => setPhotoUrls(u.filter(Boolean)));
  }, [selectedReceipt]);

  const loadReceipts = async () => {
    if (!profile?.unit_id) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('goods_receipts')
        .select(`
          *,
          suppliers(name),
          purchase_orders(order_number),
          profiles:received_by(full_name),
          goods_receipt_lines(
            id, product_id, qty_ordered, qty_received, unit, batch_code, expiry_date, notes,
            unit_price, purchase_unit, purchase_unit_quantity,
            products(code, name)
          )
        `)
        .eq('unit_id', profile.unit_id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erro ao carregar receção de mercadoria:', error);
      } else if (data) {
        setReceipts(data as any);
      }
    } catch (err) {
      console.error('Erro inesperado:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">A carregar receções...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? '' : 'p-6 max-w-7xl mx-auto'}>
      <div className={`flex items-center justify-between ${embedded ? 'mb-4' : 'mb-8'}`}>
        {embedded ? (
          <p className="text-slate-600 text-sm">Mercadoria recebida, com a fatura. Para entregas sem encomenda use <strong>Nova Receção</strong>.</p>
        ) : (
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Receção de Mercadoria</h1>
            <p className="text-slate-600 mt-2">Registo de entregas de fornecedores</p>
          </div>
        )}
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
        >
          <Plus className="w-5 h-5" />
          <span>Nova Receção</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Nº Receção</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Fornecedor</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Encomenda / Fatura</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Recebido Por</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Data Receção</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Linhas</th>
                <th className="text-right px-6 py-4 text-sm font-semibold text-slate-700">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {receipts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    <ClipboardList className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                    <p>Sem receções de mercadoria</p>
                  </td>
                </tr>
              ) : (
                receipts.map((receipt) => (
                  <tr key={receipt.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm font-medium">{receipt.receipt_number}</span>
                    </td>
                    <td className="px-6 py-4">{receipt.suppliers?.name}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      <div className="font-mono">{receipt.purchase_orders?.order_number ?? 'Sem encomenda'}</div>
                      <div className="flex items-center gap-1">
                        {receipt.invoice_reference || '—'}
                        {(receipt.invoice_photo_paths?.length ?? 0) > 0 && <span title="Tem foto da fatura">📎</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {receipt.profiles?.full_name || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {new Date(receipt.received_at).toLocaleString('pt-PT')}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {receipt.goods_receipt_lines?.length || 0} produtos
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setSelectedReceipt(receipt)}
                        className="p-2 hover:bg-slate-200 rounded-lg transition"
                      >
                        <Eye className="w-5 h-5 text-slate-600" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <GoodsReceiptForm
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            loadReceipts();
          }}
        />
      )}

      {selectedReceipt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-800">Detalhes da Receção</h2>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-slate-600">Nº Receção</span>
                  <p className="font-mono font-semibold">{selectedReceipt.receipt_number}</p>
                </div>
                <div>
                  <span className="text-sm text-slate-600">Fornecedor</span>
                  <p className="font-semibold">{selectedReceipt.suppliers?.name}</p>
                </div>
                <div>
                  <span className="text-sm text-slate-600">Recebido Por</span>
                  <p className="font-semibold">{selectedReceipt.profiles?.full_name}</p>
                </div>
                <div>
                  <span className="text-sm text-slate-600">Data e Hora</span>
                  <p className="font-semibold">
                    {new Date(selectedReceipt.received_at).toLocaleString('pt-PT')}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-slate-600">Encomenda</span>
                  <p className="font-mono font-semibold">{selectedReceipt.purchase_orders?.order_number ?? 'Sem encomenda'}</p>
                </div>
                <div>
                  <span className="text-sm text-slate-600">Fatura</span>
                  <p className="font-semibold">
                    {selectedReceipt.invoice_reference || '—'}
                    {selectedReceipt.invoice_date ? ` · ${new Date(selectedReceipt.invoice_date + 'T12:00:00').toLocaleDateString('pt-PT')}` : ''}
                    {selectedReceipt.invoice_total != null ? ` · ${Number(selectedReceipt.invoice_total).toFixed(2)} €` : ''}
                  </p>
                </div>
              </div>

              {photoUrls.length > 0 && (
                <div>
                  <span className="text-sm text-slate-600">Fotos da fatura</span>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {photoUrls.map((u, i) => (
                      <a key={i} href={u} target="_blank" rel="noreferrer">
                        <img src={u} alt={`Página ${i + 1}`} className="w-24 h-32 object-cover rounded-lg border border-slate-300" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {selectedReceipt.notes && (
                <div>
                  <span className="text-sm text-slate-600">Notas</span>
                  <p className="mt-1 text-slate-800">{selectedReceipt.notes}</p>
                </div>
              )}

              <div>
                <h3 className="font-semibold text-lg mb-3">Produtos Recebidos</h3>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-4 py-2 text-sm font-semibold text-slate-700">Produto</th>
                        <th className="text-right px-4 py-2 text-sm font-semibold text-slate-700">Encomendado</th>
                        <th className="text-right px-4 py-2 text-sm font-semibold text-slate-700">Recebido</th>
                        <th className="text-right px-4 py-2 text-sm font-semibold text-slate-700">Preço Unit.</th>
                        <th className="text-left px-4 py-2 text-sm font-semibold text-slate-700">Lote</th>
                        <th className="text-left px-4 py-2 text-sm font-semibold text-slate-700">Validade</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {selectedReceipt.goods_receipt_lines?.map((line: any) => (
                        <tr key={line.id}>
                          <td className="px-4 py-2 text-sm">
                            {line.products?.code} - {line.products?.name}
                          </td>
                          <td className="px-4 py-2 text-sm text-right">
                            {line.qty_ordered ? `${line.qty_ordered} ${line.purchase_unit || line.unit}` : '-'}
                          </td>
                          <td className="px-4 py-2 text-sm text-right font-semibold">
                            {line.qty_received} {line.purchase_unit || line.unit}
                          </td>
                          <td className="px-4 py-2 text-sm text-right font-semibold">
                            €{Number(line.unit_price || 0).toFixed(2)}
                            {line.purchase_unit && (
                              <span className="block text-xs text-slate-400">{line.purchase_unit}</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-sm font-mono">{line.batch_code}</td>
                          <td className="px-4 py-2 text-sm">
                            {line.expiry_date ? new Date(line.expiry_date).toLocaleDateString('pt-PT') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
