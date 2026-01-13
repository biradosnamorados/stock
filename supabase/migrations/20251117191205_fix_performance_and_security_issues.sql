/*
  # Fix Performance and Security Issues

  1. Add Missing Indexes on Foreign Keys
    - Add indexes for all foreign key columns to improve query performance
    - Covers: product_suppliers, products, profiles, reception_items, receptions, 
      sales_import_items, sales_imports, stock_history, technical_sheet_ingredients, technical_sheets

  2. Optimize RLS Policies
    - Wrap auth functions in SELECT to prevent re-evaluation per row
    - Significantly improves query performance at scale

  3. Remove Duplicate and Unused Indexes
    - Drop duplicate index idx_orders_store_id (keeping idx_orders_store)
    - Unused indexes are kept as they may be used in future queries

  4. Fix Function Search Paths
    - Add explicit search_path to functions for security
*/

-- =====================================================
-- 1. ADD MISSING INDEXES ON FOREIGN KEYS
-- =====================================================

-- Product suppliers indexes
CREATE INDEX IF NOT EXISTS idx_product_suppliers_supplier_id 
  ON product_suppliers(supplier_id);

-- Products indexes
CREATE INDEX IF NOT EXISTS idx_products_category_id 
  ON products(category_id);

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_store_id 
  ON profiles(store_id);

-- Reception items indexes
CREATE INDEX IF NOT EXISTS idx_reception_items_product_id 
  ON reception_items(product_id);

CREATE INDEX IF NOT EXISTS idx_reception_items_reception_id 
  ON reception_items(reception_id);

-- Receptions indexes
CREATE INDEX IF NOT EXISTS idx_receptions_order_id 
  ON receptions(order_id);

CREATE INDEX IF NOT EXISTS idx_receptions_received_by 
  ON receptions(received_by);

CREATE INDEX IF NOT EXISTS idx_receptions_store_id_fk 
  ON receptions(store_id);

-- Sales import items indexes
CREATE INDEX IF NOT EXISTS idx_sales_import_items_import_id 
  ON sales_import_items(import_id);

CREATE INDEX IF NOT EXISTS idx_sales_import_items_technical_sheet_id 
  ON sales_import_items(technical_sheet_id);

-- Sales imports indexes
CREATE INDEX IF NOT EXISTS idx_sales_imports_imported_by 
  ON sales_imports(imported_by);

-- Stock history indexes
CREATE INDEX IF NOT EXISTS idx_stock_history_user_id 
  ON stock_history(user_id);

-- Technical sheet ingredients indexes
CREATE INDEX IF NOT EXISTS idx_technical_sheet_ingredients_product_id 
  ON technical_sheet_ingredients(product_id);

CREATE INDEX IF NOT EXISTS idx_technical_sheet_ingredients_store_id 
  ON technical_sheet_ingredients(store_id);

CREATE INDEX IF NOT EXISTS idx_technical_sheet_ingredients_technical_sheet_id 
  ON technical_sheet_ingredients(technical_sheet_id);

-- Technical sheets indexes
CREATE INDEX IF NOT EXISTS idx_technical_sheets_created_by 
  ON technical_sheets(created_by);

-- =====================================================
-- 2. REMOVE DUPLICATE INDEXES
-- =====================================================

DROP INDEX IF EXISTS idx_orders_store_id;

-- =====================================================
-- 3. OPTIMIZE RLS POLICIES - Stores
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage all stores" ON stores;
CREATE POLICY "Admins can manage all stores"
  ON stores FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Store users can view their store" ON stores;
CREATE POLICY "Store users can view their store"
  ON stores FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT store_id FROM profiles 
      WHERE profiles.id = (SELECT auth.uid())
    )
  );

-- =====================================================
-- 4. OPTIMIZE RLS POLICIES - Profiles
-- =====================================================

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

-- =====================================================
-- 5. OPTIMIZE RLS POLICIES - Suppliers
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage all suppliers" ON suppliers;
CREATE POLICY "Admins can manage all suppliers"
  ON suppliers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Store users can view suppliers serving their store" ON suppliers;
CREATE POLICY "Store users can view suppliers serving their store"
  ON suppliers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM supplier_stores
      JOIN profiles ON profiles.store_id = supplier_stores.store_id
      WHERE supplier_stores.supplier_id = suppliers.id
      AND profiles.id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Store users can update suppliers serving their store" ON suppliers;
CREATE POLICY "Store users can update suppliers serving their store"
  ON suppliers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM supplier_stores
      JOIN profiles ON profiles.store_id = supplier_stores.store_id
      WHERE supplier_stores.supplier_id = suppliers.id
      AND profiles.id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can insert suppliers" ON suppliers;
CREATE POLICY "Users can insert suppliers"
  ON suppliers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete suppliers they manage" ON suppliers;
CREATE POLICY "Users can delete suppliers they manage"
  ON suppliers FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM supplier_stores
      JOIN profiles ON profiles.store_id = supplier_stores.store_id
      WHERE supplier_stores.supplier_id = suppliers.id
      AND profiles.id = (SELECT auth.uid())
    )
  );

-- =====================================================
-- 6. OPTIMIZE RLS POLICIES - Categories
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage categories" ON categories;
CREATE POLICY "Admins can manage categories"
  ON categories FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

-- =====================================================
-- 7. OPTIMIZE RLS POLICIES - Products
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage products" ON products;
CREATE POLICY "Admins can manage products"
  ON products FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

-- =====================================================
-- 8. OPTIMIZE RLS POLICIES - Product Suppliers
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage all product suppliers" ON product_suppliers;
CREATE POLICY "Admins can manage all product suppliers"
  ON product_suppliers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Store users can view their store product suppliers" ON product_suppliers;
CREATE POLICY "Store users can view their store product suppliers"
  ON product_suppliers FOR SELECT
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles 
      WHERE profiles.id = (SELECT auth.uid())
    )
  );

-- =====================================================
-- 9. OPTIMIZE RLS POLICIES - Stock
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage all stock" ON stock;
CREATE POLICY "Admins can manage all stock"
  ON stock FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Store users can manage their store stock" ON stock;
CREATE POLICY "Store users can manage their store stock"
  ON stock FOR ALL
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles 
      WHERE profiles.id = (SELECT auth.uid())
    )
  );

-- =====================================================
-- 10. OPTIMIZE RLS POLICIES - Stock History
-- =====================================================

DROP POLICY IF EXISTS "Admins can view all stock history" ON stock_history;
CREATE POLICY "Admins can view all stock history"
  ON stock_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Store users can view their store stock history" ON stock_history;
CREATE POLICY "Store users can view their store stock history"
  ON stock_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM stock
      JOIN profiles ON profiles.store_id = stock.store_id
      WHERE stock.id = stock_history.stock_id
      AND profiles.id = (SELECT auth.uid())
    )
  );

-- =====================================================
-- 11. OPTIMIZE RLS POLICIES - Technical Sheets
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage technical sheets" ON technical_sheets;
CREATE POLICY "Admins can manage technical sheets"
  ON technical_sheets FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

-- =====================================================
-- 12. OPTIMIZE RLS POLICIES - Technical Sheet Ingredients
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage technical sheet ingredients" ON technical_sheet_ingredients;
CREATE POLICY "Admins can manage technical sheet ingredients"
  ON technical_sheet_ingredients FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

-- =====================================================
-- 13. OPTIMIZE RLS POLICIES - Receptions
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage all receptions" ON receptions;
CREATE POLICY "Admins can manage all receptions"
  ON receptions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Store users can manage their store receptions" ON receptions;
CREATE POLICY "Store users can manage their store receptions"
  ON receptions FOR ALL
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles 
      WHERE profiles.id = (SELECT auth.uid())
    )
  );

-- =====================================================
-- 14. OPTIMIZE RLS POLICIES - Reception Items
-- =====================================================

DROP POLICY IF EXISTS "Users can manage reception items through receptions" ON reception_items;
CREATE POLICY "Users can manage reception items through receptions"
  ON reception_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM receptions
      JOIN profiles ON profiles.store_id = receptions.store_id
      WHERE receptions.id = reception_items.reception_id
      AND profiles.id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

-- =====================================================
-- 15. OPTIMIZE RLS POLICIES - Sales Imports
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage all sales imports" ON sales_imports;
CREATE POLICY "Admins can manage all sales imports"
  ON sales_imports FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Store users can manage their store sales imports" ON sales_imports;
CREATE POLICY "Store users can manage their store sales imports"
  ON sales_imports FOR ALL
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles 
      WHERE profiles.id = (SELECT auth.uid())
    )
  );

-- =====================================================
-- 16. OPTIMIZE RLS POLICIES - Sales Import Items
-- =====================================================

DROP POLICY IF EXISTS "Users can manage sales import items through sales imports" ON sales_import_items;
CREATE POLICY "Users can manage sales import items through sales imports"
  ON sales_import_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sales_imports
      JOIN profiles ON profiles.store_id = sales_imports.store_id
      WHERE sales_imports.id = sales_import_items.import_id
      AND profiles.id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

-- =====================================================
-- 17. OPTIMIZE RLS POLICIES - Alerts
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage all alerts" ON alerts;
CREATE POLICY "Admins can manage all alerts"
  ON alerts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Store users can manage their store alerts" ON alerts;
CREATE POLICY "Store users can manage their store alerts"
  ON alerts FOR ALL
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles 
      WHERE profiles.id = (SELECT auth.uid())
    )
  );

-- =====================================================
-- 18. OPTIMIZE RLS POLICIES - Supplier Stores
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage all supplier stores" ON supplier_stores;
CREATE POLICY "Admins can manage all supplier stores"
  ON supplier_stores FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Store users can view their store supplier relationships" ON supplier_stores;
CREATE POLICY "Store users can view their store supplier relationships"
  ON supplier_stores FOR SELECT
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles 
      WHERE profiles.id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Store users can manage their store supplier relationships" ON supplier_stores;
CREATE POLICY "Store users can manage their store supplier relationships"
  ON supplier_stores FOR INSERT
  TO authenticated
  WITH CHECK (
    store_id IN (
      SELECT store_id FROM profiles 
      WHERE profiles.id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Store users can update their store supplier relationships"
  ON supplier_stores FOR UPDATE
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles 
      WHERE profiles.id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Store users can delete their store supplier relationships"
  ON supplier_stores FOR DELETE
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles 
      WHERE profiles.id = (SELECT auth.uid())
    )
  );

-- =====================================================
-- 19. OPTIMIZE RLS POLICIES - Orders
-- =====================================================

DROP POLICY IF EXISTS "Admins can view all orders" ON orders;
CREATE POLICY "Admins can view all orders"
  ON orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can create orders" ON orders;
CREATE POLICY "Admins can create orders"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update all orders" ON orders;
CREATE POLICY "Admins can update all orders"
  ON orders FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can delete orders" ON orders;
CREATE POLICY "Admins can delete orders"
  ON orders FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Store users can view their store orders" ON orders;
CREATE POLICY "Store users can view their store orders"
  ON orders FOR SELECT
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles 
      WHERE profiles.id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Store users can create orders for their store" ON orders;
CREATE POLICY "Store users can create orders for their store"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (
    store_id IN (
      SELECT store_id FROM profiles 
      WHERE profiles.id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Store users can update their store orders" ON orders;
CREATE POLICY "Store users can update their store orders"
  ON orders FOR UPDATE
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles 
      WHERE profiles.id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Store users can delete their store draft orders" ON orders;
CREATE POLICY "Store users can delete their store draft orders"
  ON orders FOR DELETE
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles 
      WHERE profiles.id = (SELECT auth.uid())
    )
    AND status = 'draft'
  );

-- =====================================================
-- 20. OPTIMIZE RLS POLICIES - Order Items
-- =====================================================

DROP POLICY IF EXISTS "Users can view order items for accessible orders" ON order_items;
CREATE POLICY "Users can view order items for accessible orders"
  ON order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      JOIN profiles ON profiles.store_id = orders.store_id
      WHERE orders.id = order_items.order_id
      AND profiles.id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can insert order items for accessible orders" ON order_items;
CREATE POLICY "Users can insert order items for accessible orders"
  ON order_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      JOIN profiles ON profiles.store_id = orders.store_id
      WHERE orders.id = order_items.order_id
      AND profiles.id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can update order items for draft orders" ON order_items;
CREATE POLICY "Users can update order items for draft orders"
  ON order_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      JOIN profiles ON profiles.store_id = orders.store_id
      WHERE orders.id = order_items.order_id
      AND orders.status = 'draft'
      AND profiles.id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can delete order items for draft orders" ON order_items;
CREATE POLICY "Users can delete order items for draft orders"
  ON order_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      JOIN profiles ON profiles.store_id = orders.store_id
      WHERE orders.id = order_items.order_id
      AND orders.status = 'draft'
      AND profiles.id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
      AND profiles.role = 'admin'
    )
  );

-- =====================================================
-- 21. FIX FUNCTION SEARCH PATHS
-- =====================================================

CREATE OR REPLACE FUNCTION generate_order_number(store_id_param uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  year_prefix text;
  counter integer;
  order_number text;
BEGIN
  year_prefix := to_char(CURRENT_DATE, 'YYYY');
  
  SELECT COALESCE(MAX(
    CASE 
      WHEN order_number ~ ('^' || year_prefix || '-[0-9]+$')
      THEN CAST(split_part(order_number, '-', 2) AS INTEGER)
      ELSE 0
    END
  ), 0) + 1
  INTO counter
  FROM orders
  WHERE store_id = store_id_param
  AND order_number LIKE year_prefix || '-%';
  
  order_number := year_prefix || '-' || LPAD(counter::text, 4, '0');
  
  RETURN order_number;
END;
$$;

CREATE OR REPLACE FUNCTION set_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := generate_order_number(NEW.store_id);
  END IF;
  RETURN NEW;
END;
$$;