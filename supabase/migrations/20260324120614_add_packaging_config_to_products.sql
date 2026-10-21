/*
  # Add Packaging Configuration to Products

  1. Changes
    - Add `packaging_unit_type` column (kg, L, units)
    - Add `standard_package_quantity` column (numeric)
    - Add `allow_remainder_package` column (boolean)
    - Add `total_produced_quantity` column to production_batches

  2. Notes
    - These fields enable automatic packaging calculation
    - Standard package quantity defines the default package size
    - Allow remainder package determines if divergent packages are permitted
    - Total produced quantity enables automatic package count suggestions
*/

-- Add packaging configuration to products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'packaging_unit_type'
  ) THEN
    ALTER TABLE products ADD COLUMN packaging_unit_type text DEFAULT 'kg';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'standard_package_quantity'
  ) THEN
    ALTER TABLE products ADD COLUMN standard_package_quantity numeric DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'allow_remainder_package'
  ) THEN
    ALTER TABLE products ADD COLUMN allow_remainder_package boolean DEFAULT true;
  END IF;
END $$;

-- Add total produced quantity to production batches
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'production_batches' AND column_name = 'total_produced_quantity'
  ) THEN
    ALTER TABLE production_batches ADD COLUMN total_produced_quantity numeric;
  END IF;
END $$;

-- Add check constraint for packaging unit type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'products_packaging_unit_type_check'
  ) THEN
    ALTER TABLE products ADD CONSTRAINT products_packaging_unit_type_check 
      CHECK (packaging_unit_type IN ('kg', 'L', 'units'));
  END IF;
END $$;