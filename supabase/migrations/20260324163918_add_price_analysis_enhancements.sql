/*
  # Price Analysis Module Enhancements

  1. New Columns
    - Add `invoice_reference` to goods_receipts for tracking
    - Add `notes` to goods_receipt_lines for additional context
    - Add `quantity` to product_price_history for better tracking

  2. New Views
    - `price_variations_view` - Shows price changes with percentages
    - `latest_prices_by_unit_view` - Latest price per product per unit
    - `highest_prices_view` - Highest active price across all units

  3. Security
    - Add RLS policies allowing all authenticated users to view price analysis data
    - This is required for management and food cost analysis

  4. Indexes
    - Additional indexes for performance optimization
*/

-- Add invoice_reference to goods_receipts if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'goods_receipts' AND column_name = 'invoice_reference'
  ) THEN
    ALTER TABLE goods_receipts ADD COLUMN invoice_reference text;
  END IF;
END $$;

-- Add notes to goods_receipt_lines if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'goods_receipt_lines' AND column_name = 'notes'
  ) THEN
    ALTER TABLE goods_receipt_lines ADD COLUMN notes text;
  END IF;
END $$;

-- Add quantity to product_price_history if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_price_history' AND column_name = 'quantity'
  ) THEN
    ALTER TABLE product_price_history ADD COLUMN quantity numeric;
  END IF;
END $$;

-- Update RLS policies to allow all authenticated users to view price history
DROP POLICY IF EXISTS "Users can view price history in their unit" ON product_price_history;

CREATE POLICY "All authenticated users can view price history"
  ON product_price_history FOR SELECT
  TO authenticated
  USING (true);

-- Create view for price variations
CREATE OR REPLACE VIEW price_variations_view AS
WITH price_with_previous AS (
  SELECT 
    pph.id,
    pph.product_id,
    pph.unit_id,
    pph.supplier_id,
    pph.receipt_id,
    pph.unit_price,
    pph.quantity,
    pph.unit,
    pph.recorded_at,
    pph.recorded_by,
    LAG(pph.unit_price) OVER (
      PARTITION BY pph.product_id, pph.unit_id, pph.supplier_id 
      ORDER BY pph.recorded_at
    ) as previous_price
  FROM product_price_history pph
)
SELECT 
  pwp.id,
  p.name as product_name,
  pc.name as product_category,
  s.name as supplier_name,
  u.name as unit_name,
  pwp.unit_price as current_price,
  pwp.previous_price,
  pwp.quantity,
  pwp.unit as unit_measure,
  (pwp.unit_price - pwp.previous_price) as price_difference,
  CASE 
    WHEN pwp.previous_price > 0 THEN 
      ROUND(((pwp.unit_price - pwp.previous_price) / pwp.previous_price * 100)::numeric, 2)
    ELSE NULL
  END as variation_percentage,
  pwp.recorded_at,
  prof.full_name as recorded_by_name,
  gr.invoice_reference,
  grl.notes
FROM price_with_previous pwp
JOIN products p ON p.id = pwp.product_id
LEFT JOIN product_categories pc ON pc.id = p.category_id
LEFT JOIN suppliers s ON s.id = pwp.supplier_id
JOIN units u ON u.id = pwp.unit_id
LEFT JOIN profiles prof ON prof.id = pwp.recorded_by
LEFT JOIN goods_receipts gr ON gr.id = pwp.receipt_id
LEFT JOIN goods_receipt_lines grl ON grl.receipt_id = gr.id AND grl.product_id = pwp.product_id
WHERE pwp.previous_price IS NOT NULL;

-- Create view for latest prices by unit
CREATE OR REPLACE VIEW latest_prices_by_unit_view AS
WITH ranked_prices AS (
  SELECT 
    pph.product_id,
    pph.unit_id,
    pph.supplier_id,
    pph.unit_price,
    pph.unit,
    pph.quantity,
    pph.recorded_at,
    ROW_NUMBER() OVER (
      PARTITION BY pph.product_id, pph.unit_id 
      ORDER BY pph.recorded_at DESC
    ) as rn
  FROM product_price_history pph
)
SELECT 
  p.id as product_id,
  p.name as product_name,
  pc.name as product_category,
  u.id as unit_id,
  u.name as unit_name,
  s.name as supplier_name,
  rp.unit_price,
  rp.quantity,
  rp.unit as unit_measure,
  rp.recorded_at as last_purchase_date
FROM ranked_prices rp
JOIN products p ON p.id = rp.product_id
LEFT JOIN product_categories pc ON pc.id = p.category_id
JOIN units u ON u.id = rp.unit_id
LEFT JOIN suppliers s ON s.id = rp.supplier_id
WHERE rp.rn = 1;

-- Create view for highest prices (for food cost)
CREATE OR REPLACE VIEW highest_prices_view AS
WITH ranked_high_prices AS (
  SELECT 
    pph.product_id,
    pph.unit_id,
    pph.supplier_id,
    pph.unit_price,
    pph.unit,
    pph.recorded_at,
    ROW_NUMBER() OVER (
      PARTITION BY pph.product_id 
      ORDER BY pph.unit_price DESC, pph.recorded_at DESC
    ) as rn
  FROM product_price_history pph
  WHERE pph.recorded_at >= NOW() - INTERVAL '90 days'
)
SELECT 
  p.id as product_id,
  p.name as product_name,
  pc.name as product_category,
  rhp.unit_price as highest_price,
  rhp.recorded_at as last_seen_at,
  rhp.unit,
  u.name as unit_name,
  s.name as supplier_name
FROM ranked_high_prices rhp
JOIN products p ON p.id = rhp.product_id
LEFT JOIN product_categories pc ON pc.id = p.category_id
JOIN units u ON u.id = rhp.unit_id
LEFT JOIN suppliers s ON s.id = rhp.supplier_id
WHERE rhp.rn = 1;

-- Grant access to views
GRANT SELECT ON price_variations_view TO authenticated;
GRANT SELECT ON latest_prices_by_unit_view TO authenticated;
GRANT SELECT ON highest_prices_view TO authenticated;

-- Create additional indexes for performance
CREATE INDEX IF NOT EXISTS idx_price_history_supplier_id ON product_price_history(supplier_id);
CREATE INDEX IF NOT EXISTS idx_price_history_unit_id ON product_price_history(unit_id);
CREATE INDEX IF NOT EXISTS idx_price_history_composite ON product_price_history(product_id, unit_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_invoice_ref ON goods_receipts(invoice_reference);
