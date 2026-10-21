/*
  # Enable CASCADE deletion for suppliers
  
  1. Changes
    - Drop existing foreign key constraints on purchase_orders and goods_receipts
    - Recreate them with ON DELETE CASCADE
    - This allows suppliers to be deleted even when they have associated purchase orders or goods receipts
    - All dependent records will be automatically removed when a supplier is deleted
  
  2. Affected Tables
    - purchase_orders: CASCADE on supplier_id
    - goods_receipts: CASCADE on supplier_id
  
  3. Security
    - Maintains all existing RLS policies
    - Only authorized users (admin, cdp_manager) can delete suppliers based on RLS rules
*/

-- Drop and recreate purchase_orders.supplier_id constraint
ALTER TABLE purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_supplier_id_fkey;

ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_supplier_id_fkey 
  FOREIGN KEY (supplier_id) 
  REFERENCES suppliers(id) 
  ON DELETE CASCADE;

-- Drop and recreate goods_receipts.supplier_id constraint
ALTER TABLE goods_receipts
  DROP CONSTRAINT IF EXISTS goods_receipts_supplier_id_fkey;

ALTER TABLE goods_receipts
  ADD CONSTRAINT goods_receipts_supplier_id_fkey 
  FOREIGN KEY (supplier_id) 
  REFERENCES suppliers(id) 
  ON DELETE CASCADE;
