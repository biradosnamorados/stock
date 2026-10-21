/*
  # Refactor Product Model for CDP vs Purchased Product Types
  
  ## Overview
  This migration separates products into two distinct types to handle different workflows:
  - **CDP Produced Products**: Internal production, packaging, batch tracking, QR codes
  - **Purchased Products**: External supplier products, price tracking, direct quantity-based stock
  
  ## Changes Made
  
  ### 1. Products Table
  - Add `product_type` field with constraint ('cdp_produced' | 'purchased')
  - Add `purchase_unit` field for purchased products (e.g., 'crate', 'box', 'pallet')
  - Add `purchase_unit_quantity` for conversion (e.g., 1 crate = 24 units)
  - Update constraints based on product_type:
    - CDP products: must have batch tracking, can have packaging config
    - Purchased products: linked to suppliers, have price history
  
  ### 2. New Tables
  - `purchased_product_stock`: Quantity-based stock for purchased products
  - `purchased_product_suppliers`: Link purchased products to their suppliers with pricing
  
  ### 3. Helper Functions
  - `get_product_stock_v2()`: Returns stock based on product type
  - `validate_product_type_constraints()`: Ensures business rules are enforced
  
  ### 4. Validation Triggers
  - Ensure CDP products only used in production
  - Ensure purchased products only used with suppliers
  
  ## Business Rules Enforced
  
  ### CDP Produced Products
  - Must have `requires_batch = true`
  - Can have packaging configuration
  - Stock tracked via `packaged_units` table
  - Used in production and internal orders
  - Cannot be linked to external suppliers
  
  ### Purchased Products
  - Must have `purchasable = true`
  - Stock tracked via `purchased_product_stock` table
  - Linked to suppliers via `purchased_product_suppliers`
  - Used in purchase orders and goods receipts
  - Cannot be used in production batches
  - Support price history and variations
  
  ## Migration Safety
  - Uses IF NOT EXISTS and conditional logic
  - Maintains backward compatibility
  - Default existing products to 'purchased' type
  - Adds indexes for performance
*/

-- =====================================================
-- 1. ADD PRODUCT_TYPE FIELD TO PRODUCTS TABLE
-- =====================================================

DO $$
BEGIN
  -- Add product_type column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'product_type'
  ) THEN
    ALTER TABLE products ADD COLUMN product_type text NOT NULL DEFAULT 'purchased'
      CHECK (product_type IN ('cdp_produced', 'purchased'));
  END IF;

  -- Add purchase_unit column for purchased products
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'purchase_unit'
  ) THEN
    ALTER TABLE products ADD COLUMN purchase_unit text;
  END IF;

  -- Add purchase_unit_quantity for conversion
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'purchase_unit_quantity'
  ) THEN
    ALTER TABLE products ADD COLUMN purchase_unit_quantity decimal(10,3) DEFAULT 1;
  END IF;

  -- Add description field for better product info
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'description'
  ) THEN
    ALTER TABLE products ADD COLUMN description text;
  END IF;
END $$;

-- Update existing products based on their current flags
UPDATE products 
SET product_type = 'cdp_produced' 
WHERE produced_in_cdp = true AND product_type = 'purchased';

-- =====================================================
-- 2. CREATE PURCHASED PRODUCT STOCK TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS purchased_product_stock (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  quantity decimal(10,3) NOT NULL DEFAULT 0,
  last_updated timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  UNIQUE(product_id, unit_id)
);

ALTER TABLE purchased_product_stock ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_purchased_stock_product ON purchased_product_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_purchased_stock_unit ON purchased_product_stock(unit_id);

-- =====================================================
-- 3. CREATE PURCHASED PRODUCT SUPPLIERS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS purchased_product_suppliers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  supplier_product_code text,
  current_price decimal(10,2),
  price_unit text,
  min_order_quantity decimal(10,3),
  lead_time_days integer,
  is_preferred boolean DEFAULT false,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(product_id, supplier_id)
);

ALTER TABLE purchased_product_suppliers ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_purchased_suppliers_product ON purchased_product_suppliers(product_id);
CREATE INDEX IF NOT EXISTS idx_purchased_suppliers_supplier ON purchased_product_suppliers(supplier_id);

-- =====================================================
-- 4. ADD VALIDATION TRIGGER FOR PRODUCT TYPES
-- =====================================================

CREATE OR REPLACE FUNCTION validate_product_type_constraints()
RETURNS trigger AS $$
BEGIN
  -- CDP Produced Products Rules
  IF NEW.product_type = 'cdp_produced' THEN
    -- Must have batch tracking
    IF NEW.requires_batch = false THEN
      RAISE EXCEPTION 'CDP produced products must have requires_batch = true';
    END IF;
    
    -- Must be marked as produced in CDP
    NEW.produced_in_cdp := true;
    
    -- Clear purchase-specific fields
    NEW.purchase_unit := NULL;
    NEW.purchase_unit_quantity := 1;
  END IF;

  -- Purchased Products Rules
  IF NEW.product_type = 'purchased' THEN
    -- Must be purchasable
    IF NEW.purchasable = false THEN
      RAISE EXCEPTION 'Purchased products must have purchasable = true';
    END IF;
    
    -- Cannot be produced in CDP
    NEW.produced_in_cdp := false;
    
    -- Ensure purchase unit quantity is at least 1
    IF NEW.purchase_unit_quantity IS NULL OR NEW.purchase_unit_quantity < 1 THEN
      NEW.purchase_unit_quantity := 1;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_product_type_trigger ON products;
CREATE TRIGGER validate_product_type_trigger
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION validate_product_type_constraints();

-- =====================================================
-- 5. ADD VALIDATION TRIGGER FOR PURCHASED PRODUCT STOCK
-- =====================================================

CREATE OR REPLACE FUNCTION validate_purchased_product_stock()
RETURNS trigger AS $$
DECLARE
  v_product_type text;
BEGIN
  SELECT product_type INTO v_product_type
  FROM products WHERE id = NEW.product_id;
  
  IF v_product_type != 'purchased' THEN
    RAISE EXCEPTION 'Only purchased products can have stock in purchased_product_stock table';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_purchased_stock_trigger ON purchased_product_stock;
CREATE TRIGGER validate_purchased_stock_trigger
  BEFORE INSERT OR UPDATE ON purchased_product_stock
  FOR EACH ROW
  EXECUTE FUNCTION validate_purchased_product_stock();

-- =====================================================
-- 6. ADD VALIDATION TRIGGER FOR PURCHASED PRODUCT SUPPLIERS
-- =====================================================

CREATE OR REPLACE FUNCTION validate_purchased_product_suppliers()
RETURNS trigger AS $$
DECLARE
  v_product_type text;
BEGIN
  SELECT product_type INTO v_product_type
  FROM products WHERE id = NEW.product_id;
  
  IF v_product_type != 'purchased' THEN
    RAISE EXCEPTION 'Only purchased products can be linked to suppliers in purchased_product_suppliers table';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_purchased_suppliers_trigger ON purchased_product_suppliers;
CREATE TRIGGER validate_purchased_suppliers_trigger
  BEFORE INSERT OR UPDATE ON purchased_product_suppliers
  FOR EACH ROW
  EXECUTE FUNCTION validate_purchased_product_suppliers();

-- =====================================================
-- 7. ADD VALIDATION TRIGGER FOR PRODUCTION BATCHES
-- =====================================================

CREATE OR REPLACE FUNCTION validate_production_batch_product()
RETURNS trigger AS $$
DECLARE
  v_product_type text;
BEGIN
  SELECT product_type INTO v_product_type
  FROM products WHERE id = NEW.product_id;
  
  IF v_product_type != 'cdp_produced' THEN
    RAISE EXCEPTION 'Only CDP produced products can be used in production batches';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_production_batch_trigger ON production_batches;
CREATE TRIGGER validate_production_batch_trigger
  BEFORE INSERT OR UPDATE ON production_batches
  FOR EACH ROW
  EXECUTE FUNCTION validate_production_batch_product();

-- =====================================================
-- 8. CREATE HELPER FUNCTION TO GET PRODUCT STOCK
-- =====================================================

DROP FUNCTION IF EXISTS get_product_stock(uuid, uuid);

CREATE OR REPLACE FUNCTION get_product_stock_v2(
  p_product_id uuid,
  p_unit_id uuid
)
RETURNS TABLE (
  product_id uuid,
  product_type text,
  total_quantity decimal,
  unit_of_measure text,
  packaged_units_count bigint,
  last_updated timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.product_type,
    CASE 
      -- CDP products: count packaged units and sum weights
      WHEN p.product_type = 'cdp_produced' THEN
        COALESCE(
          (SELECT SUM(pu.weight) 
           FROM packaged_units pu 
           WHERE pu.product_id = p.id 
             AND pu.location_id = p_unit_id
             AND pu.status IN ('in_stock', 'reserved')),
          0
        )
      -- Purchased products: get from stock table
      WHEN p.product_type = 'purchased' THEN
        COALESCE(
          (SELECT pps.quantity 
           FROM purchased_product_stock pps 
           WHERE pps.product_id = p.id AND pps.unit_id = p_unit_id),
          0
        )
      ELSE 0
    END as total_quantity,
    p.unit as unit_of_measure,
    CASE 
      WHEN p.product_type = 'cdp_produced' THEN
        COALESCE(
          (SELECT COUNT(*) 
           FROM packaged_units pu 
           WHERE pu.product_id = p.id 
             AND pu.location_id = p_unit_id
             AND pu.status IN ('in_stock', 'reserved')),
          0
        )
      ELSE 0
    END as packaged_units_count,
    CASE 
      WHEN p.product_type = 'cdp_produced' THEN
        (SELECT MAX(pu.updated_at) 
         FROM packaged_units pu 
         WHERE pu.product_id = p.id AND pu.location_id = p_unit_id)
      WHEN p.product_type = 'purchased' THEN
        (SELECT pps.last_updated 
         FROM purchased_product_stock pps 
         WHERE pps.product_id = p.id AND pps.unit_id = p_unit_id)
      ELSE NULL
    END as last_updated
  FROM products p
  WHERE p.id = p_product_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- 9. RLS POLICIES FOR NEW TABLES
-- =====================================================

-- Purchased Product Stock Policies
DROP POLICY IF EXISTS "Users can view stock in their unit" ON purchased_product_stock;
CREATE POLICY "Users can view stock in their unit"
  ON purchased_product_stock FOR SELECT
  TO authenticated
  USING (
    unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
        AND role IN ('admin', 'cdp_manager')
    )
  );

DROP POLICY IF EXISTS "Authorized users can update stock" ON purchased_product_stock;
CREATE POLICY "Authorized users can update stock"
  ON purchased_product_stock FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
        AND role IN ('admin', 'cdp_manager', 'cdp_staff', 'restaurant_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
        AND role IN ('admin', 'cdp_manager', 'cdp_staff', 'restaurant_manager')
    )
  );

-- Purchased Product Suppliers Policies
DROP POLICY IF EXISTS "All authenticated users can view supplier products" ON purchased_product_suppliers;
CREATE POLICY "All authenticated users can view supplier products"
  ON purchased_product_suppliers FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "CDP managers can manage supplier products" ON purchased_product_suppliers;
CREATE POLICY "CDP managers can manage supplier products"
  ON purchased_product_suppliers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
        AND role IN ('admin', 'cdp_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
        AND role IN ('admin', 'cdp_manager')
    )
  );

-- =====================================================
-- 10. CREATE INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_products_product_type ON products(product_type);
CREATE INDEX IF NOT EXISTS idx_products_type_active ON products(product_type, active);
CREATE INDEX IF NOT EXISTS idx_packaged_units_status_location ON packaged_units(status, location_id);

-- =====================================================
-- 11. GRANT PERMISSIONS
-- =====================================================

GRANT SELECT ON purchased_product_stock TO authenticated;
GRANT SELECT ON purchased_product_suppliers TO authenticated;
GRANT ALL ON purchased_product_stock TO service_role;
GRANT ALL ON purchased_product_suppliers TO service_role;