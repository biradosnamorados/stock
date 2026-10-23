export interface ProductPurchaseConfig {
  id: string;
  product_id: string;
  purchase_unit: string;
  purchase_unit_quantity: number;
  purchase_unit_measure: string;
  is_default: boolean;
  active: boolean;
}

export interface GoodsReceiptLine {
  id?: string;
  product_id: string;
  order_line_id?: string;
  qty_ordered: number | null;
  qty_received: number;
  unit: string;
  unit_price: number;
  batch_code: string;
  expiry_date: string;
  notes: string;
  product_name?: string;
  product_code?: string;
  purchase_config_id?: string | null;
  purchase_unit?: string | null;
  purchase_unit_quantity?: number | null;
  from_invoice?: 'alta' | 'media' | 'baixa' | 'missing' | null;
  invoice_description?: string | null;
}

export interface GoodsReceipt {
  id: string;
  receipt_number: string;
  purchase_order_id: string | null;
  unit_id: string;
  supplier_id: string;
  received_by: string;
  received_at: string;
  notes: string | null;
  created_at: string;
  invoice_reference?: string | null;
  invoice_date?: string | null;
  invoice_total?: number | null;
  invoice_photo_paths?: string[];
  purchase_orders?: { order_number: string } | null;
  suppliers?: { name: string };
  profiles?: { full_name: string };
  goods_receipt_lines?: GoodsReceiptLine[];
}

export interface PurchaseOrderForReceipt {
  id: string;
  order_number: string;
  supplier_id: string;
  suppliers: { name: string };
  purchase_order_lines: Array<{
    id: string;
    product_id: string;
    quantity: number;
    unit: string;
    purchase_config_id?: string | null;
    purchase_unit?: string | null;
    purchase_unit_quantity?: number | null;
    products: {
      code: string;
      name: string;
      unit: string;
      purchase_unit: string;
      purchase_unit_quantity: number;
    };
  }>;
}
