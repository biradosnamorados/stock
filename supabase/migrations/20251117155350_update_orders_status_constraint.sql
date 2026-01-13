/*
  # Update Orders Status Constraint

  ## Changes
  Update the status check constraint to include 'draft' instead of 'pending'
  for better clarity in the order workflow.
*/

-- Drop existing constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

-- Add new constraint with 'draft' instead of 'pending'
ALTER TABLE orders ADD CONSTRAINT orders_status_check 
  CHECK (status IN ('draft', 'sent', 'received', 'cancelled'));
