/*
  # Update All RLS Policies to Use New Role Names

  1. Changes
    - Update all RLS policies to use new role names:
      - 'admin' -> 'Admin'
      - 'cdp_manager' -> 'Chefe'
      - 'cdp_staff' -> 'Staff'
      - 'restaurant_manager' -> 'Chefe'
      - 'restaurant_staff' -> 'Staff'
    - Drop all existing policies
    - Recreate policies with correct role names
  
  2. Security
    - Maintain same access patterns
    - Use consistent role names across all tables
*/

-- ======================
-- AUDIT LOGS
-- ======================
DROP POLICY IF EXISTS "Admins and managers can view audit logs" ON audit_logs;

CREATE POLICY "Admin and Chefe can view audit logs"
  ON audit_logs
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR (
      auth.uid() IN (SELECT id FROM profiles WHERE role = 'Chefe')
      AND user_id IN (
        SELECT p.id FROM profiles p 
        WHERE p.unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
      )
    )
  );

-- ======================
-- DEPARTMENTS
-- ======================
DROP POLICY IF EXISTS "Admins can manage departments" ON departments;

CREATE POLICY "Admin can view departments"
  ON departments
  FOR SELECT
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can create departments"
  ON departments
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can update departments"
  ON departments
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can delete departments"
  ON departments
  FOR DELETE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

-- ======================
-- GOODS RECEIPTS
-- ======================
DROP POLICY IF EXISTS "Staff can create receipts" ON goods_receipts;
DROP POLICY IF EXISTS "Staff can update receipts" ON goods_receipts;
DROP POLICY IF EXISTS "Users can view receipts for their unit" ON goods_receipts;

CREATE POLICY "Staff can create receipts"
  ON goods_receipts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE role IN ('Admin', 'Chefe', 'Staff')
    )
  );

CREATE POLICY "Staff can update receipts"
  ON goods_receipts
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can view receipts for their unit"
  ON goods_receipts
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
  );

-- ======================
-- GOODS RECEIPT LINES
-- ======================
DROP POLICY IF EXISTS "Staff can manage receipt lines" ON goods_receipt_lines;
DROP POLICY IF EXISTS "Users can view receipt lines" ON goods_receipt_lines;

CREATE POLICY "Staff can manage receipt lines"
  ON goods_receipt_lines
  FOR ALL
  TO authenticated
  USING (
    receipt_id IN (
      SELECT id FROM goods_receipts
      WHERE auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
        OR unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    receipt_id IN (
      SELECT id FROM goods_receipts
      WHERE auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
        OR unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users can view receipt lines"
  ON goods_receipt_lines
  FOR SELECT
  TO authenticated
  USING (
    receipt_id IN (
      SELECT id FROM goods_receipts
      WHERE auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
        OR unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    )
  );

-- ======================
-- INTERNAL ORDERS
-- ======================
DROP POLICY IF EXISTS "Restaurant staff can create internal orders" ON internal_orders;
DROP POLICY IF EXISTS "Staff can update internal orders" ON internal_orders;
DROP POLICY IF EXISTS "Users can view orders for their unit" ON internal_orders;

CREATE POLICY "Staff can create internal orders"
  ON internal_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE role IN ('Admin', 'Chefe', 'Staff')
    )
  );

CREATE POLICY "Staff can update internal orders"
  ON internal_orders
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR from_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    OR to_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR from_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    OR to_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can view orders for their unit"
  ON internal_orders
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR from_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    OR to_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
  );

-- ======================
-- INTERNAL ORDER LINES
-- ======================
DROP POLICY IF EXISTS "Staff can manage order lines" ON internal_order_lines;
DROP POLICY IF EXISTS "Users can view order lines for their unit" ON internal_order_lines;

CREATE POLICY "Staff can manage order lines"
  ON internal_order_lines
  FOR ALL
  TO authenticated
  USING (
    order_id IN (
      SELECT id FROM internal_orders
      WHERE auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
        OR from_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
        OR to_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    order_id IN (
      SELECT id FROM internal_orders
      WHERE auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
        OR from_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
        OR to_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users can view order lines for their unit"
  ON internal_order_lines
  FOR SELECT
  TO authenticated
  USING (
    order_id IN (
      SELECT id FROM internal_orders
      WHERE auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
        OR from_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
        OR to_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    )
  );

-- ======================
-- INTERNAL ORDER PACKAGES
-- ======================
DROP POLICY IF EXISTS "Staff can manage order packages" ON internal_order_packages;
DROP POLICY IF EXISTS "Users can view order packages" ON internal_order_packages;

CREATE POLICY "Staff can manage order packages"
  ON internal_order_packages
  FOR ALL
  TO authenticated
  USING (
    order_id IN (
      SELECT id FROM internal_orders
      WHERE auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
        OR from_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
        OR to_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    order_id IN (
      SELECT id FROM internal_orders
      WHERE auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
        OR from_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
        OR to_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users can view order packages"
  ON internal_order_packages
  FOR SELECT
  TO authenticated
  USING (
    order_id IN (
      SELECT id FROM internal_orders
      WHERE auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
        OR from_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
        OR to_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    )
  );

-- ======================
-- PACKAGED UNITS
-- ======================
DROP POLICY IF EXISTS "Authenticated staff can create packages" ON packaged_units;
DROP POLICY IF EXISTS "Authenticated staff can update packages" ON packaged_units;
DROP POLICY IF EXISTS "Users can view packages for their unit" ON packaged_units;

CREATE POLICY "Staff can create packages"
  ON packaged_units
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE role IN ('Admin', 'Chefe', 'Staff')
    )
  );

CREATE POLICY "Staff can update packages"
  ON packaged_units
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE role IN ('Admin', 'Chefe', 'Staff')
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE role IN ('Admin', 'Chefe', 'Staff')
    )
  );

CREATE POLICY "Users can view packages for their unit"
  ON packaged_units
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR location_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
  );

-- ======================
-- PERMISSIONS
-- ======================
DROP POLICY IF EXISTS "Admins can manage permissions" ON permissions;

CREATE POLICY "Admin can view permissions"
  ON permissions
  FOR SELECT
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can create permissions"
  ON permissions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can update permissions"
  ON permissions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can delete permissions"
  ON permissions
  FOR DELETE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

-- ======================
-- PRODUCT CATEGORIES
-- ======================
DROP POLICY IF EXISTS "Admins can manage categories" ON product_categories;

CREATE POLICY "Admin can view categories"
  ON product_categories
  FOR SELECT
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can create categories"
  ON product_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can update categories"
  ON product_categories
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can delete categories"
  ON product_categories
  FOR DELETE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

-- ======================
-- PRODUCTION BATCHES
-- ======================
DROP POLICY IF EXISTS "CDP staff can create batches" ON production_batches;
DROP POLICY IF EXISTS "CDP staff can update batches" ON production_batches;
DROP POLICY IF EXISTS "Users can view batches for their unit" ON production_batches;

CREATE POLICY "CDP staff can create batches"
  ON production_batches
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE role IN ('Admin', 'Chefe', 'Staff')
    )
  );

CREATE POLICY "CDP staff can update batches"
  ON production_batches
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE role IN ('Admin', 'Chefe', 'Staff')
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE role IN ('Admin', 'Chefe', 'Staff')
    )
  );

CREATE POLICY "Users can view batches for their unit"
  ON production_batches
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR location_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
  );

-- ======================
-- PURCHASE ORDERS
-- ======================
DROP POLICY IF EXISTS "Staff can create purchase orders" ON purchase_orders;
DROP POLICY IF EXISTS "Staff can update purchase orders" ON purchase_orders;
DROP POLICY IF EXISTS "Users can view purchase orders for their unit" ON purchase_orders;

CREATE POLICY "Managers can create purchase orders"
  ON purchase_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE role IN ('Admin', 'Chefe')
    )
  );

CREATE POLICY "Managers can update purchase orders"
  ON purchase_orders
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can view purchase orders for their unit"
  ON purchase_orders
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
  );

-- ======================
-- PURCHASE ORDER LINES
-- ======================
DROP POLICY IF EXISTS "Staff can manage purchase order lines" ON purchase_order_lines;
DROP POLICY IF EXISTS "Users can view purchase order lines" ON purchase_order_lines;

CREATE POLICY "Staff can manage purchase order lines"
  ON purchase_order_lines
  FOR ALL
  TO authenticated
  USING (
    order_id IN (
      SELECT id FROM purchase_orders
      WHERE auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
        OR unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    order_id IN (
      SELECT id FROM purchase_orders
      WHERE auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
        OR unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users can view purchase order lines"
  ON purchase_order_lines
  FOR SELECT
  TO authenticated
  USING (
    order_id IN (
      SELECT id FROM purchase_orders
      WHERE auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
        OR unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    )
  );

-- ======================
-- ROLE PERMISSIONS
-- ======================
DROP POLICY IF EXISTS "Admins can manage role permissions" ON role_permissions;

CREATE POLICY "Admin can view role permissions"
  ON role_permissions
  FOR SELECT
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can create role permissions"
  ON role_permissions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can update role permissions"
  ON role_permissions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can delete role permissions"
  ON role_permissions
  FOR DELETE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

-- ======================
-- SUPPLIER PRODUCTS
-- ======================
DROP POLICY IF EXISTS "Users can view supplier products" ON supplier_products;

CREATE POLICY "Users can view supplier products"
  ON supplier_products
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR supplier_id IN (
      SELECT su.supplier_id FROM supplier_units su
      WHERE su.unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    )
  );

-- ======================
-- SUPPLIERS
-- ======================
DROP POLICY IF EXISTS "Users can view allowed suppliers" ON suppliers;

CREATE POLICY "Users can view allowed suppliers"
  ON suppliers
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR id IN (
      SELECT su.supplier_id FROM supplier_units su
      WHERE su.unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    )
  );

-- ======================
-- UNIT SMTP SETTINGS
-- ======================
DROP POLICY IF EXISTS "Admins can delete SMTP settings" ON unit_smtp_settings;
DROP POLICY IF EXISTS "Admins can insert SMTP settings" ON unit_smtp_settings;
DROP POLICY IF EXISTS "Admins can update SMTP settings" ON unit_smtp_settings;
DROP POLICY IF EXISTS "Admins can view all SMTP settings" ON unit_smtp_settings;
DROP POLICY IF EXISTS "Unit managers can view own unit SMTP settings" ON unit_smtp_settings;

CREATE POLICY "Admin can view all SMTP settings"
  ON unit_smtp_settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can insert SMTP settings"
  ON unit_smtp_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can update SMTP settings"
  ON unit_smtp_settings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can delete SMTP settings"
  ON unit_smtp_settings
  FOR DELETE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Chefe can view own unit SMTP settings"
  ON unit_smtp_settings
  FOR SELECT
  TO authenticated
  USING (
    unit_id IN (
      SELECT unit_id FROM profiles 
      WHERE id = auth.uid() AND role = 'Chefe'
    )
  );

-- ======================
-- UNITS
-- ======================
DROP POLICY IF EXISTS "Admins can insert units" ON units;
DROP POLICY IF EXISTS "Admins can update units" ON units;
DROP POLICY IF EXISTS "Users can view own unit" ON units;

CREATE POLICY "Admin can insert units"
  ON units
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can update units"
  ON units
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Users can view own unit"
  ON units
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
  );

-- ======================
-- USER PERMISSIONS
-- ======================
DROP POLICY IF EXISTS "Admins can manage user permissions" ON user_permissions;
DROP POLICY IF EXISTS "Users can view own permissions" ON user_permissions;

CREATE POLICY "Admin can view user permissions"
  ON user_permissions
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
  );

CREATE POLICY "Admin can create user permissions"
  ON user_permissions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can update user permissions"
  ON user_permissions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can delete user permissions"
  ON user_permissions
  FOR DELETE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));
