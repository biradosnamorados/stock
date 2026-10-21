/*
  # Fix Products RLS Policies

  1. Changes
    - Drop existing policies on products table
    - Create new policies with correct role names (Admin, Chefe)
    - Separate policies for SELECT, INSERT, UPDATE, DELETE operations
  
  2. Security
    - All authenticated users can view products
    - Only Admin and Chefe can create products
    - Only Admin and Chefe can update products
    - Only Admin and Chefe can delete products
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can view products" ON products;
DROP POLICY IF EXISTS "Managers and admins can manage products" ON products;

-- Create new policies with correct role names
CREATE POLICY "Authenticated users can view products"
  ON products
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin and Chefe can create products"
  ON products
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE role IN ('Admin', 'Chefe')
    )
  );

CREATE POLICY "Admin and Chefe can update products"
  ON products
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE role IN ('Admin', 'Chefe')
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE role IN ('Admin', 'Chefe')
    )
  );

CREATE POLICY "Admin and Chefe can delete products"
  ON products
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE role IN ('Admin', 'Chefe')
    )
  );
