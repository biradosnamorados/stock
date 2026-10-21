/*
  # Restaurant Management System with RBAC and Traceability
  
  ## Overview
  Complete production, inventory, and ordering system for restaurant group with CDP and multiple units.
  
  ## 1. Core Tables - Authentication & Authorization
  
  ### units
  - Physical locations (CDP, Braga, Porto, Events)
  - Each user belongs to one unit
  
  ### departments
  - Organizational divisions (Production, Kitchen, Admin, etc.)
  
  ### profiles
  - Extended user profile linked to auth.users
  - Contains unit_id, department_id, role
  - Role options: admin, cdp_manager, cdp_staff, restaurant_manager, restaurant_staff, events_staff
  
  ### permissions
  - Action-based permissions (not just role-based)
  - Actions: create_production, view_stock, create_order, receive_goods, etc.
  - Can be assigned to roles or individual users
  
  ### role_permissions
  - Links roles to permissions
  
  ### user_permissions
  - Override permissions for specific users
  
  ### audit_logs
  - Complete audit trail
  - Tracks user_id, action, entity, entity_id, changes, timestamp
  
  ## 2. Product Management
  
  ### product_categories
  - Categories for products (Meat, Fish, Vegetables, etc.)
  
  ### products
  - All items that can be produced, ordered, or stocked
  - Includes metadata: shelf_life_days, storage_type, requires_batch, requires_weight
  - Flags: produced_in_cdp, purchasable
  
  ### suppliers
  - External and internal suppliers
  - CDP acts as internal supplier
  
  ### supplier_units
  - Which suppliers can supply which units
  - Restricts visibility per location
  
  ### supplier_products
  - Products available from each supplier
  - Includes supplier's product code
  
  ## 3. Production System
  
  ### production_batches
  - Batches created in CDP
  - Auto-generated batch codes (e.g., MF-230326-01)
  - Links to product, includes production_date, expiry_date
  
  ### packaged_units
  - CRITICAL: Individual package tracking
  - Each physical package has unique_code and display_code
  - Tracks weight, location, status
  - Status: in_stock, reserved, shipped, received, opened, consumed, waste, blocked
  - Stock is calculated from these records
  
  ## 4. Ordering System
  
  ### internal_orders & internal_order_lines
  - Orders from restaurants to CDP
  - CDP prepares and ships packaged_units
  
  ### purchase_orders & purchase_order_lines
  - Orders to external suppliers
  - Includes PDF generation and SMTP status
  
  ### goods_receipts & goods_receipt_lines
  - Receiving deliveries from suppliers
  - Tracks quantity ordered vs received
  - Captures batch info and expiry dates
  
  ## 5. Security - Row Level Security
  
  All tables have RLS enabled with policies based on:
  - User's role
  - User's unit_id
  - Action-based permissions
  - Data ownership
  
  ## 6. Important Notes
  
  - Stock is calculated dynamically from packaged_units table
  - Each packaged unit generates QR code for scanning
  - Audit logs track all critical operations
  - FIFO logic supported through production_date and expiry_date
  - CDP acts as internal supplier for restaurants
*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. CORE TABLES - UNITS, DEPARTMENTS, USERS, RBAC
-- =====================================================

-- Units (locations)
CREATE TABLE IF NOT EXISTS units (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('cdp', 'restaurant', 'events')),
  address text,
  phone text,
  email text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE units ENABLE ROW LEVEL SECURITY;

-- Departments
CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text UNIQUE NOT NULL,
  description text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

-- User profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  unit_id uuid REFERENCES units(id) ON DELETE RESTRICT,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  role text NOT NULL CHECK (role IN ('admin', 'cdp_manager', 'cdp_staff', 'restaurant_manager', 'restaurant_staff', 'events_staff')),
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Permissions (action-based)
CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  module text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

-- Role permissions
CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  role text NOT NULL CHECK (role IN ('admin', 'cdp_manager', 'cdp_staff', 'restaurant_manager', 'restaurant_staff', 'events_staff')),
  permission_id uuid REFERENCES permissions(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(role, permission_id)
);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- User-specific permission overrides
CREATE TABLE IF NOT EXISTS user_permissions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  permission_id uuid REFERENCES permissions(id) ON DELETE CASCADE,
  granted boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, permission_id)
);

ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  changes jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 2. PRODUCT MANAGEMENT
-- =====================================================

-- Product categories
CREATE TABLE IF NOT EXISTS product_categories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text UNIQUE NOT NULL,
  description text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;

-- Products
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  category_id uuid REFERENCES product_categories(id) ON DELETE SET NULL,
  unit text NOT NULL CHECK (unit IN ('kg', 'L', 'units', 'g', 'ml')),
  shelf_life_days integer,
  storage_type text CHECK (storage_type IN ('frozen', 'refrigerated', 'ambient')),
  requires_batch boolean DEFAULT true,
  requires_weight boolean DEFAULT false,
  produced_in_cdp boolean DEFAULT false,
  purchasable boolean DEFAULT true,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('external', 'internal')),
  email text,
  phone text,
  address text,
  contact_person text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

-- Supplier-Unit permissions (which suppliers can supply which units)
CREATE TABLE IF NOT EXISTS supplier_units (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id uuid REFERENCES suppliers(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES units(id) ON DELETE CASCADE,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(supplier_id, unit_id)
);

ALTER TABLE supplier_units ENABLE ROW LEVEL SECURITY;

-- Supplier products
CREATE TABLE IF NOT EXISTS supplier_products (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id uuid REFERENCES suppliers(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  supplier_code text,
  unit_price decimal(10,2),
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(supplier_id, product_id)
);

ALTER TABLE supplier_products ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 3. PRODUCTION SYSTEM
-- =====================================================

-- Production batches
CREATE TABLE IF NOT EXISTS production_batches (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_code text UNIQUE NOT NULL,
  product_id uuid REFERENCES products(id) ON DELETE RESTRICT,
  production_date date NOT NULL DEFAULT CURRENT_DATE,
  expiry_date date,
  location_id uuid REFERENCES units(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  notes text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'completed', 'blocked')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE production_batches ENABLE ROW LEVEL SECURITY;

-- Packaged units (individual package tracking)
CREATE TABLE IF NOT EXISTS packaged_units (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  unique_code text UNIQUE NOT NULL,
  display_code text NOT NULL,
  batch_id uuid REFERENCES production_batches(id) ON DELETE RESTRICT,
  product_id uuid REFERENCES products(id) ON DELETE RESTRICT,
  weight decimal(10,3),
  unit text CHECK (unit IN ('kg', 'L', 'units', 'g', 'ml')),
  status text DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'reserved', 'shipped', 'received', 'opened', 'consumed', 'waste', 'blocked')),
  location_id uuid REFERENCES units(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  opened_at timestamptz,
  opened_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  consumed_at timestamptz,
  consumed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE packaged_units ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 4. INTERNAL ORDERS (CDP to Restaurants)
-- =====================================================

-- Internal orders
CREATE TABLE IF NOT EXISTS internal_orders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number text UNIQUE NOT NULL,
  from_unit_id uuid REFERENCES units(id) ON DELETE RESTRICT,
  to_unit_id uuid REFERENCES units(id) ON DELETE RESTRICT,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'shipped', 'received', 'cancelled')),
  requested_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  prepared_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  shipped_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  received_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  requested_date date DEFAULT CURRENT_DATE,
  delivery_date date,
  shipped_at timestamptz,
  received_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE internal_orders ENABLE ROW LEVEL SECURITY;

-- Internal order lines
CREATE TABLE IF NOT EXISTS internal_order_lines (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id uuid REFERENCES internal_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE RESTRICT,
  quantity decimal(10,3) NOT NULL,
  unit text NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE internal_order_lines ENABLE ROW LEVEL SECURITY;

-- Internal order packages (assigned packaged_units)
CREATE TABLE IF NOT EXISTS internal_order_packages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id uuid REFERENCES internal_orders(id) ON DELETE CASCADE,
  order_line_id uuid REFERENCES internal_order_lines(id) ON DELETE CASCADE,
  packaged_unit_id uuid REFERENCES packaged_units(id) ON DELETE RESTRICT,
  assigned_at timestamptz DEFAULT now(),
  assigned_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE(packaged_unit_id, order_id)
);

ALTER TABLE internal_order_packages ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 5. PURCHASE ORDERS (External Suppliers)
-- =====================================================

-- Purchase orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number text UNIQUE NOT NULL,
  unit_id uuid REFERENCES units(id) ON DELETE RESTRICT,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE RESTRICT,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'confirmed', 'partially_received', 'received', 'cancelled')),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  order_date date DEFAULT CURRENT_DATE,
  expected_delivery_date date,
  pdf_path text,
  pdf_generated_at timestamptz,
  email_sent_at timestamptz,
  email_status text CHECK (email_status IN ('pending', 'sent', 'failed')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

-- Purchase order lines
CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id uuid REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE RESTRICT,
  quantity decimal(10,3) NOT NULL,
  unit text NOT NULL,
  unit_price decimal(10,2),
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 6. GOODS RECEIPTS
-- =====================================================

-- Goods receipts
CREATE TABLE IF NOT EXISTS goods_receipts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_number text UNIQUE NOT NULL,
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES units(id) ON DELETE RESTRICT,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE RESTRICT,
  received_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  received_at timestamptz DEFAULT now(),
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE goods_receipts ENABLE ROW LEVEL SECURITY;

-- Goods receipt lines
CREATE TABLE IF NOT EXISTS goods_receipt_lines (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_id uuid REFERENCES goods_receipts(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE RESTRICT,
  order_line_id uuid REFERENCES purchase_order_lines(id) ON DELETE SET NULL,
  qty_ordered decimal(10,3),
  qty_received decimal(10,3) NOT NULL,
  unit text NOT NULL,
  batch_code text,
  expiry_date date,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE goods_receipt_lines ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 7. INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_profiles_unit ON profiles(unit_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_supplier_products_supplier ON supplier_products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_products_product ON supplier_products(product_id);

CREATE INDEX IF NOT EXISTS idx_production_batches_product ON production_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_production_batches_location ON production_batches(location_id);
CREATE INDEX IF NOT EXISTS idx_production_batches_code ON production_batches(batch_code);

CREATE INDEX IF NOT EXISTS idx_packaged_units_batch ON packaged_units(batch_id);
CREATE INDEX IF NOT EXISTS idx_packaged_units_product ON packaged_units(product_id);
CREATE INDEX IF NOT EXISTS idx_packaged_units_location ON packaged_units(location_id);
CREATE INDEX IF NOT EXISTS idx_packaged_units_status ON packaged_units(status);
CREATE INDEX IF NOT EXISTS idx_packaged_units_unique_code ON packaged_units(unique_code);

CREATE INDEX IF NOT EXISTS idx_internal_orders_from ON internal_orders(from_unit_id);
CREATE INDEX IF NOT EXISTS idx_internal_orders_to ON internal_orders(to_unit_id);
CREATE INDEX IF NOT EXISTS idx_internal_orders_status ON internal_orders(status);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_unit ON purchase_orders(unit_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);

-- =====================================================
-- 8. ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Units: Admin can see all, others see their own unit
CREATE POLICY "Users can view own unit"
  ON units FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
    OR id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Admins can insert units"
  ON units FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

CREATE POLICY "Admins can update units"
  ON units FOR UPDATE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- Departments: All authenticated users can view
CREATE POLICY "Authenticated users can view departments"
  ON departments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage departments"
  ON departments FOR ALL
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- Profiles: Users can view profiles in their unit, admins see all
CREATE POLICY "Users can view profiles in their unit"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
    OR unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Admins can manage all profiles"
  ON profiles FOR ALL
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- Permissions: All authenticated users can view
CREATE POLICY "Authenticated users can view permissions"
  ON permissions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage permissions"
  ON permissions FOR ALL
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- Role permissions: All authenticated users can view
CREATE POLICY "Authenticated users can view role permissions"
  ON role_permissions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage role permissions"
  ON role_permissions FOR ALL
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- User permissions: Users can view own, admins see all
CREATE POLICY "Users can view own permissions"
  ON user_permissions FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

CREATE POLICY "Admins can manage user permissions"
  ON user_permissions FOR ALL
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- Audit logs: Admins and managers can view logs for their unit
CREATE POLICY "Admins and managers can view audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
    OR (
      auth.uid() IN (SELECT id FROM profiles WHERE role IN ('cdp_manager', 'restaurant_manager'))
      AND user_id IN (SELECT id FROM profiles p WHERE p.unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid()))
    )
  );

CREATE POLICY "System can insert audit logs"
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Products: All authenticated users can view
CREATE POLICY "Authenticated users can view products"
  ON products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Managers and admins can manage products"
  ON products FOR ALL
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'cdp_manager')))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'cdp_manager')));

-- Product categories: All authenticated users can view
CREATE POLICY "Authenticated users can view categories"
  ON product_categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage categories"
  ON product_categories FOR ALL
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- Suppliers: Users see suppliers allowed for their unit
CREATE POLICY "Users can view allowed suppliers"
  ON suppliers FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
    OR id IN (
      SELECT supplier_id FROM supplier_units su
      WHERE su.unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Admins can manage suppliers"
  ON suppliers FOR ALL
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- Supplier units: Admins manage
CREATE POLICY "Authenticated users can view supplier units"
  ON supplier_units FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage supplier units"
  ON supplier_units FOR ALL
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- Supplier products: Users see products from allowed suppliers
CREATE POLICY "Users can view supplier products"
  ON supplier_products FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
    OR supplier_id IN (
      SELECT supplier_id FROM supplier_units su
      WHERE su.unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Admins can manage supplier products"
  ON supplier_products FOR ALL
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- Production batches: Users see batches for their unit
CREATE POLICY "Users can view batches for their unit"
  ON production_batches FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
    OR location_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "CDP staff can create batches"
  ON production_batches FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'cdp_manager', 'cdp_staff'))
  );

CREATE POLICY "CDP staff can update batches"
  ON production_batches FOR UPDATE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'cdp_manager', 'cdp_staff')))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'cdp_manager', 'cdp_staff')));

-- Packaged units: Users see packages for their unit
CREATE POLICY "Users can view packages for their unit"
  ON packaged_units FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
    OR location_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Authenticated staff can create packages"
  ON packaged_units FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'cdp_manager', 'cdp_staff', 'restaurant_manager', 'restaurant_staff'))
  );

CREATE POLICY "Authenticated staff can update packages"
  ON packaged_units FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'cdp_manager', 'cdp_staff', 'restaurant_manager', 'restaurant_staff'))
  )
  WITH CHECK (
    auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'cdp_manager', 'cdp_staff', 'restaurant_manager', 'restaurant_staff'))
  );

-- Internal orders: Users see orders involving their unit
CREATE POLICY "Users can view orders for their unit"
  ON internal_orders FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
    OR from_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    OR to_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Restaurant staff can create internal orders"
  ON internal_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'restaurant_manager', 'restaurant_staff'))
  );

CREATE POLICY "Staff can update internal orders"
  ON internal_orders FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
    OR from_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    OR to_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
    OR from_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    OR to_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
  );

-- Internal order lines: Same as orders
CREATE POLICY "Users can view order lines for their unit"
  ON internal_order_lines FOR SELECT
  TO authenticated
  USING (
    order_id IN (
      SELECT id FROM internal_orders WHERE
        auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
        OR from_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
        OR to_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Staff can manage order lines"
  ON internal_order_lines FOR ALL
  TO authenticated
  USING (
    order_id IN (
      SELECT id FROM internal_orders WHERE
        auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
        OR from_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
        OR to_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    order_id IN (
      SELECT id FROM internal_orders WHERE
        auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
        OR from_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
        OR to_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    )
  );

-- Internal order packages: Same as order lines
CREATE POLICY "Users can view order packages"
  ON internal_order_packages FOR SELECT
  TO authenticated
  USING (
    order_id IN (
      SELECT id FROM internal_orders WHERE
        auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
        OR from_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
        OR to_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Staff can manage order packages"
  ON internal_order_packages FOR ALL
  TO authenticated
  USING (
    order_id IN (
      SELECT id FROM internal_orders WHERE
        auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
        OR from_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
        OR to_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    order_id IN (
      SELECT id FROM internal_orders WHERE
        auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
        OR from_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
        OR to_unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    )
  );

-- Purchase orders: Users see orders for their unit
CREATE POLICY "Users can view purchase orders for their unit"
  ON purchase_orders FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
    OR unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Staff can create purchase orders"
  ON purchase_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'cdp_manager', 'restaurant_manager'))
  );

CREATE POLICY "Staff can update purchase orders"
  ON purchase_orders FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
    OR unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
    OR unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
  );

-- Purchase order lines: Same as orders
CREATE POLICY "Users can view purchase order lines"
  ON purchase_order_lines FOR SELECT
  TO authenticated
  USING (
    order_id IN (
      SELECT id FROM purchase_orders WHERE
        auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
        OR unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Staff can manage purchase order lines"
  ON purchase_order_lines FOR ALL
  TO authenticated
  USING (
    order_id IN (
      SELECT id FROM purchase_orders WHERE
        auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
        OR unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    order_id IN (
      SELECT id FROM purchase_orders WHERE
        auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
        OR unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    )
  );

-- Goods receipts: Users see receipts for their unit
CREATE POLICY "Users can view receipts for their unit"
  ON goods_receipts FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
    OR unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Staff can create receipts"
  ON goods_receipts FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'cdp_manager', 'cdp_staff', 'restaurant_manager', 'restaurant_staff'))
  );

CREATE POLICY "Staff can update receipts"
  ON goods_receipts FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
    OR unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
    OR unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
  );

-- Goods receipt lines: Same as receipts
CREATE POLICY "Users can view receipt lines"
  ON goods_receipt_lines FOR SELECT
  TO authenticated
  USING (
    receipt_id IN (
      SELECT id FROM goods_receipts WHERE
        auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
        OR unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Staff can manage receipt lines"
  ON goods_receipt_lines FOR ALL
  TO authenticated
  USING (
    receipt_id IN (
      SELECT id FROM goods_receipts WHERE
        auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
        OR unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    receipt_id IN (
      SELECT id FROM goods_receipts WHERE
        auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
        OR unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    )
  );
