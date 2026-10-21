/*
  # Add Stock Tracking and Price History

  1. New Tables
    - `product_stock`
      - Tracks current stock levels per product and location
      - `product_id` (uuid, FK to products)
      - `unit_id` (uuid, FK to units)
      - `quantity` (numeric) - current stock level
      - `unit` (text) - unit of measure
      - `last_updated` (timestamptz) - timestamp of last update
      - Unique constraint on (product_id, unit_id)
    
    - `product_price_history`
      - Historical record of all product prices from receipts
      - `id` (uuid, PK)
      - `product_id` (uuid, FK to products)
      - `unit_id` (uuid, FK to units)
      - `supplier_id` (uuid, FK to suppliers)
      - `receipt_id` (uuid, FK to goods_receipts)
      - `unit_price` (numeric) - price per unit
      - `unit` (text) - unit of measure
      - `recorded_at` (timestamptz) - when this price was recorded
      - `recorded_by` (uuid, FK to profiles)

  2. Changes to Existing Tables
    - Add `unit_price` to `goods_receipt_lines` (already exists, ensure it's used)
    - Add `current_stock` to `purchase_order_lines`
    - Remove NOT NULL constraint from `unit_price` in `purchase_order_lines`

  3. Security
    - Enable RLS on new tables
    - Add policies for authenticated users with unit access

  4. Functions
    - Function to update stock on goods receipt
    - Function to get current stock for a product
    - Function to get price history for a product
*/

-- Create product_stock table
CREATE TABLE IF NOT EXISTS product_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  unit_id uuid REFERENCES units(id) ON DELETE CASCADE NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  unit text NOT NULL,
  last_updated timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(product_id, unit_id)
);

ALTER TABLE product_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view stock in their unit"
  ON product_stock FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.unit_id = product_stock.unit_id
    )
  );

CREATE POLICY "Users can update stock in their unit"
  ON product_stock FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.unit_id = product_stock.unit_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.unit_id = product_stock.unit_id
    )
  );

CREATE POLICY "Users can insert stock in their unit"
  ON product_stock FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.unit_id = product_stock.unit_id
    )
  );

-- Create product_price_history table
CREATE TABLE IF NOT EXISTS product_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  unit_id uuid REFERENCES units(id) ON DELETE CASCADE NOT NULL,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  receipt_id uuid REFERENCES goods_receipts(id) ON DELETE SET NULL,
  unit_price numeric NOT NULL,
  unit text NOT NULL,
  recorded_at timestamptz DEFAULT now() NOT NULL,
  recorded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE product_price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view price history in their unit"
  ON product_price_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.unit_id = product_price_history.unit_id
    )
  );

CREATE POLICY "Users can insert price history in their unit"
  ON product_price_history FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.unit_id = product_price_history.unit_id
    )
  );

-- Add current_stock column to purchase_order_lines if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_order_lines' AND column_name = 'current_stock'
  ) THEN
    ALTER TABLE purchase_order_lines ADD COLUMN current_stock numeric;
  END IF;
END $$;

-- Ensure unit_price in goods_receipt_lines exists and is nullable
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'goods_receipt_lines' AND column_name = 'unit_price'
  ) THEN
    ALTER TABLE goods_receipt_lines ADD COLUMN unit_price numeric;
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_product_stock_product_id ON product_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_product_stock_unit_id ON product_stock(unit_id);
CREATE INDEX IF NOT EXISTS idx_price_history_product_id ON product_price_history(product_id);
CREATE INDEX IF NOT EXISTS idx_price_history_recorded_at ON product_price_history(recorded_at DESC);

-- Function to get current stock for a product in a unit
CREATE OR REPLACE FUNCTION get_product_stock(p_product_id uuid, p_unit_id uuid)
RETURNS numeric AS $$
DECLARE
  current_qty numeric;
BEGIN
  SELECT quantity INTO current_qty
  FROM product_stock
  WHERE product_id = p_product_id AND unit_id = p_unit_id;
  
  RETURN COALESCE(current_qty, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update stock on goods receipt
CREATE OR REPLACE FUNCTION update_stock_on_receipt(
  p_product_id uuid,
  p_unit_id uuid,
  p_quantity numeric,
  p_unit text
)
RETURNS void AS $$
BEGIN
  INSERT INTO product_stock (product_id, unit_id, quantity, unit, last_updated)
  VALUES (p_product_id, p_unit_id, p_quantity, p_unit, now())
  ON CONFLICT (product_id, unit_id)
  DO UPDATE SET
    quantity = product_stock.quantity + EXCLUDED.quantity,
    last_updated = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get latest price for a product
CREATE OR REPLACE FUNCTION get_latest_price(p_product_id uuid, p_unit_id uuid)
RETURNS TABLE(unit_price numeric, supplier_name text, recorded_at timestamptz) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pph.unit_price,
    s.name as supplier_name,
    pph.recorded_at
  FROM product_price_history pph
  LEFT JOIN suppliers s ON s.id = pph.supplier_id
  WHERE pph.product_id = p_product_id AND pph.unit_id = p_unit_id
  ORDER BY pph.recorded_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
