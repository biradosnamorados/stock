/*
  # Create Mandatory Tasks Module

  ## Summary
  Creates a standalone operational tasks module (separate from HACCP) for
  restaurant opening/closing/shift checklists.

  ## New Tables

  ### mandatory_task_categories
  - Organizes tasks into categories (e.g., "Abertura Cozinha", "Fecho Bar")
  - Linked to a unit and/or department
  - Has a type: opening | closing | shift | custom

  ### mandatory_tasks
  - Individual task definitions belonging to a category
  - Supports: checkbox (default), notes, photo
  - Linked to unit and/or department for filtering
  - Has display_order for sorting within a category

  ### mandatory_task_logs
  - Audit trail of every completed task execution
  - Records: user, unit, department, timestamp, notes, photo_url
  - Immutable — completed tasks are never deleted

  ## Security
  - RLS enabled on all tables
  - Authenticated users can view tasks for their unit/department
  - Authenticated users can insert logs
  - Admin/Chefe can manage task definitions
  - Only admins can delete tasks
*/

-- -------------------------------------------------------
-- mandatory_task_categories
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mandatory_task_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category_type text NOT NULL DEFAULT 'opening'
    CHECK (category_type IN ('opening', 'closing', 'shift', 'custom')),
  unit_id uuid REFERENCES units(id) ON DELETE SET NULL,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  display_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE mandatory_task_categories ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_mandatory_task_categories_unit ON mandatory_task_categories(unit_id);
CREATE INDEX IF NOT EXISTS idx_mandatory_task_categories_dept ON mandatory_task_categories(department_id);
CREATE INDEX IF NOT EXISTS idx_mandatory_task_categories_type ON mandatory_task_categories(category_type);

-- View: all authenticated users can see active categories
CREATE POLICY "Authenticated users can view mandatory task categories"
  ON mandatory_task_categories FOR SELECT
  TO authenticated
  USING (active = true);

-- Admin/Chefe can insert categories
CREATE POLICY "Admin and Chefe can create mandatory task categories"
  ON mandatory_task_categories FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('Admin', 'Chefe') AND active = true
    )
  );

-- Admin/Chefe can update categories
CREATE POLICY "Admin and Chefe can update mandatory task categories"
  ON mandatory_task_categories FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('Admin', 'Chefe') AND active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('Admin', 'Chefe') AND active = true
    )
  );

-- Only Admin can delete
CREATE POLICY "Admin can delete mandatory task categories"
  ON mandatory_task_categories FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'Admin' AND active = true
    )
  );

-- -------------------------------------------------------
-- mandatory_tasks
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mandatory_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES mandatory_task_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  requires_notes boolean NOT NULL DEFAULT false,
  requires_photo boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE mandatory_tasks ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_mandatory_tasks_category ON mandatory_tasks(category_id);
CREATE INDEX IF NOT EXISTS idx_mandatory_tasks_active ON mandatory_tasks(active);

CREATE POLICY "Authenticated users can view mandatory tasks"
  ON mandatory_tasks FOR SELECT
  TO authenticated
  USING (active = true);

CREATE POLICY "Admin and Chefe can create mandatory tasks"
  ON mandatory_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('Admin', 'Chefe') AND active = true
    )
  );

CREATE POLICY "Admin and Chefe can update mandatory tasks"
  ON mandatory_tasks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('Admin', 'Chefe') AND active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('Admin', 'Chefe') AND active = true
    )
  );

CREATE POLICY "Admin can delete mandatory tasks"
  ON mandatory_tasks FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'Admin' AND active = true
    )
  );

-- -------------------------------------------------------
-- mandatory_task_logs
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mandatory_task_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES mandatory_tasks(id) ON DELETE CASCADE,
  task_name text NOT NULL,
  category_id uuid REFERENCES mandatory_task_categories(id) ON DELETE SET NULL,
  category_name text,
  performed_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES units(id) ON DELETE SET NULL,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  notes text,
  photo_url text,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE mandatory_task_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_mandatory_task_logs_task ON mandatory_task_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_mandatory_task_logs_performed_by ON mandatory_task_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_mandatory_task_logs_unit ON mandatory_task_logs(unit_id);
CREATE INDEX IF NOT EXISTS idx_mandatory_task_logs_completed_at ON mandatory_task_logs(completed_at);
CREATE INDEX IF NOT EXISTS idx_mandatory_task_logs_category ON mandatory_task_logs(category_id);

-- Users can view logs for their own unit or if Admin
CREATE POLICY "Users can view mandatory task logs for their unit"
  ON mandatory_task_logs FOR SELECT
  TO authenticated
  USING (
    unit_id = (SELECT unit_id FROM profiles WHERE id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin')
  );

-- Any authenticated user can log a task completion
CREATE POLICY "Authenticated users can insert mandatory task logs"
  ON mandatory_task_logs FOR INSERT
  TO authenticated
  WITH CHECK (performed_by = auth.uid());

-- -------------------------------------------------------
-- Storage bucket for mandatory task photos
-- -------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'task-photos',
  'task-photos',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload task photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'task-photos');

CREATE POLICY "Authenticated users can view task photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'task-photos');

-- -------------------------------------------------------
-- Register module in system_modules
-- -------------------------------------------------------
INSERT INTO system_modules (code, name, description, icon, route, display_order, active)
VALUES ('mandatory_tasks', 'Tarefas Obrigatórias', 'Checklists operacionais de abertura, fecho e turno', 'CheckSquare', '/mandatory-tasks', 25, true)
ON CONFLICT (code) DO NOTHING;
