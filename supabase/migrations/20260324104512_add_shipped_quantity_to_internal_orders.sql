/*
  # Add Shipped Quantity Tracking to Internal Orders

  1. Changes
    - Add `shipped_quantity` to `internal_order_lines` to track actual shipped amount
    - This allows comparison between requested and actual shipped quantities
    
  2. Notes
    - `quantity` = requested quantity (from restaurant)
    - `shipped_quantity` = actual shipped (sum of selected packages)
*/

-- Add shipped_quantity column to internal_order_lines
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'internal_order_lines' AND column_name = 'shipped_quantity'
  ) THEN
    ALTER TABLE internal_order_lines ADD COLUMN shipped_quantity numeric;
  END IF;
END $$;
