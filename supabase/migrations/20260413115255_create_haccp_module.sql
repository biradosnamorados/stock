/*
  # Create HACCP Module

  ## Overview
  A flexible, mobile-first HACCP task management system with full audit traceability.

  ## New Tables

  ### haccp_tasks (task templates/definitions)
  - id, name, description
  - department_id, unit_id (which department and unit this task belongs to)
  - frequency: daily, per_shift, weekly, monthly, manual
  - active: boolean
  - display_order: for ordering on mobile

  ### haccp_task_inputs (input fields per task)
  - id, task_id
  - label: display label for the input
  - input_type: checkbox, numeric, text, photo, datetime
  - required: boolean
  - numeric_min, numeric_max: optional range validation
  - display_order: ordering of inputs within a task
  - placeholder: hint text

  ### haccp_task_logs (completed task records - full audit)
  - id, task_id
  - performed_by: user who completed it
  - unit_id, department_id: snapshot of location at time of completion
  - completed_at: timestamp
  - notes: optional overall notes

  ### haccp_task_log_values (individual input values per log)
  - id, log_id, input_id
  - value_text, value_numeric, value_boolean, value_photo_url, value_datetime
  - input_label (snapshot for audit)

  ## Security
  - RLS enabled on all tables
  - Staff can view/execute tasks for their unit+department
  - Admin/Chefe can manage task definitions
*/

-- HACCP Tasks (definitions/templates)
CREATE TABLE IF NOT EXISTS haccp_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  department_id uuid REFERENCES departments(id),
  unit_id uuid REFERENCES units(id),
  frequency text NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'per_shift', 'weekly', 'monthly', 'manual')),
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE haccp_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active haccp tasks"
  ON haccp_tasks FOR SELECT
  TO authenticated
  USING (active = true);

CREATE POLICY "Admin and Chefe can insert haccp tasks"
  ON haccp_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe'))
  );

CREATE POLICY "Admin and Chefe can update haccp tasks"
  ON haccp_tasks FOR UPDATE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')));

CREATE POLICY "Admin can delete haccp tasks"
  ON haccp_tasks FOR DELETE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

-- HACCP Task Inputs (field definitions per task)
CREATE TABLE IF NOT EXISTS haccp_task_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES haccp_tasks(id) ON DELETE CASCADE,
  label text NOT NULL,
  input_type text NOT NULL CHECK (input_type IN ('checkbox', 'numeric', 'text', 'photo', 'datetime')),
  required boolean NOT NULL DEFAULT true,
  numeric_min numeric,
  numeric_max numeric,
  placeholder text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE haccp_task_inputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view haccp task inputs"
  ON haccp_task_inputs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin and Chefe can insert haccp task inputs"
  ON haccp_task_inputs FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe'))
  );

CREATE POLICY "Admin and Chefe can update haccp task inputs"
  ON haccp_task_inputs FOR UPDATE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')));

CREATE POLICY "Admin and Chefe can delete haccp task inputs"
  ON haccp_task_inputs FOR DELETE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role IN ('Admin', 'Chefe')));

-- HACCP Task Logs (completed task records)
CREATE TABLE IF NOT EXISTS haccp_task_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES haccp_tasks(id),
  task_name text NOT NULL,
  performed_by uuid NOT NULL REFERENCES profiles(id),
  unit_id uuid REFERENCES units(id),
  department_id uuid REFERENCES departments(id),
  completed_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE haccp_task_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view haccp logs for their unit"
  ON haccp_task_logs FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
    OR unit_id = (SELECT unit_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Authenticated users can insert haccp logs"
  ON haccp_task_logs FOR INSERT
  TO authenticated
  WITH CHECK (performed_by = auth.uid());

CREATE POLICY "Admin can update haccp logs"
  ON haccp_task_logs FOR UPDATE
  TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin'));

-- HACCP Task Log Values (individual input values per completed log)
CREATE TABLE IF NOT EXISTS haccp_task_log_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id uuid NOT NULL REFERENCES haccp_task_logs(id) ON DELETE CASCADE,
  input_id uuid REFERENCES haccp_task_inputs(id),
  input_label text NOT NULL,
  input_type text NOT NULL,
  value_text text,
  value_numeric numeric,
  value_boolean boolean,
  value_photo_url text,
  value_datetime timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE haccp_task_log_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view haccp log values for their unit"
  ON haccp_task_log_values FOR SELECT
  TO authenticated
  USING (
    log_id IN (
      SELECT id FROM haccp_task_logs
      WHERE auth.uid() IN (SELECT id FROM profiles WHERE role = 'Admin')
        OR unit_id = (SELECT unit_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Authenticated users can insert haccp log values"
  ON haccp_task_log_values FOR INSERT
  TO authenticated
  WITH CHECK (
    log_id IN (
      SELECT id FROM haccp_task_logs WHERE performed_by = auth.uid()
    )
  );

-- Storage bucket for HACCP photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'haccp-photos',
  'haccp-photos',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload haccp photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'haccp-photos');

CREATE POLICY "Anyone can view haccp photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'haccp-photos');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_haccp_tasks_unit_id ON haccp_tasks(unit_id);
CREATE INDEX IF NOT EXISTS idx_haccp_tasks_department_id ON haccp_tasks(department_id);
CREATE INDEX IF NOT EXISTS idx_haccp_task_inputs_task_id ON haccp_task_inputs(task_id);
CREATE INDEX IF NOT EXISTS idx_haccp_task_logs_task_id ON haccp_task_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_haccp_task_logs_performed_by ON haccp_task_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_haccp_task_logs_unit_id ON haccp_task_logs(unit_id);
CREATE INDEX IF NOT EXISTS idx_haccp_task_logs_completed_at ON haccp_task_logs(completed_at);
CREATE INDEX IF NOT EXISTS idx_haccp_task_log_values_log_id ON haccp_task_log_values(log_id);

-- Add haccp module to system_modules
INSERT INTO system_modules (code, name, description, icon, route, display_order, active)
VALUES ('haccp', 'HACCP', 'Gestão de tarefas HACCP', 'ShieldCheck', '/haccp', 5, true)
ON CONFLICT (code) DO NOTHING;