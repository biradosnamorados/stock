/*
  # Fix RLS Policies for Updated Roles

  1. Changes
    - Update all RLS policies to use correct role values: 'Admin', 'Chefe', 'Staff'
    - Replace old role references: 'admin' -> 'Admin', 'cdp_manager' -> 'Chefe'
    - Fix supplier_units policies to allow Chefe role
    - Fix supplier_products policies to allow Chefe role
    - Fix suppliers policies to allow Chefe role
    
  2. Security
    - Maintains proper access control with correct role values
    - Ensures Chefe users can manage suppliers as intended
*/

-- Update suppliers policies
DROP POLICY IF EXISTS "Admins and CDP managers can manage suppliers" ON suppliers;

CREATE POLICY "Admins and Chefes can manage suppliers"
  ON suppliers FOR ALL
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')));

-- Update supplier_units policies
DROP POLICY IF EXISTS "Admins and CDP managers can insert supplier units" ON supplier_units;
DROP POLICY IF EXISTS "Admins and CDP managers can update supplier units" ON supplier_units;
DROP POLICY IF EXISTS "Admins and CDP managers can delete supplier units" ON supplier_units;

CREATE POLICY "Admins and Chefes can insert supplier units"
  ON supplier_units FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')));

CREATE POLICY "Admins and Chefes can update supplier units"
  ON supplier_units FOR UPDATE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')));

CREATE POLICY "Admins and Chefes can delete supplier units"
  ON supplier_units FOR DELETE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')));

-- Update supplier_products policies
DROP POLICY IF EXISTS "Admins and CDP managers can insert supplier products" ON supplier_products;
DROP POLICY IF EXISTS "Admins and CDP managers can update supplier products" ON supplier_products;
DROP POLICY IF EXISTS "Admins and CDP managers can delete supplier products" ON supplier_products;

CREATE POLICY "Admins and Chefes can insert supplier products"
  ON supplier_products FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')));

CREATE POLICY "Admins and Chefes can update supplier products"
  ON supplier_products FOR UPDATE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')));

CREATE POLICY "Admins and Chefes can delete supplier products"
  ON supplier_products FOR DELETE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')));

-- Update other critical policies that might reference old roles
DROP POLICY IF EXISTS "Admins can manage all users" ON profiles;

CREATE POLICY "Admins can manage all users"
  ON profiles FOR ALL
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
  )
  WITH CHECK (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
  );
