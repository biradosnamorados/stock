/*
  # Add current_stock column to order_items

  1. Changes
    - Add current_stock column to order_items table to store the counted stock at the time of order creation
  
  2. Notes
    - This allows tracking the stock level when the order was made
    - Will be used to update the stock table when order is sent
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_items' AND column_name = 'current_stock'
  ) THEN
    ALTER TABLE order_items ADD COLUMN current_stock numeric DEFAULT 0;
  END IF;
END $$;