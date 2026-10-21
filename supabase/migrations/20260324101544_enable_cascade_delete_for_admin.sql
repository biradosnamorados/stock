/*
  # Enable CASCADE deletion for products, production batches, and packaged units

  1. Changes
    - Drop existing foreign key constraints
    - Recreate them with ON DELETE CASCADE to allow admins to delete records
    - This ensures that when a parent record is deleted, all dependent records are automatically removed
  
  2. Affected Tables
    - production_batches: CASCADE on product_id
    - packaged_units: CASCADE on product_id and batch_id
    - purchase_order_lines: CASCADE on product_id
    - goods_receipt_lines: CASCADE on product_id and order_line_id
    - internal_order_lines: CASCADE on product_id
    - supplier_products: CASCADE on product_id and supplier_id
    - product_stock: CASCADE on product_id
    - product_price_history: CASCADE on product_id
    - internal_order_packages: CASCADE on packaged_unit_id

  3. Security
    - Maintains all existing RLS policies
    - Only authorized users can perform deletions based on RLS rules
*/

-- Drop and recreate production_batches.product_id constraint
ALTER TABLE production_batches 
  DROP CONSTRAINT IF EXISTS production_batches_product_id_fkey;

ALTER TABLE production_batches
  ADD CONSTRAINT production_batches_product_id_fkey 
  FOREIGN KEY (product_id) 
  REFERENCES products(id) 
  ON DELETE CASCADE;

-- Drop and recreate packaged_units constraints
ALTER TABLE packaged_units
  DROP CONSTRAINT IF EXISTS packaged_units_product_id_fkey;

ALTER TABLE packaged_units
  ADD CONSTRAINT packaged_units_product_id_fkey 
  FOREIGN KEY (product_id) 
  REFERENCES products(id) 
  ON DELETE CASCADE;

ALTER TABLE packaged_units
  DROP CONSTRAINT IF EXISTS packaged_units_batch_id_fkey;

ALTER TABLE packaged_units
  ADD CONSTRAINT packaged_units_batch_id_fkey 
  FOREIGN KEY (batch_id) 
  REFERENCES production_batches(id) 
  ON DELETE CASCADE;

-- Drop and recreate purchase_order_lines.product_id constraint
ALTER TABLE purchase_order_lines
  DROP CONSTRAINT IF EXISTS purchase_order_lines_product_id_fkey;

ALTER TABLE purchase_order_lines
  ADD CONSTRAINT purchase_order_lines_product_id_fkey 
  FOREIGN KEY (product_id) 
  REFERENCES products(id) 
  ON DELETE CASCADE;

-- Drop and recreate goods_receipt_lines constraints
ALTER TABLE goods_receipt_lines
  DROP CONSTRAINT IF EXISTS goods_receipt_lines_product_id_fkey;

ALTER TABLE goods_receipt_lines
  ADD CONSTRAINT goods_receipt_lines_product_id_fkey 
  FOREIGN KEY (product_id) 
  REFERENCES products(id) 
  ON DELETE CASCADE;

ALTER TABLE goods_receipt_lines
  DROP CONSTRAINT IF EXISTS goods_receipt_lines_order_line_id_fkey;

ALTER TABLE goods_receipt_lines
  ADD CONSTRAINT goods_receipt_lines_order_line_id_fkey 
  FOREIGN KEY (order_line_id) 
  REFERENCES purchase_order_lines(id) 
  ON DELETE CASCADE;

-- Drop and recreate internal_order_lines.product_id constraint
ALTER TABLE internal_order_lines
  DROP CONSTRAINT IF EXISTS internal_order_lines_product_id_fkey;

ALTER TABLE internal_order_lines
  ADD CONSTRAINT internal_order_lines_product_id_fkey 
  FOREIGN KEY (product_id) 
  REFERENCES products(id) 
  ON DELETE CASCADE;

-- Drop and recreate supplier_products constraints
ALTER TABLE supplier_products
  DROP CONSTRAINT IF EXISTS supplier_products_product_id_fkey;

ALTER TABLE supplier_products
  ADD CONSTRAINT supplier_products_product_id_fkey 
  FOREIGN KEY (product_id) 
  REFERENCES products(id) 
  ON DELETE CASCADE;

ALTER TABLE supplier_products
  DROP CONSTRAINT IF EXISTS supplier_products_supplier_id_fkey;

ALTER TABLE supplier_products
  ADD CONSTRAINT supplier_products_supplier_id_fkey 
  FOREIGN KEY (supplier_id) 
  REFERENCES suppliers(id) 
  ON DELETE CASCADE;

-- Drop and recreate product_stock.product_id constraint
ALTER TABLE product_stock
  DROP CONSTRAINT IF EXISTS product_stock_product_id_fkey;

ALTER TABLE product_stock
  ADD CONSTRAINT product_stock_product_id_fkey 
  FOREIGN KEY (product_id) 
  REFERENCES products(id) 
  ON DELETE CASCADE;

-- Drop and recreate product_price_history.product_id constraint
ALTER TABLE product_price_history
  DROP CONSTRAINT IF EXISTS product_price_history_product_id_fkey;

ALTER TABLE product_price_history
  ADD CONSTRAINT product_price_history_product_id_fkey 
  FOREIGN KEY (product_id) 
  REFERENCES products(id) 
  ON DELETE CASCADE;

-- Drop and recreate internal_order_packages.packaged_unit_id constraint
ALTER TABLE internal_order_packages
  DROP CONSTRAINT IF EXISTS internal_order_packages_packaged_unit_id_fkey;

ALTER TABLE internal_order_packages
  ADD CONSTRAINT internal_order_packages_packaged_unit_id_fkey 
  FOREIGN KEY (packaged_unit_id) 
  REFERENCES packaged_units(id) 
  ON DELETE CASCADE;
