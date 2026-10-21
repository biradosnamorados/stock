/*
  # HACCP Field-Level Sessions & Partial Completion

  ## Overview
  Complete overhaul of the HACCP execution model to support:
  - Field-level states: compliant, non_compliant, not_used
  - Partial completion by multiple users (one session per task per day/shift period)
  - Global task status tracking: pending, in_progress, completed, incomplete, non_compliant
  - Per-field audit trail: who filled it, when, and what value

  ## New Tables

  ### `haccp_task_sessions`
  One session per task per calendar day (or per shift for per_shift frequency).
  Tracks the aggregate state of the task for that period.
  - `session_date`: the date this session belongs to
  - `shift_period`: for per_shift tasks (morning/afternoon/night), null for daily
  - `status`: pending | in_progress | completed | incomplete | non_compliant
  - `completed_at`: when the last required field was filled
  - `reopened_by`: manager/admin who reopened a closed session
  - `reopened_at`: when it was reopened

  ### `haccp_field_entries`
  One row per field per session. Records who filled it and the field-level state.
  - `field_status`: compliant | non_compliant | not_used
  - `performed_by`: the user who filled this field
  - `observation`: optional free-text comment
  - All value columns from the old model (numeric, text, boolean, photo, datetime)

  ## Security
  - RLS enabled on both tables
  - Staff: insert/update their own entries; read all within their unit
  - Managers/Admin: full access including reopening sessions
*/

-- ── haccp_task_sessions ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS haccp_task_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         uuid NOT NULL REFERENCES haccp_tasks(id) ON DELETE CASCADE,
  unit_id         uuid REFERENCES units(id),
  department_id   uuid REFERENCES departments(id),
  session_date    date NOT NULL DEFAULT CURRENT_DATE,
  shift_period    text,                            -- 'morning' | 'afternoon' | 'night' | null
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','in_progress','completed','incomplete','non_compliant')),
  total_fields    integer NOT NULL DEFAULT 0,
  filled_fields   integer NOT NULL DEFAULT 0,
  completed_at    timestamptz,
  reopened_by     uuid REFERENCES auth.users(id),
  reopened_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, session_date, shift_period)
);

ALTER TABLE haccp_task_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read sessions of their unit"
  ON haccp_task_sessions FOR SELECT
  TO authenticated
  USING (
    unit_id IS NULL OR
    unit_id = (SELECT unit_id FROM profiles WHERE id = auth.uid() LIMIT 1) OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin','Manager','CDP_Manager'))
  );

CREATE POLICY "Authenticated users can insert sessions"
  ON haccp_task_sessions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update sessions"
  ON haccp_task_sessions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── haccp_field_entries ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS haccp_field_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES haccp_task_sessions(id) ON DELETE CASCADE,
  task_id         uuid NOT NULL REFERENCES haccp_tasks(id) ON DELETE CASCADE,
  input_id        uuid REFERENCES haccp_task_inputs(id) ON DELETE SET NULL,
  input_label     text NOT NULL,
  input_type      text NOT NULL,
  field_status    text NOT NULL DEFAULT 'compliant'
                    CHECK (field_status IN ('compliant','non_compliant','not_used')),
  value_boolean   boolean,
  value_numeric   numeric,
  value_text      text,
  value_photo_url text,
  value_datetime  timestamptz,
  observation     text,
  performed_by    uuid NOT NULL REFERENCES auth.users(id),
  performed_at    timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE haccp_field_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read field entries of their unit sessions"
  ON haccp_field_entries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM haccp_task_sessions s
      WHERE s.id = haccp_field_entries.session_id
      AND (
        s.unit_id IS NULL OR
        s.unit_id = (SELECT unit_id FROM profiles WHERE id = auth.uid() LIMIT 1) OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin','Manager','CDP_Manager'))
      )
    )
  );

CREATE POLICY "Authenticated users can insert field entries"
  ON haccp_field_entries FOR INSERT
  TO authenticated
  WITH CHECK (performed_by = auth.uid());

CREATE POLICY "Users can update their own field entries"
  ON haccp_field_entries FOR UPDATE
  TO authenticated
  USING (performed_by = auth.uid())
  WITH CHECK (performed_by = auth.uid());

CREATE POLICY "Managers can update any field entry"
  ON haccp_field_entries FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin','Manager','CDP_Manager'))
  )
  WITH CHECK (true);

-- ── Indexes ────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_haccp_sessions_task_date ON haccp_task_sessions(task_id, session_date);
CREATE INDEX IF NOT EXISTS idx_haccp_sessions_unit_date ON haccp_task_sessions(unit_id, session_date);
CREATE INDEX IF NOT EXISTS idx_haccp_field_entries_session ON haccp_field_entries(session_id);
CREATE INDEX IF NOT EXISTS idx_haccp_field_entries_task ON haccp_field_entries(task_id);
CREATE INDEX IF NOT EXISTS idx_haccp_field_entries_user ON haccp_field_entries(performed_by);
