/*
  # Update Receptions Table for Invoice Management

  1. Changes
    - Add invoice_number column to receptions table
    - Add supplier_id column to receptions table  
    - Add reception_date column to receptions table
    - Add total_amount column to receptions table
    - Add status column to receptions table
    - Add updated_at column to receptions table
    - Make order_id nullable to support manual receptions
    - Modify received_by to reference user

  2. Notes
    - Existing receptions will need to be reviewed/updated manually
    - New invoice-based workflow supports both order-based and manual receptions
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receptions' AND column_name = 'invoice_number'
  ) THEN
    ALTER TABLE receptions ADD COLUMN invoice_number text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receptions' AND column_name = 'supplier_id'
  ) THEN
    ALTER TABLE receptions ADD COLUMN supplier_id uuid REFERENCES suppliers(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receptions' AND column_name = 'reception_date'
  ) THEN
    ALTER TABLE receptions ADD COLUMN reception_date date NOT NULL DEFAULT CURRENT_DATE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receptions' AND column_name = 'total_amount'
  ) THEN
    ALTER TABLE receptions ADD COLUMN total_amount decimal(10, 2) NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receptions' AND column_name = 'status'
  ) THEN
    ALTER TABLE receptions ADD COLUMN status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receptions' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE receptions ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

ALTER TABLE receptions ALTER COLUMN order_id DROP NOT NULL;

ALTER TABLE receptions DROP CONSTRAINT IF EXISTS receptions_received_by_fkey;
ALTER TABLE receptions ADD CONSTRAINT receptions_received_by_fkey 
  FOREIGN KEY (received_by) REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_receptions_supplier ON receptions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_receptions_date ON receptions(reception_date);
CREATE INDEX IF NOT EXISTS idx_receptions_status ON receptions(status);