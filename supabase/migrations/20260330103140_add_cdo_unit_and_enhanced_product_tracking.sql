/*
  # Add CDO Unit Type and Enhanced Product Tracking
  
  ## Overview
  This migration implements the new business model separating CDP, CDO, and Restaurant operations.
  
  ## Changes Made
  
  ### 1. Unit Types
  - Add 'cdo' unit type for Central Distribution/Operations warehouse
  - Update existing unit type constraint
  
  ### 2. Product Tracking Enhancements
  - Add product source type (cdp_produced, cdo_purchased, direct_purchase)
  - Add flexible batch/expiry tracking flags
  - Add recipe input/output flags
  - Add distribution flags
  
  ### 3. Product Categories
  - Add fields to support the three operational domains
  
  ## New Fields on Products
  - source_type: where product comes from (CDP, CDO, or Direct)
  - requires_expiry: whether product needs expiry date tracking
  - requires_packaging: whether product needs individual packaging
  - is_recipe_input: can be used as ingredient in recipes
  - is_recipe_output: is produced from recipes
  - is_distributable: can be distributed to other units
  - tracking_level: 'full' (batch+expiry) or 'simple' (quantity only)
*/

-- =====================================================
-- 1. UPDATE UNIT TYPES TO INCLUDE CDO
-- =====================================================

-- Drop the old constraint
DO $$
BEGIN
  -- Drop existing constraint if it exists
  ALTER TABLE units DROP CONSTRAINT IF EXISTS units_type_check;
  
  -- Add new constraint with CDO
  ALTER TABLE units ADD CONSTRAINT units_type_check 
    CHECK (type IN ('cdp', 'cdo', 'restaurant', 'events'));
END $$;

-- =====================================================
-- 2. ADD ENHANCED PRODUCT TRACKING FIELDS
-- =====================================================

DO $$
BEGIN
  -- Add source_type field
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'source_type'
  ) THEN
    ALTER TABLE products ADD COLUMN source_type text 
      CHECK (source_type IN ('cdp_produced', 'cdo_purchased', 'direct_purchase', 'ingredient'));
  END IF;

  -- Add requires_expiry (separate from requires_batch)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'requires_expiry'
  ) THEN
    ALTER TABLE products ADD COLUMN requires_expiry boolean DEFAULT true;
  END IF;

  -- Add requires_packaging (whether needs individual QR packaging)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'requires_packaging'
  ) THEN
    ALTER TABLE products ADD COLUMN requires_packaging boolean DEFAULT false;
  END IF;

  -- Add is_recipe_input (can be used as ingredient)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'is_recipe_input'
  ) THEN
    ALTER TABLE products ADD COLUMN is_recipe_input boolean DEFAULT false;
  END IF;

  -- Add is_recipe_output (produced from recipes)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'is_recipe_output'
  ) THEN
    ALTER TABLE products ADD COLUMN is_recipe_output boolean DEFAULT false;
  END IF;

  -- Add is_distributable (can be sent to other units)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'is_distributable'
  ) THEN
    ALTER TABLE products ADD COLUMN is_distributable boolean DEFAULT true;
  END IF;

  -- Add tracking_level for simplified stock tracking
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'tracking_level'
  ) THEN
    ALTER TABLE products ADD COLUMN tracking_level text DEFAULT 'full'
      CHECK (tracking_level IN ('full', 'simple'));
  END IF;
END $$;

-- =====================================================
-- 3. UPDATE EXISTING PRODUCTS BASED ON CURRENT FLAGS
-- =====================================================

-- Set source_type based on existing product_type and produced_in_cdp flags
UPDATE products 
SET source_type = CASE 
  WHEN product_type = 'cdp_produced' OR produced_in_cdp = true THEN 'cdp_produced'
  WHEN product_type = 'purchased' THEN 'cdo_purchased'
  ELSE 'cdo_purchased'
END
WHERE source_type IS NULL;

-- Set requires_packaging based on product_type
UPDATE products
SET requires_packaging = CASE
  WHEN product_type = 'cdp_produced' OR produced_in_cdp = true THEN true
  ELSE false
END
WHERE requires_packaging = false;

-- Set is_recipe_output for CDP produced products
UPDATE products
SET is_recipe_output = true
WHERE product_type = 'cdp_produced' OR produced_in_cdp = true;

-- Set tracking_level based on product characteristics
UPDATE products
SET tracking_level = CASE
  WHEN requires_batch = false AND requires_expiry = false THEN 'simple'
  ELSE 'full'
END;

-- =====================================================
-- 4. CREATE RECIPES/BOM TABLES
-- =====================================================

-- Recipes table (Bill of Materials)
CREATE TABLE IF NOT EXISTS recipes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  output_product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  output_quantity decimal(10,3) NOT NULL DEFAULT 1,
  output_unit text NOT NULL,
  unit_id uuid REFERENCES units(id),
  active boolean DEFAULT true,
  instructions text,
  preparation_time_minutes integer,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

-- Recipe ingredients (inputs)
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  input_product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity decimal(10,3) NOT NULL,
  unit text NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;

-- Production logs (actual production with stock consumption)
CREATE TABLE IF NOT EXISTS production_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id uuid REFERENCES recipes(id),
  batch_id uuid REFERENCES production_batches(id) ON DELETE CASCADE,
  produced_quantity decimal(10,3) NOT NULL,
  produced_unit text NOT NULL,
  produced_by uuid REFERENCES profiles(id),
  location_id uuid REFERENCES units(id),
  production_date timestamptz DEFAULT now(),
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE production_logs ENABLE ROW LEVEL SECURITY;

-- Production ingredient consumption (actual stock used)
CREATE TABLE IF NOT EXISTS production_ingredient_consumption (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  production_log_id uuid NOT NULL REFERENCES production_logs(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  quantity_used decimal(10,3) NOT NULL,
  unit text NOT NULL,
  packaged_unit_id uuid REFERENCES packaged_units(id),
  batch_code text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE production_ingredient_consumption ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 5. CREATE STOCK COUNT MODULE TABLES
-- =====================================================

-- Stock count sessions
CREATE TABLE IF NOT EXISTS stock_counts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  count_number text UNIQUE NOT NULL,
  unit_id uuid NOT NULL REFERENCES units(id),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'completed', 'reviewed', 'cancelled')),
  count_type text NOT NULL DEFAULT 'full'
    CHECK (count_type IN ('full', 'partial', 'cycle')),
  scheduled_date date,
  started_at timestamptz,
  completed_at timestamptz,
  reviewed_at timestamptz,
  created_by uuid REFERENCES profiles(id),
  counted_by uuid REFERENCES profiles(id),
  reviewed_by uuid REFERENCES profiles(id),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE stock_counts ENABLE ROW LEVEL SECURITY;

-- Stock count lines (products to count)
CREATE TABLE IF NOT EXISTS stock_count_lines (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  stock_count_id uuid NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  system_quantity decimal(10,3) DEFAULT 0,
  counted_quantity decimal(10,3),
  variance decimal(10,3),
  variance_percentage decimal(5,2),
  unit text NOT NULL,
  notes text,
  counted_at timestamptz,
  counted_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE stock_count_lines ENABLE ROW LEVEL SECURITY;

-- Stock count adjustments (approved corrections)
CREATE TABLE IF NOT EXISTS stock_count_adjustments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  stock_count_line_id uuid NOT NULL REFERENCES stock_count_lines(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  unit_id uuid NOT NULL REFERENCES units(id),
  adjustment_quantity decimal(10,3) NOT NULL,
  unit text NOT NULL,
  reason text NOT NULL,
  approved_by uuid REFERENCES profiles(id),
  approved_at timestamptz DEFAULT now(),
  applied_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stock_count_adjustments ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 6. CREATE INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_products_source_type ON products(source_type);
CREATE INDEX IF NOT EXISTS idx_products_tracking_level ON products(tracking_level);
CREATE INDEX IF NOT EXISTS idx_products_is_recipe_input ON products(is_recipe_input) WHERE is_recipe_input = true;
CREATE INDEX IF NOT EXISTS idx_products_is_recipe_output ON products(is_recipe_output) WHERE is_recipe_output = true;

CREATE INDEX IF NOT EXISTS idx_recipes_output_product ON recipes(output_product_id);
CREATE INDEX IF NOT EXISTS idx_recipes_unit ON recipes(unit_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_product ON recipe_ingredients(input_product_id);

CREATE INDEX IF NOT EXISTS idx_production_logs_recipe ON production_logs(recipe_id);
CREATE INDEX IF NOT EXISTS idx_production_logs_batch ON production_logs(batch_id);
CREATE INDEX IF NOT EXISTS idx_production_logs_location ON production_logs(location_id);
CREATE INDEX IF NOT EXISTS idx_production_ingredient_consumption_log ON production_ingredient_consumption(production_log_id);

CREATE INDEX IF NOT EXISTS idx_stock_counts_unit ON stock_counts(unit_id);
CREATE INDEX IF NOT EXISTS idx_stock_counts_status ON stock_counts(status);
CREATE INDEX IF NOT EXISTS idx_stock_count_lines_count ON stock_count_lines(stock_count_id);
CREATE INDEX IF NOT EXISTS idx_stock_count_lines_product ON stock_count_lines(product_id);

-- =====================================================
-- 7. CREATE RLS POLICIES FOR NEW TABLES
-- =====================================================

-- Recipes policies
DROP POLICY IF EXISTS "Users can view recipes in their unit" ON recipes;
CREATE POLICY "Users can view recipes in their unit"
  ON recipes FOR SELECT
  TO authenticated
  USING (
    unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin')
  );

DROP POLICY IF EXISTS "CDP managers can manage recipes" ON recipes;
CREATE POLICY "CDP managers can manage recipes"
  ON recipes FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Chefe'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Chefe'))
  );

-- Recipe ingredients policies
DROP POLICY IF EXISTS "Users can view recipe ingredients" ON recipe_ingredients;
CREATE POLICY "Users can view recipe ingredients"
  ON recipe_ingredients FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "CDP managers can manage recipe ingredients" ON recipe_ingredients;
CREATE POLICY "CDP managers can manage recipe ingredients"
  ON recipe_ingredients FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Chefe'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Chefe'))
  );

-- Production logs policies
DROP POLICY IF EXISTS "Users can view production logs in their unit" ON production_logs;
CREATE POLICY "Users can view production logs in their unit"
  ON production_logs FOR SELECT
  TO authenticated
  USING (
    location_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin')
  );

DROP POLICY IF EXISTS "Production staff can create production logs" ON production_logs;
CREATE POLICY "Production staff can create production logs"
  ON production_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Chefe', 'Staff'))
  );

-- Production ingredient consumption policies
DROP POLICY IF EXISTS "Users can view ingredient consumption" ON production_ingredient_consumption;
CREATE POLICY "Users can view ingredient consumption"
  ON production_ingredient_consumption FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Production staff can record consumption" ON production_ingredient_consumption;
CREATE POLICY "Production staff can record consumption"
  ON production_ingredient_consumption FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Chefe', 'Staff'))
  );

-- Stock counts policies
DROP POLICY IF EXISTS "Users can view stock counts in their unit" ON stock_counts;
CREATE POLICY "Users can view stock counts in their unit"
  ON stock_counts FOR SELECT
  TO authenticated
  USING (
    unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin')
  );

DROP POLICY IF EXISTS "Managers can manage stock counts" ON stock_counts;
CREATE POLICY "Managers can manage stock counts"
  ON stock_counts FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Chefe'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Chefe'))
  );

-- Stock count lines policies
DROP POLICY IF EXISTS "Users can view stock count lines" ON stock_count_lines;
CREATE POLICY "Users can view stock count lines"
  ON stock_count_lines FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM stock_counts sc
      WHERE sc.id = stock_count_lines.stock_count_id
        AND (sc.unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
             OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin'))
    )
  );

DROP POLICY IF EXISTS "Staff can update stock count lines" ON stock_count_lines;
CREATE POLICY "Staff can update stock count lines"
  ON stock_count_lines FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Chefe', 'Staff'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Chefe', 'Staff'))
  );

-- Stock count adjustments policies
DROP POLICY IF EXISTS "Managers can view adjustments" ON stock_count_adjustments;
CREATE POLICY "Managers can view adjustments"
  ON stock_count_adjustments FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Chefe'))
  );

DROP POLICY IF EXISTS "Managers can create adjustments" ON stock_count_adjustments;
CREATE POLICY "Managers can create adjustments"
  ON stock_count_adjustments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Chefe'))
  );

-- =====================================================
-- 8. CREATE HELPER FUNCTIONS
-- =====================================================

-- Function to auto-generate stock count number
CREATE OR REPLACE FUNCTION generate_stock_count_number()
RETURNS text AS $$
DECLARE
  next_num integer;
  count_date text;
BEGIN
  count_date := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(count_number FROM 'SC-\d{8}-(\d{4})') AS integer)), 0) + 1
  INTO next_num
  FROM stock_counts
  WHERE count_number LIKE 'SC-' || count_date || '-%';
  
  RETURN 'SC-' || count_date || '-' || LPAD(next_num::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Function to calculate variance on stock count lines
CREATE OR REPLACE FUNCTION calculate_stock_count_variance()
RETURNS trigger AS $$
BEGIN
  IF NEW.counted_quantity IS NOT NULL AND NEW.system_quantity IS NOT NULL THEN
    NEW.variance := NEW.counted_quantity - NEW.system_quantity;
    
    IF NEW.system_quantity != 0 THEN
      NEW.variance_percentage := (NEW.variance / NEW.system_quantity) * 100;
    ELSE
      NEW.variance_percentage := NULL;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calculate_variance_trigger ON stock_count_lines;
CREATE TRIGGER calculate_variance_trigger
  BEFORE INSERT OR UPDATE ON stock_count_lines
  FOR EACH ROW
  EXECUTE FUNCTION calculate_stock_count_variance();

-- Function to update production batch with recipe info
CREATE OR REPLACE FUNCTION link_production_log_to_batch()
RETURNS trigger AS $$
BEGIN
  -- Update the production batch with the production log info
  UPDATE production_batches
  SET total_produced_quantity = NEW.produced_quantity,
      updated_at = now()
  WHERE id = NEW.batch_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS link_production_log_trigger ON production_logs;
CREATE TRIGGER link_production_log_trigger
  AFTER INSERT ON production_logs
  FOR EACH ROW
  WHEN (NEW.batch_id IS NOT NULL)
  EXECUTE FUNCTION link_production_log_to_batch();

-- =====================================================
-- 9. GRANT PERMISSIONS
-- =====================================================

GRANT SELECT ON recipes TO authenticated;
GRANT SELECT ON recipe_ingredients TO authenticated;
GRANT SELECT ON production_logs TO authenticated;
GRANT SELECT ON production_ingredient_consumption TO authenticated;
GRANT SELECT ON stock_counts TO authenticated;
GRANT SELECT ON stock_count_lines TO authenticated;
GRANT SELECT ON stock_count_adjustments TO authenticated;

GRANT ALL ON recipes TO service_role;
GRANT ALL ON recipe_ingredients TO service_role;
GRANT ALL ON production_logs TO service_role;
GRANT ALL ON production_ingredient_consumption TO service_role;
GRANT ALL ON stock_counts TO service_role;
GRANT ALL ON stock_count_lines TO service_role;
GRANT ALL ON stock_count_adjustments TO service_role;