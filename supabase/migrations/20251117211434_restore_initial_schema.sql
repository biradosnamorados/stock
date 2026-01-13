/*
  # Restore O Bira dos Namorados - Complete Database Schema

  ## Overview
  Complete database schema restoration for restaurant stock management, food cost tracking, and supplier pricing.
  Supports two independent stores (Braga and Porto) with role-based access control.

  ## Tables Restored
  1. stores - Store locations (Braga/Porto)
  2. profiles - User profiles with roles
  3. suppliers - Supplier information per store
  4. categories - Product categories
  5. products - Product catalog
  6. product_suppliers - Pricing per supplier/store
  7. stock - Stock levels per product/store/location
  8. stock_history - Stock change tracking
  9. technical_sheets - Recipe definitions
  10. technical_sheet_ingredients - Recipe ingredients
  11. orders - Purchase orders
  12. order_items - Order line items
  13. receptions - Goods receipts
  14. reception_items - Received items
  15. sales_imports - CSV sales imports
  16. sales_import_items - Import line items
  17. alerts - System alerts

  ## Security
  - RLS enabled on all tables
  - Admin access to all data
  - Store users restricted to their store
*/

-- Create stores table
CREATE TABLE IF NOT EXISTS stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

INSERT INTO stores (name, code) VALUES
  ('Braga', 'BRG'),
  ('Porto', 'PRT')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'store_user')),
  store_id uuid REFERENCES stores(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS policies for stores
DROP POLICY IF EXISTS "Admins can manage all stores" ON stores;
CREATE POLICY "Admins can manage all stores"
  ON stores FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Store users can view their store" ON stores;
CREATE POLICY "Store users can view their store"
  ON stores FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.store_id = stores.id
    )
  );

-- RLS policies for profiles
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can manage all profiles" ON profiles;
CREATE POLICY "Admins can manage all profiles"
  ON profiles FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Create suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage all suppliers" ON suppliers;
CREATE POLICY "Admins can manage all suppliers"
  ON suppliers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Store users can manage their store suppliers" ON suppliers;
CREATE POLICY "Store users can manage their store suppliers"
  ON suppliers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.store_id = suppliers.store_id
    )
  );

-- Create categories table
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage categories" ON categories;
CREATE POLICY "Admins can manage categories"
  ON categories FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "All users can view categories" ON categories;
CREATE POLICY "All users can view categories"
  ON categories FOR SELECT
  TO authenticated
  USING (true);

-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  unit text NOT NULL,
  category_id uuid REFERENCES categories(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage products" ON products;
CREATE POLICY "Admins can manage products"
  ON products FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "All users can view products" ON products;
CREATE POLICY "All users can view products"
  ON products FOR SELECT
  TO authenticated
  USING (true);

-- Create product_suppliers table
CREATE TABLE IF NOT EXISTS product_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  price decimal(10,2) NOT NULL DEFAULT 0,
  last_price_update timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(product_id, supplier_id, store_id)
);

ALTER TABLE product_suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage all product suppliers" ON product_suppliers;
CREATE POLICY "Admins can manage all product suppliers"
  ON product_suppliers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Store users can view their store product suppliers" ON product_suppliers;
CREATE POLICY "Store users can view their store product suppliers"
  ON product_suppliers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.store_id = product_suppliers.store_id
    )
  );

-- Create stock table
CREATE TABLE IF NOT EXISTS stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  location text NOT NULL CHECK (location IN ('kitchen', 'room')),
  quantity decimal(10,2) NOT NULL DEFAULT 0,
  minimum_stock decimal(10,2) DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(product_id, store_id, location)
);

ALTER TABLE stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage all stock" ON stock;
CREATE POLICY "Admins can manage all stock"
  ON stock FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Store users can manage their store stock" ON stock;
CREATE POLICY "Store users can manage their store stock"
  ON stock FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.store_id = stock.store_id
    )
  );

-- Create stock_history table
CREATE TABLE IF NOT EXISTS stock_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id uuid NOT NULL REFERENCES stock(id) ON DELETE CASCADE,
  change_type text NOT NULL CHECK (change_type IN ('reception', 'sale', 'adjustment', 'count')),
  quantity_change decimal(10,2) NOT NULL,
  previous_quantity decimal(10,2) NOT NULL,
  new_quantity decimal(10,2) NOT NULL,
  reference_id uuid,
  notes text,
  user_id uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stock_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all stock history" ON stock_history;
CREATE POLICY "Admins can view all stock history"
  ON stock_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Store users can view their store stock history" ON stock_history;
CREATE POLICY "Store users can view their store stock history"
  ON stock_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN stock s ON s.id = stock_history.stock_id
      WHERE p.id = auth.uid()
      AND p.store_id = s.store_id
    )
  );

DROP POLICY IF EXISTS "System can insert stock history" ON stock_history;
CREATE POLICY "System can insert stock history"
  ON stock_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create technical_sheets table
CREATE TABLE IF NOT EXISTS technical_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  version integer DEFAULT 1,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE technical_sheets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage technical sheets" ON technical_sheets;
CREATE POLICY "Admins can manage technical sheets"
  ON technical_sheets FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "All users can view technical sheets" ON technical_sheets;
CREATE POLICY "All users can view technical sheets"
  ON technical_sheets FOR SELECT
  TO authenticated
  USING (true);

-- Create technical_sheet_ingredients table
CREATE TABLE IF NOT EXISTS technical_sheet_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technical_sheet_id uuid NOT NULL REFERENCES technical_sheets(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity decimal(10,3) NOT NULL,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE
);

ALTER TABLE technical_sheet_ingredients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage technical sheet ingredients" ON technical_sheet_ingredients;
CREATE POLICY "Admins can manage technical sheet ingredients"
  ON technical_sheet_ingredients FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "All users can view technical sheet ingredients" ON technical_sheet_ingredients;
CREATE POLICY "All users can view technical sheet ingredients"
  ON technical_sheet_ingredients FOR SELECT
  TO authenticated
  USING (true);

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE NOT NULL,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'sent', 'received', 'cancelled')),
  total_amount decimal(10,2) DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all orders" ON orders;
CREATE POLICY "Admins can view all orders"
  ON orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Store users can view their store orders" ON orders;
CREATE POLICY "Store users can view their store orders"
  ON orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.store_id = orders.store_id
    )
  );

DROP POLICY IF EXISTS "Admins can insert orders" ON orders;
CREATE POLICY "Admins can insert orders"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Store users can insert orders for their store" ON orders;
CREATE POLICY "Store users can insert orders for their store"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.store_id = orders.store_id
    )
  );

DROP POLICY IF EXISTS "Admins can update all orders" ON orders;
CREATE POLICY "Admins can update all orders"
  ON orders FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Store users can update their store orders" ON orders;
CREATE POLICY "Store users can update their store orders"
  ON orders FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.store_id = orders.store_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.store_id = orders.store_id
    )
  );

DROP POLICY IF EXISTS "Admins can delete all orders" ON orders;
CREATE POLICY "Admins can delete all orders"
  ON orders FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Store users can delete their store orders" ON orders;
CREATE POLICY "Store users can delete their store orders"
  ON orders FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.store_id = orders.store_id
    )
  );

-- Create order_items table
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity decimal(10,2) NOT NULL,
  unit_price decimal(10,2) NOT NULL,
  total_price decimal(10,2) NOT NULL,
  notes text,
  current_stock decimal(10,2)
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view order items if they can view the order" ON order_items;
CREATE POLICY "Users can view order items if they can view the order"
  ON order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      JOIN profiles p ON p.id = auth.uid()
      WHERE o.id = order_items.order_id
      AND (p.role = 'admin' OR p.store_id = o.store_id)
    )
  );

DROP POLICY IF EXISTS "Users can insert order items if they can modify the order" ON order_items;
CREATE POLICY "Users can insert order items if they can modify the order"
  ON order_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders o
      JOIN profiles p ON p.id = auth.uid()
      WHERE o.id = order_items.order_id
      AND (p.role = 'admin' OR p.store_id = o.store_id)
    )
  );

DROP POLICY IF EXISTS "Users can update order items if they can modify the order" ON order_items;
CREATE POLICY "Users can update order items if they can modify the order"
  ON order_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      JOIN profiles p ON p.id = auth.uid()
      WHERE o.id = order_items.order_id
      AND (p.role = 'admin' OR p.store_id = o.store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders o
      JOIN profiles p ON p.id = auth.uid()
      WHERE o.id = order_items.order_id
      AND (p.role = 'admin' OR p.store_id = o.store_id)
    )
  );

DROP POLICY IF EXISTS "Users can delete order items if they can modify the order" ON order_items;
CREATE POLICY "Users can delete order items if they can modify the order"
  ON order_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      JOIN profiles p ON p.id = auth.uid()
      WHERE o.id = order_items.order_id
      AND (p.role = 'admin' OR p.store_id = o.store_id)
    )
  );

-- Create receptions table
CREATE TABLE IF NOT EXISTS receptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  invoice_number text,
  invoice_date date,
  total_amount decimal(10,2) DEFAULT 0,
  received_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE receptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage all receptions" ON receptions;
CREATE POLICY "Admins can manage all receptions"
  ON receptions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Store users can manage their store receptions" ON receptions;
CREATE POLICY "Store users can manage their store receptions"
  ON receptions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.store_id = receptions.store_id
    )
  );

-- Create reception_items table
CREATE TABLE IF NOT EXISTS reception_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reception_id uuid NOT NULL REFERENCES receptions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  ordered_quantity decimal(10,2) NOT NULL,
  received_quantity decimal(10,2) NOT NULL,
  unit_price decimal(10,2) NOT NULL,
  location text NOT NULL CHECK (location IN ('kitchen', 'room'))
);

ALTER TABLE reception_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage reception items through receptions" ON reception_items;
CREATE POLICY "Users can manage reception items through receptions"
  ON reception_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM receptions r
      JOIN profiles p ON p.id = auth.uid()
      WHERE r.id = reception_items.reception_id
      AND (p.role = 'admin' OR p.store_id = r.store_id)
    )
  );

-- Create sales_imports table
CREATE TABLE IF NOT EXISTS sales_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  import_date date NOT NULL,
  filename text NOT NULL,
  status text NOT NULL DEFAULT 'processed' CHECK (status IN ('processed', 'simulated', 'error', 'reverted')),
  total_items integer DEFAULT 0,
  imported_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sales_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage all sales imports" ON sales_imports;
CREATE POLICY "Admins can manage all sales imports"
  ON sales_imports FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Store users can manage their store sales imports" ON sales_imports;
CREATE POLICY "Store users can manage their store sales imports"
  ON sales_imports FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.store_id = sales_imports.store_id
    )
  );

-- Create sales_import_items table
CREATE TABLE IF NOT EXISTS sales_import_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES sales_imports(id) ON DELETE CASCADE,
  article_name text NOT NULL,
  quantity decimal(10,2) NOT NULL,
  technical_sheet_id uuid REFERENCES technical_sheets(id),
  processed boolean DEFAULT false,
  error_message text
);

ALTER TABLE sales_import_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage sales import items through sales imports" ON sales_import_items;
CREATE POLICY "Users can manage sales import items through sales imports"
  ON sales_import_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sales_imports si
      JOIN profiles p ON p.id = auth.uid()
      WHERE si.id = sales_import_items.import_id
      AND (p.role = 'admin' OR p.store_id = si.store_id)
    )
  );

-- Create alerts table
CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('low_stock', 'price_outdated', 'missing_sheet', 'csv_missing', 'stock_deviation')),
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  message text NOT NULL,
  reference_id uuid,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage all alerts" ON alerts;
CREATE POLICY "Admins can manage all alerts"
  ON alerts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Store users can manage their store alerts" ON alerts;
CREATE POLICY "Store users can manage their store alerts"
  ON alerts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.store_id = alerts.store_id
    )
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_stock_store_product ON stock(store_id, product_id);
CREATE INDEX IF NOT EXISTS idx_stock_history_stock_id ON stock_history(stock_id);
CREATE INDEX IF NOT EXISTS idx_orders_store_id ON orders(store_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_store_id ON suppliers(store_id);
CREATE INDEX IF NOT EXISTS idx_product_suppliers_store ON product_suppliers(store_id, product_id);
CREATE INDEX IF NOT EXISTS idx_alerts_store_unread ON alerts(store_id, is_read);
CREATE INDEX IF NOT EXISTS idx_sales_imports_store_date ON sales_imports(store_id, import_date);