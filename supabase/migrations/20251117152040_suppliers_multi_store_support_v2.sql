/*
  # Enable Suppliers to Serve Multiple Stores

  ## Problem
  Currently suppliers are tied to a single store, but in reality a supplier
  can provide products to both Braga and Porto stores.

  ## Solution
  1. Drop old RLS policies that reference store_id
  2. Create a junction table `supplier_stores` for many-to-many relationship
  3. Migrate existing supplier data to the new structure
  4. Remove store_id from suppliers table
  5. Create new RLS policies

  ## Changes
  1. New Tables
    - `supplier_stores` - Junction table linking suppliers to stores
      - `id` (uuid, primary key)
      - `supplier_id` (uuid, FK to suppliers)
      - `store_id` (uuid, FK to stores)
      - `created_at` (timestamp)
      - Unique constraint on (supplier_id, store_id)

  2. Modified Tables
    - `suppliers` - Remove store_id column (after data migration)

  3. Security
    - Enable RLS on supplier_stores
    - Admins can manage all supplier-store relationships
    - Store users can only see suppliers linked to their store
*/

-- Drop old policies that depend on suppliers.store_id
DROP POLICY IF EXISTS "Store users can manage their store suppliers" ON suppliers;

-- Create the junction table for supplier-store relationships
CREATE TABLE IF NOT EXISTS supplier_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(supplier_id, store_id)
);

-- Migrate existing supplier data to the new structure
INSERT INTO supplier_stores (supplier_id, store_id)
SELECT id, store_id FROM suppliers
WHERE store_id IS NOT NULL
ON CONFLICT (supplier_id, store_id) DO NOTHING;

-- Now remove the store_id column from suppliers
ALTER TABLE suppliers DROP COLUMN IF EXISTS store_id;

-- Enable RLS on supplier_stores
ALTER TABLE supplier_stores ENABLE ROW LEVEL SECURITY;

-- RLS Policies for supplier_stores
CREATE POLICY "Admins can manage all supplier stores"
  ON supplier_stores FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Store users can view their store supplier relationships"
  ON supplier_stores FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.store_id = supplier_stores.store_id
    )
  );

CREATE POLICY "Store users can manage their store supplier relationships"
  ON supplier_stores FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.store_id = supplier_stores.store_id
    )
  );

-- Update suppliers RLS policies to work with new structure
-- Allow store users to view suppliers that serve their store
CREATE POLICY "Store users can view suppliers serving their store"
  ON suppliers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN supplier_stores ss ON ss.store_id = p.store_id
      WHERE p.id = auth.uid()
      AND ss.supplier_id = suppliers.id
    )
  );

-- Allow store users to update suppliers serving their store
CREATE POLICY "Store users can update suppliers serving their store"
  ON suppliers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN supplier_stores ss ON ss.store_id = p.store_id
      WHERE p.id = auth.uid()
      AND ss.supplier_id = suppliers.id
    )
  );

-- Allow admins and store users to insert new suppliers
CREATE POLICY "Users can insert suppliers"
  ON suppliers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
    )
  );

-- Allow deletion (admins only through existing admin policy)
CREATE POLICY "Users can delete suppliers they manage"
  ON suppliers FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (
        p.role = 'admin'
        OR EXISTS (
          SELECT 1 FROM supplier_stores ss
          WHERE ss.supplier_id = suppliers.id
          AND ss.store_id = p.store_id
        )
      )
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_supplier_stores_supplier ON supplier_stores(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_stores_store ON supplier_stores(store_id);
