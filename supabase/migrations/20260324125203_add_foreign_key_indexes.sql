/*
  # Add Foreign Key Indexes for Performance Optimization

  1. Performance Improvements
    - Add indexes on all foreign key columns to optimize query performance
    - Prevents table scans when joining tables
    - Improves DELETE and UPDATE cascade operations

  2. Tables with new indexes
    - goods_receipt_lines: order_line_id, product_id, receipt_id
    - goods_receipts: purchase_order_id, received_by, supplier_id, unit_id
    - internal_order_lines: order_id, product_id
    - internal_order_packages: assigned_by, order_id, order_line_id
    - internal_orders: prepared_by, received_by, requested_by, shipped_by
    - packaged_units: consumed_by, created_by, opened_by, transferred_by
    - product_price_history: receipt_id, recorded_by, supplier_id, unit_id
    - production_batches: created_by
    - profiles: created_by, department_id
    - purchase_order_lines: order_id, product_id
    - purchase_orders: created_by, duplicate_of
    - role_permissions: permission_id
    - supplier_units: unit_id
    - user_permissions: permission_id
*/

-- Goods Receipt Lines
CREATE INDEX IF NOT EXISTS idx_goods_receipt_lines_order_line_id ON public.goods_receipt_lines(order_line_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_lines_product_id ON public.goods_receipt_lines(product_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_lines_receipt_id ON public.goods_receipt_lines(receipt_id);

-- Goods Receipts
CREATE INDEX IF NOT EXISTS idx_goods_receipts_purchase_order_id ON public.goods_receipts(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_received_by ON public.goods_receipts(received_by);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_supplier_id ON public.goods_receipts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_unit_id ON public.goods_receipts(unit_id);

-- Internal Order Lines
CREATE INDEX IF NOT EXISTS idx_internal_order_lines_order_id ON public.internal_order_lines(order_id);
CREATE INDEX IF NOT EXISTS idx_internal_order_lines_product_id ON public.internal_order_lines(product_id);

-- Internal Order Packages
CREATE INDEX IF NOT EXISTS idx_internal_order_packages_assigned_by ON public.internal_order_packages(assigned_by);
CREATE INDEX IF NOT EXISTS idx_internal_order_packages_order_id ON public.internal_order_packages(order_id);
CREATE INDEX IF NOT EXISTS idx_internal_order_packages_order_line_id ON public.internal_order_packages(order_line_id);

-- Internal Orders
CREATE INDEX IF NOT EXISTS idx_internal_orders_prepared_by ON public.internal_orders(prepared_by);
CREATE INDEX IF NOT EXISTS idx_internal_orders_received_by ON public.internal_orders(received_by);
CREATE INDEX IF NOT EXISTS idx_internal_orders_requested_by ON public.internal_orders(requested_by);
CREATE INDEX IF NOT EXISTS idx_internal_orders_shipped_by ON public.internal_orders(shipped_by);

-- Packaged Units
CREATE INDEX IF NOT EXISTS idx_packaged_units_consumed_by ON public.packaged_units(consumed_by);
CREATE INDEX IF NOT EXISTS idx_packaged_units_created_by ON public.packaged_units(created_by);
CREATE INDEX IF NOT EXISTS idx_packaged_units_opened_by ON public.packaged_units(opened_by);
CREATE INDEX IF NOT EXISTS idx_packaged_units_transferred_by ON public.packaged_units(transferred_by);

-- Product Price History
CREATE INDEX IF NOT EXISTS idx_product_price_history_receipt_id ON public.product_price_history(receipt_id);
CREATE INDEX IF NOT EXISTS idx_product_price_history_recorded_by ON public.product_price_history(recorded_by);
CREATE INDEX IF NOT EXISTS idx_product_price_history_supplier_id ON public.product_price_history(supplier_id);
CREATE INDEX IF NOT EXISTS idx_product_price_history_unit_id ON public.product_price_history(unit_id);

-- Production Batches
CREATE INDEX IF NOT EXISTS idx_production_batches_created_by ON public.production_batches(created_by);

-- Profiles
CREATE INDEX IF NOT EXISTS idx_profiles_created_by ON public.profiles(created_by);
CREATE INDEX IF NOT EXISTS idx_profiles_department_id ON public.profiles(department_id);

-- Purchase Order Lines
CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_order_id ON public.purchase_order_lines(order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_product_id ON public.purchase_order_lines(product_id);

-- Purchase Orders
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_by ON public.purchase_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_duplicate_of ON public.purchase_orders(duplicate_of);

-- Role Permissions
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON public.role_permissions(permission_id);

-- Supplier Units
CREATE INDEX IF NOT EXISTS idx_supplier_units_unit_id ON public.supplier_units(unit_id);

-- User Permissions
CREATE INDEX IF NOT EXISTS idx_user_permissions_permission_id ON public.user_permissions(permission_id);
