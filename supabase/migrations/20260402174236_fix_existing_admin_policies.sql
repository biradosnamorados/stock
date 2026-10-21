/*
  # Fix existing admin role references in RLS policies

  1. Changes
    - Update all RLS policies that reference 'admin' to use 'Admin'
    - Only updates policies that actually exist
  
  2. Security
    - Maintains all existing security rules
    - Only changes the role name from 'admin' to 'Admin'
*/

-- Fix units policies
DROP POLICY IF EXISTS "Admins can create units" ON units;
DROP POLICY IF EXISTS "Admins can update units" ON units;
DROP POLICY IF EXISTS "Admins can delete units" ON units;

CREATE POLICY "Admins can create units"
  ON units FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admins can update units"
  ON units FOR UPDATE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admins can delete units"
  ON units FOR DELETE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

-- Fix departments policies
DROP POLICY IF EXISTS "Admins can create departments" ON departments;
DROP POLICY IF EXISTS "Admins can update departments" ON departments;
DROP POLICY IF EXISTS "Admins can delete departments" ON departments;

CREATE POLICY "Admins can create departments"
  ON departments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admins can update departments"
  ON departments FOR UPDATE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admins can delete departments"
  ON departments FOR DELETE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

-- Fix product_categories policies
DROP POLICY IF EXISTS "Admins can view categories" ON product_categories;
DROP POLICY IF EXISTS "Admins can create categories" ON product_categories;
DROP POLICY IF EXISTS "Admins can update categories" ON product_categories;
DROP POLICY IF EXISTS "Admins can delete categories" ON product_categories;

CREATE POLICY "Admins can view categories"
  ON product_categories FOR SELECT
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admins can create categories"
  ON product_categories FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admins can update categories"
  ON product_categories FOR UPDATE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admins can delete categories"
  ON product_categories FOR DELETE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

-- Fix suppliers policies  
DROP POLICY IF EXISTS "Admins can create suppliers" ON suppliers;
DROP POLICY IF EXISTS "Admins can update suppliers" ON suppliers;
DROP POLICY IF EXISTS "Admins can delete suppliers" ON suppliers;
DROP POLICY IF EXISTS "Admins can view all suppliers" ON suppliers;

CREATE POLICY "Admins can view all suppliers"
  ON suppliers FOR SELECT
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admins can create suppliers"
  ON suppliers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admins can update suppliers"
  ON suppliers FOR UPDATE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admins can delete suppliers"
  ON suppliers FOR DELETE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));