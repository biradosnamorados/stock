/*
  # System Enhancements for Complete Functionality
  
  ## Changes
  
  ### 1. User Management
  - Add password_reset_required flag to profiles
  - Add created_by to track who created the user
  
  ### 2. Audit Logs Enhancement
  - Extend audit_logs with more action types
  - Add metadata field for additional context
  
  ### 3. Package Status Enhancement
  - Add transferred status to packaged_units
  
  ### 4. Orders Enhancement
  - Add duplicate_of field to purchase_orders
  - Add email_recipient and email_error fields
  - Add resend tracking
  
  ### 5. Stock Alerts
  - Create view for stock alerts
  
  ### 6. Helper Functions
  - Create function to auto-generate order numbers
  - Create function to calculate stock levels
*/

-- Add password reset flag to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'password_reset_required'
  ) THEN
    ALTER TABLE profiles ADD COLUMN password_reset_required boolean DEFAULT false;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE profiles ADD COLUMN created_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Enhance audit_logs with metadata
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_logs' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE audit_logs ADD COLUMN metadata jsonb;
  END IF;
END $$;

-- Add transferred status and other enhancements to packaged_units
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'packaged_units' AND column_name = 'transferred_at'
  ) THEN
    ALTER TABLE packaged_units ADD COLUMN transferred_at timestamptz;
    ALTER TABLE packaged_units ADD COLUMN transferred_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Enhance purchase orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'duplicate_of'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN duplicate_of uuid REFERENCES purchase_orders(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'email_recipient'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN email_recipient text;
    ALTER TABLE purchase_orders ADD COLUMN email_error text;
    ALTER TABLE purchase_orders ADD COLUMN resend_count integer DEFAULT 0;
    ALTER TABLE purchase_orders ADD COLUMN last_sent_at timestamptz;
  END IF;
END $$;

-- Create function to auto-generate order numbers
CREATE OR REPLACE FUNCTION generate_order_number(prefix text)
RETURNS text AS $$
DECLARE
  next_num integer;
  result text;
BEGIN
  SELECT COUNT(*) + 1 INTO next_num FROM purchase_orders WHERE order_number LIKE prefix || '%';
  result := prefix || '-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(next_num::text, 4, '0');
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Create function to auto-generate internal order numbers
CREATE OR REPLACE FUNCTION generate_internal_order_number()
RETURNS text AS $$
DECLARE
  next_num integer;
  result text;
BEGIN
  SELECT COUNT(*) + 1 INTO next_num FROM internal_orders;
  result := 'INT-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(next_num::text, 4, '0');
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Create function to auto-generate receipt numbers
CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS text AS $$
DECLARE
  next_num integer;
  result text;
BEGIN
  SELECT COUNT(*) + 1 INTO next_num FROM goods_receipts;
  result := 'REC-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(next_num::text, 4, '0');
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Create stock alerts view
CREATE OR REPLACE VIEW stock_alerts AS
WITH package_summary AS (
  SELECT 
    pu.location_id,
    pu.product_id,
    p.name as product_name,
    p.code as product_code,
    COUNT(*) FILTER (WHERE pu.status IN ('in_stock', 'received')) as available_units,
    COUNT(*) FILTER (WHERE pu.status = 'blocked') as blocked_units,
    COUNT(*) FILTER (
      WHERE pb.expiry_date <= CURRENT_DATE + INTERVAL '7 days' 
      AND pu.status IN ('in_stock', 'received')
    ) as expiring_soon,
    COUNT(*) FILTER (
      WHERE pb.expiry_date < CURRENT_DATE 
      AND pu.status IN ('in_stock', 'received')
    ) as expired_units
  FROM packaged_units pu
  JOIN products p ON p.id = pu.product_id
  LEFT JOIN production_batches pb ON pb.id = pu.batch_id
  GROUP BY pu.location_id, pu.product_id, p.name, p.code
)
SELECT 
  location_id,
  product_id,
  product_name,
  product_code,
  available_units,
  blocked_units,
  expiring_soon,
  expired_units,
  CASE 
    WHEN expired_units > 0 THEN 'critical'
    WHEN expiring_soon > 0 THEN 'warning'
    WHEN available_units < 5 THEN 'low_stock'
    WHEN blocked_units > 0 THEN 'info'
    ELSE 'ok'
  END as alert_level
FROM package_summary
WHERE expired_units > 0 OR expiring_soon > 0 OR available_units < 5 OR blocked_units > 0;

-- Update departments with Portuguese names
UPDATE departments SET name = 'Produção' WHERE name = 'Production';
UPDATE departments SET name = 'Cozinha' WHERE name = 'Kitchen';
UPDATE departments SET name = 'Gestão' WHERE name = 'Management';

-- Insert additional departments
INSERT INTO departments (name, description, active) VALUES
  ('Sala', 'Dining room service', true),
  ('Bar', 'Bar service', true),
  ('Compras', 'Purchasing department', true),
  ('Armazém', 'Warehouse operations', true)
ON CONFLICT (name) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_packaged_units_location_status ON packaged_units(location_id, status);
CREATE INDEX IF NOT EXISTS idx_packaged_units_product_status ON packaged_units(product_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_unit_status ON purchase_orders(unit_id, status);
CREATE INDEX IF NOT EXISTS idx_internal_orders_to_status ON internal_orders(to_unit_id, status);
CREATE INDEX IF NOT EXISTS idx_internal_orders_from_status ON internal_orders(from_unit_id, status);

-- Grant permissions on views and functions
GRANT SELECT ON stock_alerts TO authenticated;
