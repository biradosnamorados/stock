/*
  # Update Orders System

  ## Changes
  1. Add missing timestamp fields to orders table
  2. Update order number generation if needed
  3. Ensure order_items table exists with correct structure
*/

-- Add missing fields to orders table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'sent_at'
  ) THEN
    ALTER TABLE orders ADD COLUMN sent_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'received_at'
  ) THEN
    ALTER TABLE orders ADD COLUMN received_at timestamptz;
  END IF;
END $$;

-- Create order_items table if not exists
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_price numeric CHECK (unit_price >= 0),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Create function to generate order numbers if not exists
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS text AS $$
DECLARE
  new_number text;
  year_prefix text;
  sequence_num integer;
BEGIN
  year_prefix := TO_CHAR(CURRENT_DATE, 'YYYY');
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM 6) AS integer)), 0) + 1
  INTO sequence_num
  FROM orders
  WHERE order_number LIKE year_prefix || '-%';
  
  new_number := year_prefix || '-' || LPAD(sequence_num::text, 5, '0');
  
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate order numbers if not exists
DROP TRIGGER IF EXISTS trigger_set_order_number ON orders;

CREATE OR REPLACE FUNCTION set_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := generate_order_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_order_number
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION set_order_number();

-- Enable RLS on order_items if not already enabled
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Drop and recreate RLS policies for order_items to ensure they're correct
DROP POLICY IF EXISTS "Users can view order items for orders they can access" ON order_items;
DROP POLICY IF EXISTS "Users can manage order items for orders they can access" ON order_items;

CREATE POLICY "Users can view order items for orders they can access"
  ON order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      JOIN profiles ON profiles.id = auth.uid()
      WHERE orders.id = order_items.order_id
      AND (profiles.role = 'admin' OR profiles.store_id = orders.store_id)
    )
  );

CREATE POLICY "Users can manage order items for orders they can access"
  ON order_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      JOIN profiles ON profiles.id = auth.uid()
      WHERE orders.id = order_items.order_id
      AND (profiles.role = 'admin' OR profiles.store_id = orders.store_id)
      AND orders.status = 'draft'
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_supplier ON orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_orders_store ON orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_by ON orders(created_by);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);
