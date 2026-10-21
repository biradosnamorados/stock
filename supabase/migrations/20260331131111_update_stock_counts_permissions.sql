/*
  # Update Stock Counts Permissions

  1. Changes
    - Admin can CREATE and DELETE stock counts (full control)
    - Admin can view all stock counts across all units
    - Restaurant staff can only VIEW and UPDATE count lines (insert counted quantities)
    - Restaurant staff cannot create or delete stock counts
    - Restaurant staff can only mark counts as completed

  2. Security
    - Restrictive RLS policies
    - Admin has full control
    - Staff can only input count data and complete counts
    - Staff cannot delete or cancel counts
*/

-- =====================================================
-- DROP EXISTING POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Users can view stock counts in their unit" ON stock_counts;
DROP POLICY IF EXISTS "Managers can manage stock counts" ON stock_counts;
DROP POLICY IF EXISTS "Users can view stock count lines" ON stock_count_lines;
DROP POLICY IF EXISTS "Staff can update stock count lines" ON stock_count_lines;

-- =====================================================
-- STOCK COUNTS POLICIES
-- =====================================================

-- Admin can view all stock counts
CREATE POLICY "Admin can view all stock counts"
  ON stock_counts FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin')
  );

-- Staff can view stock counts in their unit
CREATE POLICY "Staff can view own unit stock counts"
  ON stock_counts FOR SELECT
  TO authenticated
  USING (
    unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Chefe', 'Staff'))
  );

-- Only Admin can create stock counts
CREATE POLICY "Only Admin can create stock counts"
  ON stock_counts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin')
  );

-- Admin can update all stock counts
-- Staff can only update status to 'completed' on counts in their unit
CREATE POLICY "Admin can update all stock counts"
  ON stock_counts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin')
  );

CREATE POLICY "Staff can complete stock counts in their unit"
  ON stock_counts FOR UPDATE
  TO authenticated
  USING (
    unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Chefe', 'Staff'))
  )
  WITH CHECK (
    unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Chefe', 'Staff'))
    AND status IN ('active', 'completed')
  );

-- Only Admin can delete stock counts
CREATE POLICY "Only Admin can delete stock counts"
  ON stock_counts FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin')
  );

-- =====================================================
-- STOCK COUNT LINES POLICIES
-- =====================================================

-- Admin can view all stock count lines
CREATE POLICY "Admin can view all stock count lines"
  ON stock_count_lines FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin')
  );

-- Staff can view stock count lines in their unit
CREATE POLICY "Staff can view own unit stock count lines"
  ON stock_count_lines FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM stock_counts sc
      WHERE sc.id = stock_count_lines.stock_count_id
        AND sc.unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
        AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Chefe', 'Staff'))
    )
  );

-- Admin can insert stock count lines
CREATE POLICY "Admin can insert stock count lines"
  ON stock_count_lines FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin')
  );

-- Admin can update all stock count lines
CREATE POLICY "Admin can update all stock count lines"
  ON stock_count_lines FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin')
  );

-- Staff can update counted_quantity on stock count lines in their unit
CREATE POLICY "Staff can update counted quantities"
  ON stock_count_lines FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM stock_counts sc
      WHERE sc.id = stock_count_lines.stock_count_id
        AND sc.unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
        AND sc.status = 'active'
        AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Chefe', 'Staff'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM stock_counts sc
      WHERE sc.id = stock_count_lines.stock_count_id
        AND sc.unit_id IN (SELECT unit_id FROM profiles WHERE id = auth.uid())
        AND sc.status = 'active'
        AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Chefe', 'Staff'))
    )
  );

-- Admin can delete stock count lines
CREATE POLICY "Admin can delete stock count lines"
  ON stock_count_lines FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin')
  );
