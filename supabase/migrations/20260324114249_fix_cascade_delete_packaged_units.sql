/*
  # Fix Cascade Delete for Packaged Units

  ## Changes
  - Updates the foreign key constraint on `packaged_units.batch_id`
  - Changes from `ON DELETE RESTRICT` to `ON DELETE CASCADE`
  - This ensures that when a production batch is deleted, all associated packaged units are automatically deleted

  ## Security
  - No changes to RLS policies
  - Maintains data integrity through cascading deletes
*/

DO $$
BEGIN
  -- Drop the existing foreign key constraint
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'packaged_units_batch_id_fkey'
    AND table_name = 'packaged_units'
  ) THEN
    ALTER TABLE packaged_units DROP CONSTRAINT packaged_units_batch_id_fkey;
  END IF;

  -- Add the foreign key constraint with CASCADE delete
  ALTER TABLE packaged_units
  ADD CONSTRAINT packaged_units_batch_id_fkey
  FOREIGN KEY (batch_id)
  REFERENCES production_batches(id)
  ON DELETE CASCADE;
END $$;
