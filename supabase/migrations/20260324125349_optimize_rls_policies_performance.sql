/*
  # Optimize RLS Policies for Performance

  1. Performance Improvements
    - Replace auth.uid() with (select auth.uid()) to prevent re-evaluation per row
    - This caching significantly improves query performance at scale
    - Affects all tables with RLS policies

  2. Security
    - Maintains exact same security model
    - Only optimization change, no functional changes
    
  3. Tables Updated
    - All tables with RLS policies using auth functions
*/

-- ======================
-- UNITS
-- ======================
DROP POLICY IF EXISTS "Admin can insert units" ON units;
DROP POLICY IF EXISTS "Admin can update units" ON units;
DROP POLICY IF EXISTS "Users can view own unit" ON units;

CREATE POLICY "Admin can insert units"
  ON units
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can update units"
  ON units
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'))
  WITH CHECK ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Users can view own unit"
  ON units
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
  );

-- ======================
-- DEPARTMENTS
-- ======================
DROP POLICY IF EXISTS "Admin can view departments" ON departments;
DROP POLICY IF EXISTS "Admin can create departments" ON departments;
DROP POLICY IF EXISTS "Admin can update departments" ON departments;
DROP POLICY IF EXISTS "Admin can delete departments" ON departments;

CREATE POLICY "Admin can view departments"
  ON departments
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can create departments"
  ON departments
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can update departments"
  ON departments
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'))
  WITH CHECK ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can delete departments"
  ON departments
  FOR DELETE
  TO authenticated
  USING ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'));

-- ======================
-- PERMISSIONS
-- ======================
DROP POLICY IF EXISTS "Admin can view permissions" ON permissions;
DROP POLICY IF EXISTS "Admin can create permissions" ON permissions;
DROP POLICY IF EXISTS "Admin can update permissions" ON permissions;
DROP POLICY IF EXISTS "Admin can delete permissions" ON permissions;

CREATE POLICY "Admin can view permissions"
  ON permissions
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can create permissions"
  ON permissions
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can update permissions"
  ON permissions
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'))
  WITH CHECK ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can delete permissions"
  ON permissions
  FOR DELETE
  TO authenticated
  USING ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'));

-- ======================
-- ROLE PERMISSIONS
-- ======================
DROP POLICY IF EXISTS "Admin can view role permissions" ON role_permissions;
DROP POLICY IF EXISTS "Admin can create role permissions" ON role_permissions;
DROP POLICY IF EXISTS "Admin can update role permissions" ON role_permissions;
DROP POLICY IF EXISTS "Admin can delete role permissions" ON role_permissions;

CREATE POLICY "Admin can view role permissions"
  ON role_permissions
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can create role permissions"
  ON role_permissions
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can update role permissions"
  ON role_permissions
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'))
  WITH CHECK ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can delete role permissions"
  ON role_permissions
  FOR DELETE
  TO authenticated
  USING ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'));

-- ======================
-- USER PERMISSIONS
-- ======================
DROP POLICY IF EXISTS "Admin can view user permissions" ON user_permissions;
DROP POLICY IF EXISTS "Admin can create user permissions" ON user_permissions;
DROP POLICY IF EXISTS "Admin can update user permissions" ON user_permissions;
DROP POLICY IF EXISTS "Admin can delete user permissions" ON user_permissions;

CREATE POLICY "Admin can view user permissions"
  ON user_permissions
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can create user permissions"
  ON user_permissions
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can update user permissions"
  ON user_permissions
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'))
  WITH CHECK ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can delete user permissions"
  ON user_permissions
  FOR DELETE
  TO authenticated
  USING ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'));

-- ======================
-- PRODUCT CATEGORIES
-- ======================
DROP POLICY IF EXISTS "Admin can view categories" ON product_categories;
DROP POLICY IF EXISTS "Admin can create categories" ON product_categories;
DROP POLICY IF EXISTS "Admin can update categories" ON product_categories;
DROP POLICY IF EXISTS "Admin can delete categories" ON product_categories;

CREATE POLICY "Admin can view categories"
  ON product_categories
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can create categories"
  ON product_categories
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can update categories"
  ON product_categories
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'))
  WITH CHECK ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can delete categories"
  ON product_categories
  FOR DELETE
  TO authenticated
  USING ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'));

-- ======================
-- PRODUCTS
-- ======================
DROP POLICY IF EXISTS "Admin and Chefe can create products" ON products;
DROP POLICY IF EXISTS "Admin and Chefe can update products" ON products;
DROP POLICY IF EXISTS "Admin and Chefe can delete products" ON products;

CREATE POLICY "Admin and Chefe can create products"
  ON products
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')));

CREATE POLICY "Admin and Chefe can update products"
  ON products
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')))
  WITH CHECK ((select auth.uid()) IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')));

CREATE POLICY "Admin and Chefe can delete products"
  ON products
  FOR DELETE
  TO authenticated
  USING ((select auth.uid()) IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')));

-- ======================
-- SUPPLIERS
-- ======================
DROP POLICY IF EXISTS "Admins and Chefes can manage suppliers" ON suppliers;
DROP POLICY IF EXISTS "Users can view allowed suppliers" ON suppliers;

CREATE POLICY "Admins and Chefes can manage suppliers"
  ON suppliers
  FOR ALL
  TO authenticated
  USING ((select auth.uid()) IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')))
  WITH CHECK ((select auth.uid()) IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')));

CREATE POLICY "Users can view allowed suppliers"
  ON suppliers
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT supplier_id FROM supplier_units
      WHERE unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
    )
  );

-- ======================
-- SUPPLIER UNITS
-- ======================
DROP POLICY IF EXISTS "Admins and Chefes can insert supplier units" ON supplier_units;
DROP POLICY IF EXISTS "Admins and Chefes can update supplier units" ON supplier_units;
DROP POLICY IF EXISTS "Admins and Chefes can delete supplier units" ON supplier_units;

CREATE POLICY "Admins and Chefes can insert supplier units"
  ON supplier_units
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')));

CREATE POLICY "Admins and Chefe can update supplier units"
  ON supplier_units
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')))
  WITH CHECK ((select auth.uid()) IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')));

CREATE POLICY "Admins and Chefes can delete supplier units"
  ON supplier_units
  FOR DELETE
  TO authenticated
  USING ((select auth.uid()) IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')));

-- ======================
-- PRODUCTION BATCHES
-- ======================
DROP POLICY IF EXISTS "CDP staff can create batches" ON production_batches;
DROP POLICY IF EXISTS "CDP staff can update batches" ON production_batches;
DROP POLICY IF EXISTS "CDP staff can delete batches" ON production_batches;
DROP POLICY IF EXISTS "Users can view batches for their unit" ON production_batches;

CREATE POLICY "CDP staff can create batches"
  ON production_batches
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe', 'Staff')));

CREATE POLICY "CDP staff can update batches"
  ON production_batches
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe', 'Staff')))
  WITH CHECK ((select auth.uid()) IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe', 'Staff')));

CREATE POLICY "CDP staff can delete batches"
  ON production_batches
  FOR DELETE
  TO authenticated
  USING ((select auth.uid()) IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe', 'Staff')));

CREATE POLICY "Users can view batches for their unit"
  ON production_batches
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR location_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
  );

-- ======================
-- SUPPLIER PRODUCTS
-- ======================
DROP POLICY IF EXISTS "Admins and Chefes can insert supplier products" ON supplier_products;
DROP POLICY IF EXISTS "Admins and Chefes can update supplier products" ON supplier_products;
DROP POLICY IF EXISTS "Admins and Chefes can delete supplier products" ON supplier_products;
DROP POLICY IF EXISTS "Users can view supplier products" ON supplier_products;

CREATE POLICY "Admins and Chefes can insert supplier products"
  ON supplier_products
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')));

CREATE POLICY "Admins and Chefes can update supplier products"
  ON supplier_products
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')))
  WITH CHECK ((select auth.uid()) IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')));

CREATE POLICY "Admins and Chefes can delete supplier products"
  ON supplier_products
  FOR DELETE
  TO authenticated
  USING ((select auth.uid()) IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')));

CREATE POLICY "Users can view supplier products"
  ON supplier_products
  FOR SELECT
  TO authenticated
  USING (
    supplier_id IN (
      SELECT supplier_id FROM supplier_units
      WHERE unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
    )
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
      WHERE (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
        OR from_unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
        OR to_unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
    )
  )
  WITH CHECK (
    order_id IN (
      SELECT id FROM internal_orders
      WHERE (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
        OR from_unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
        OR to_unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
    )
  );

CREATE POLICY "Users can view order lines for their unit"
  ON internal_order_lines
  FOR SELECT
  TO authenticated
  USING (
    order_id IN (
      SELECT id FROM internal_orders
      WHERE (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
        OR from_unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
        OR to_unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
    )
  );

-- ======================
-- PACKAGED UNITS
-- ======================
DROP POLICY IF EXISTS "Staff can create packages" ON packaged_units;
DROP POLICY IF EXISTS "Staff can update packages" ON packaged_units;
DROP POLICY IF EXISTS "Users can view packages for their unit" ON packaged_units;

CREATE POLICY "Staff can create packages"
  ON packaged_units
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe', 'Staff')));

CREATE POLICY "Staff can update packages"
  ON packaged_units
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe', 'Staff')))
  WITH CHECK ((select auth.uid()) IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe', 'Staff')));

CREATE POLICY "Users can view packages for their unit"
  ON packaged_units
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR location_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
  );

-- ======================
-- INTERNAL ORDERS
-- ======================
DROP POLICY IF EXISTS "Staff can create internal orders" ON internal_orders;
DROP POLICY IF EXISTS "Staff can update internal orders" ON internal_orders;
DROP POLICY IF EXISTS "Users can view orders for their unit" ON internal_orders;

CREATE POLICY "Staff can create internal orders"
  ON internal_orders
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe', 'Staff')));

CREATE POLICY "Staff can update internal orders"
  ON internal_orders
  FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR from_unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
    OR to_unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
  )
  WITH CHECK (
    (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR from_unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
    OR to_unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
  );

CREATE POLICY "Users can view orders for their unit"
  ON internal_orders
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR from_unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
    OR to_unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
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
      WHERE (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
        OR from_unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
        OR to_unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
    )
  )
  WITH CHECK (
    order_id IN (
      SELECT id FROM internal_orders
      WHERE (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
        OR from_unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
        OR to_unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
    )
  );

CREATE POLICY "Users can view order packages"
  ON internal_order_packages
  FOR SELECT
  TO authenticated
  USING (
    order_id IN (
      SELECT id FROM internal_orders
      WHERE (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
        OR from_unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
        OR to_unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
    )
  );

-- ======================
-- PURCHASE ORDERS
-- ======================
DROP POLICY IF EXISTS "Managers can create purchase orders" ON purchase_orders;
DROP POLICY IF EXISTS "Managers can update purchase orders" ON purchase_orders;
DROP POLICY IF EXISTS "Users can view purchase orders for their unit" ON purchase_orders;

CREATE POLICY "Managers can create purchase orders"
  ON purchase_orders
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')));

CREATE POLICY "Managers can update purchase orders"
  ON purchase_orders
  FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
  )
  WITH CHECK (
    (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
  );

CREATE POLICY "Users can view purchase orders for their unit"
  ON purchase_orders
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
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
      WHERE (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
        OR unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
    )
  )
  WITH CHECK (
    order_id IN (
      SELECT id FROM purchase_orders
      WHERE (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
        OR unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
    )
  );

CREATE POLICY "Users can view purchase order lines"
  ON purchase_order_lines
  FOR SELECT
  TO authenticated
  USING (
    order_id IN (
      SELECT id FROM purchase_orders
      WHERE (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
        OR unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
    )
  );

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
  WITH CHECK ((select auth.uid()) IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe', 'Staff')));

CREATE POLICY "Staff can update receipts"
  ON goods_receipts
  FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
  )
  WITH CHECK (
    (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
  );

CREATE POLICY "Users can view receipts for their unit"
  ON goods_receipts
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
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
      WHERE (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
        OR unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
    )
  )
  WITH CHECK (
    receipt_id IN (
      SELECT id FROM goods_receipts
      WHERE (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
        OR unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
    )
  );

CREATE POLICY "Users can view receipt lines"
  ON goods_receipt_lines
  FOR SELECT
  TO authenticated
  USING (
    receipt_id IN (
      SELECT id FROM goods_receipts
      WHERE (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
        OR unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
    )
  );

-- ======================
-- SMTP SETTINGS
-- ======================
DROP POLICY IF EXISTS "Admin can insert SMTP settings" ON unit_smtp_settings;
DROP POLICY IF EXISTS "Admin can update SMTP settings" ON unit_smtp_settings;
DROP POLICY IF EXISTS "Admin can delete SMTP settings" ON unit_smtp_settings;
DROP POLICY IF EXISTS "Admin can view all SMTP settings" ON unit_smtp_settings;
DROP POLICY IF EXISTS "Chefe can view own unit SMTP settings" ON unit_smtp_settings;

CREATE POLICY "Admin can insert SMTP settings"
  ON unit_smtp_settings
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can update SMTP settings"
  ON unit_smtp_settings
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'))
  WITH CHECK ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can delete SMTP settings"
  ON unit_smtp_settings
  FOR DELETE
  TO authenticated
  USING ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Admin can view all SMTP settings"
  ON unit_smtp_settings
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin'));

CREATE POLICY "Chefe can view own unit SMTP settings"
  ON unit_smtp_settings
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Chefe')
    AND unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
  );

-- ======================
-- AUDIT LOGS
-- ======================
DROP POLICY IF EXISTS "Admin and Chefe can view audit logs" ON audit_logs;

CREATE POLICY "Admin and Chefe can view audit logs"
  ON audit_logs
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR (
      (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Chefe')
      AND user_id IN (
        SELECT p.id FROM profiles p 
        WHERE p.unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
      )
    )
  );

-- ======================
-- PROFILES
-- ======================
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;

CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

CREATE POLICY "Users can view own profile"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (id = (select auth.uid()));

-- ======================
-- PRODUCT STOCK
-- ======================
DROP POLICY IF EXISTS "Users can view stock in their unit" ON product_stock;
DROP POLICY IF EXISTS "Users can insert stock in their unit" ON product_stock;
DROP POLICY IF EXISTS "Users can update stock in their unit" ON product_stock;

CREATE POLICY "Users can view stock in their unit"
  ON product_stock
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
  );

CREATE POLICY "Users can insert stock in their unit"
  ON product_stock
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
  );

CREATE POLICY "Users can update stock in their unit"
  ON product_stock
  FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
  )
  WITH CHECK (
    (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
  );

-- ======================
-- PRODUCT PRICE HISTORY
-- ======================
DROP POLICY IF EXISTS "Users can view price history in their unit" ON product_price_history;
DROP POLICY IF EXISTS "Users can insert price history in their unit" ON product_price_history;

CREATE POLICY "Users can view price history in their unit"
  ON product_price_history
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
  );

CREATE POLICY "Users can insert price history in their unit"
  ON product_price_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR unit_id IN (SELECT unit_id FROM profiles WHERE id = (select auth.uid()))
  );
