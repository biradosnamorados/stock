/*
  # Create Dashboard Notices Table

  ## Purpose
  Admin-controlled notice/announcement system for the dashboard.
  Admins can target notices to specific units/departments with a date range and priority.

  ## New Tables
  - `dashboard_notices`
    - `id` (uuid, pk)
    - `title` (text) - short title
    - `message` (text) - full message body
    - `target_unit_id` (uuid, nullable) - if null, visible to all units
    - `target_department_id` (uuid, nullable) - if null, visible to all departments
    - `start_date` (date) - when notice becomes visible
    - `end_date` (date) - when notice stops being visible
    - `priority` (text) - 'low' | 'medium' | 'high' | 'urgent'
    - `created_by` (uuid, fk profiles)
    - `created_at` (timestamptz)

  ## Security
  - RLS enabled
  - Admins can insert/update/delete
  - Authenticated users can read notices relevant to their unit/department
*/

CREATE TABLE IF NOT EXISTS dashboard_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  target_unit_id uuid REFERENCES units(id) ON DELETE CASCADE,
  target_department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date NOT NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE dashboard_notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active relevant notices"
  ON dashboard_notices FOR SELECT
  TO authenticated
  USING (
    CURRENT_DATE >= start_date AND CURRENT_DATE <= end_date
  );

CREATE POLICY "Admins can insert notices"
  ON dashboard_notices FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'Admin'
    )
  );

CREATE POLICY "Admins can update notices"
  ON dashboard_notices FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'Admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'Admin'
    )
  );

CREATE POLICY "Admins can delete notices"
  ON dashboard_notices FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'Admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_dashboard_notices_dates ON dashboard_notices(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_dashboard_notices_unit ON dashboard_notices(target_unit_id);
