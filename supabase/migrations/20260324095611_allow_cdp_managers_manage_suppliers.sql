/*
  # Allow CDP Managers to Manage Suppliers

  1. Changes
    - Drop existing "Admins can manage suppliers" policy
    - Create new policy that allows both admin and cdp_manager roles
    - Update supplier_units policies to allow cdp_managers
    - Update supplier_products policies to allow cdp_managers

  2. Security
    - Maintains proper access control
    - Extends management capabilities to CDP managers
    - Aligns with navigation permissions
*/

-- Drop and recreate suppliers policy
DROP POLICY IF EXISTS "Admins can manage suppliers" ON suppliers;

CREATE POLICY "Admins and CDP managers can manage suppliers"
  ON suppliers FOR ALL
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'cdp_manager')))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'cdp_manager')));

-- Update supplier_units policies
DROP POLICY IF EXISTS "Admins can manage supplier units" ON supplier_units;

CREATE POLICY "Admins and CDP managers can insert supplier units"
  ON supplier_units FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'cdp_manager')));

CREATE POLICY "Admins and CDP managers can update supplier units"
  ON supplier_units FOR UPDATE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'cdp_manager')))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'cdp_manager')));

CREATE POLICY "Admins and CDP managers can delete supplier units"
  ON supplier_units FOR DELETE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'cdp_manager')));

-- Update supplier_products policies
DROP POLICY IF EXISTS "Admins can manage supplier products" ON supplier_products;

CREATE POLICY "Admins and CDP managers can insert supplier products"
  ON supplier_products FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'cdp_manager')));

CREATE POLICY "Admins and CDP managers can update supplier products"
  ON supplier_products FOR UPDATE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'cdp_manager')))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'cdp_manager')));

CREATE POLICY "Admins and CDP managers can delete supplier products"
  ON supplier_products FOR DELETE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'cdp_manager')));
