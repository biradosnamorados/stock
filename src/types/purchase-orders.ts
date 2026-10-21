export interface Supplier {
  id: string;
  code: string;
  name: string;
  type: 'external' | 'internal';
  email: string | null;
  phone: string | null;
  contact_person: string | null;
  active: boolean;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  unit: string;
  product_type: string;
  purchase_unit: string | null;
  purchase_unit_quantity: number | null;
}

export interface SupplierProduct {
  supplier_id: string;
  product_id: string;
  supplier_code: string | null;
  unit_price: number | null;
  products: Product;
}

export interface ProductPurchaseConfig {
  id: string;
  product_id: string;
  purchase_unit: string;
  purchase_unit_quantity: number;
  purchase_unit_measure: string;
  is_default: boolean;
  active: boolean;
}

export interface PurchaseOrderLine {
  id?: string;
  product_id: string;
  quantity: number;
  unit: string;
  unit_price?: number;
  current_stock: number | null;
  notes: string;
  product_name?: string;
  product_code?: string;
  purchase_config_id?: string | null;
  purchase_unit?: string | null;
  purchase_unit_quantity?: number | null;
  purchase_unit_measure?: string | null;
  available_configs?: ProductPurchaseConfig[];
}

export interface PurchaseOrder {
  id: string;
  order_number: string;
  unit_id: string;
  supplier_id: string;
  status: 'draft' | 'sent' | 'confirmed' | 'partially_received' | 'received' | 'cancelled';
  order_date: string;
  expected_delivery_date: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  pdf_path: string | null;
  pdf_generated_at: string | null;
  email_sent_at: string | null;
  email_status: string | null;
  email_recipient: string | null;
  email_error: string | null;
  resend_count: number;
  last_sent_at: string | null;
  duplicate_of: string | null;
  suppliers?: { name: string; email: string | null };
  purchase_order_lines?: PurchaseOrderLine[];
}
