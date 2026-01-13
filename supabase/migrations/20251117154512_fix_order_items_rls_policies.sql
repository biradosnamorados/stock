/*
  # Fix Order Items RLS Policies

  ## Changes
  Drop existing policies and recreate with proper USING and WITH CHECK clauses
  for INSERT operations.
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can manage order items through orders" ON order_items;
DROP POLICY IF EXISTS "Users can view order items for orders they can access" ON order_items;
DROP POLICY IF EXISTS "Users can manage order items for orders they can access" ON order_items;

-- View policy
CREATE POLICY "Users can view order items for accessible orders"
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

-- Insert policy
CREATE POLICY "Users can insert order items for accessible orders"
  ON order_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      JOIN profiles ON profiles.id = auth.uid()
      WHERE orders.id = order_items.order_id
      AND (profiles.role = 'admin' OR profiles.store_id = orders.store_id)
      AND orders.status = 'draft'
    )
  );

-- Update policy
CREATE POLICY "Users can update order items for draft orders"
  ON order_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      JOIN profiles ON profiles.id = auth.uid()
      WHERE orders.id = order_items.order_id
      AND (profiles.role = 'admin' OR profiles.store_id = orders.store_id)
      AND orders.status = 'draft'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      JOIN profiles ON profiles.id = auth.uid()
      WHERE orders.id = order_items.order_id
      AND (profiles.role = 'admin' OR profiles.store_id = orders.store_id)
      AND orders.status = 'draft'
    )
  );

-- Delete policy
CREATE POLICY "Users can delete order items for draft orders"
  ON order_items FOR DELETE
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
