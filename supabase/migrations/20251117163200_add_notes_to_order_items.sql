/*
  # Add notes column to order_items

  ## Changes
  - Add optional notes column to order_items table for item-specific notes
*/

-- Add notes column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_items' AND column_name = 'notes'
  ) THEN
    ALTER TABLE order_items ADD COLUMN notes text DEFAULT NULL;
  END IF;
END $$;
