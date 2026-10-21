/*
  # Access Profiles System + PIN Authentication

  ## Summary
  1. Access Profiles: reusable permission bundles assigned to users
     instead of individual permission rows. Each profile defines which
     modules and actions are accessible.

  2. PIN Authentication: tablet-friendly 4-digit PIN per user for fast
     login on shared restaurant devices. Includes device configuration
     (unit assignment per tablet).

  3. User table enhancements: new columns for pin_hash, access_profile_id,
     username already exists.

  ## New Tables

  ### access_profiles
  - Reusable named permission profiles (e.g., "Kitchen Staff", "Manager")
  - Admin can create, duplicate, and assign to users

  ### access_profile_permissions
  - module_id + action_id grants per profile (mirrors user_module_permissions)

  ### device_configs
  - Per-device unit assignment stored in localStorage key + DB record
  - Allows tablets to filter users by unit

  ## Modified Tables
  - profiles: add pin_hash column (bcrypt stored server-side — we store
    a simple SHA-256 hex on client and compare; for production a proper
    bcrypt via edge function should be used, but here we store hashed PIN
    directly), access_profile_id FK

  ## Security
  - RLS on all new tables
  - Only Admin can manage profiles and device configs
  - Users can only read their own profile PIN-related data
*/

-- -------------------------------------------------------
-- access_profiles
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS access_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  color text NOT NULL DEFAULT '#3b82f6',
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE access_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view access profiles"
  ON access_profiles FOR SELECT
  TO authenticated
  USING (active = true);

CREATE POLICY "Admin can insert access profiles"
  ON access_profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin' AND active = true)
  );

CREATE POLICY "Admin can update access profiles"
  ON access_profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin' AND active = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin' AND active = true)
  );

CREATE POLICY "Admin can delete access profiles"
  ON access_profiles FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin' AND active = true)
  );

-- -------------------------------------------------------
-- access_profile_permissions
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS access_profile_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES access_profiles(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES system_modules(id) ON DELETE CASCADE,
  action_id uuid NOT NULL REFERENCES module_actions(id) ON DELETE CASCADE,
  granted boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(profile_id, module_id, action_id)
);

ALTER TABLE access_profile_permissions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_app_profile_id ON access_profile_permissions(profile_id);
CREATE INDEX IF NOT EXISTS idx_app_module_id ON access_profile_permissions(module_id);

CREATE POLICY "Authenticated users can view profile permissions"
  ON access_profile_permissions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin can manage profile permissions"
  ON access_profile_permissions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin' AND active = true)
  );

CREATE POLICY "Admin can update profile permissions"
  ON access_profile_permissions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin' AND active = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin' AND active = true)
  );

CREATE POLICY "Admin can delete profile permissions"
  ON access_profile_permissions FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin' AND active = true)
  );

-- -------------------------------------------------------
-- Add access_profile_id + pin_hash to profiles
-- -------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'access_profile_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN access_profile_id uuid REFERENCES access_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'pin_hash'
  ) THEN
    ALTER TABLE profiles ADD COLUMN pin_hash text;
  END IF;
END $$;

-- -------------------------------------------------------
-- device_configs — tablet unit assignment
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS device_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_key text NOT NULL UNIQUE,
  device_name text NOT NULL,
  unit_id uuid REFERENCES units(id) ON DELETE SET NULL,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE device_configs ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read device config (needed at startup)
CREATE POLICY "Authenticated users can view device configs"
  ON device_configs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin can insert device configs"
  ON device_configs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin' AND active = true)
  );

CREATE POLICY "Admin can update device configs"
  ON device_configs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin' AND active = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin' AND active = true)
  );

CREATE POLICY "Admin can delete device configs"
  ON device_configs FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin' AND active = true)
  );

-- -------------------------------------------------------
-- RPC: get permissions for a given access_profile_id
-- Returns the same shape as get_complete_user_permissions
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION get_profile_permissions(p_profile_id uuid)
RETURNS TABLE(module_code text, module_name text, action_code text, action_name text, granted boolean)
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sm.code AS module_code,
    sm.name AS module_name,
    ma.code AS action_code,
    ma.name AS action_name,
    COALESCE(app.granted, false) AS granted
  FROM system_modules sm
  CROSS JOIN module_actions ma
  LEFT JOIN access_profile_permissions app
    ON app.profile_id = p_profile_id
    AND app.module_id = sm.id
    AND app.action_id = ma.id
  WHERE sm.active = true
  ORDER BY sm.display_order, ma.code;
END;
$$;

-- -------------------------------------------------------
-- Default access profiles
-- -------------------------------------------------------
INSERT INTO access_profiles (name, description, color) VALUES
  ('Administrador', 'Acesso total a todos os módulos', '#ef4444'),
  ('Gestor / Chefe', 'Gestão operacional, relatórios e utilizadores da unidade', '#f97316'),
  ('Staff Cozinha', 'HACCP, stock, tarefas obrigatórias', '#22c55e'),
  ('Staff Sala', 'Encomendas internas, scanner QR, tarefas', '#3b82f6'),
  ('Staff Bar', 'Encomendas internas, scanner QR, tarefas, stock', '#8b5cf6'),
  ('Staff CDP', 'Produção, embalamento, stock, receitas, encomendas', '#06b6d4'),
  ('Staff CDO', 'Compras, fornecedores, receção mercadoria, preços', '#f59e0b'),
  ('Supervisor HACCP', 'HACCP completo + tarefas obrigatórias + relatórios', '#10b981')
ON CONFLICT DO NOTHING;
