/*
  # Add cancellation tracking to internal orders

  1. Changes
    - Add `cancelled_by` column to track who cancelled the order
    - Add `cancelled_at` column to track when the order was cancelled
  
  2. Security
    - No RLS changes needed (uses existing policies)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'internal_orders' AND column_name = 'cancelled_by'
  ) THEN
    ALTER TABLE internal_orders ADD COLUMN cancelled_by uuid REFERENCES profiles(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'internal_orders' AND column_name = 'cancelled_at'
  ) THEN
    ALTER TABLE internal_orders ADD COLUMN cancelled_at timestamptz;
  END IF;
END $$;
