/*
  # Create Granular Permissions System

  1. New Tables
    - `system_modules` - System modules (Produtos, Stock, Fornecedores, etc.)
    - `module_actions` - Available actions (view, create, update, delete)
    - `user_module_permissions` - User-specific permissions per module

  2. Changes
    - Admin can configure granular permissions for each user
    - Each module has specific actions (view, create, update, delete)
    - Users inherit base role permissions but can be customized
    - System validates permissions before showing UI and processing actions

  3. Security
    - Enable RLS on all new tables
    - Only Admin can manage permissions
    - Users can view their own permissions
    - Functions to check user permissions efficiently
*/

-- =====================================================
-- SYSTEM MODULES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS system_modules (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  icon text,
  route text,
  display_order int DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE system_modules ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- MODULE ACTIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS module_actions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE module_actions ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- USER MODULE PERMISSIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS user_module_permissions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES system_modules(id) ON DELETE CASCADE,
  action_id uuid NOT NULL REFERENCES module_actions(id) ON DELETE CASCADE,
  granted boolean DEFAULT true,
  granted_by uuid REFERENCES profiles(id),
  granted_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, module_id, action_id)
);

ALTER TABLE user_module_permissions ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- INSERT DEFAULT MODULES
-- =====================================================

INSERT INTO system_modules (code, name, description, icon, route, display_order) VALUES
  ('dashboard', 'Dashboard', 'Painel principal', 'LayoutDashboard', '/dashboard', 1),
  ('products', 'Produtos', 'Gestão de produtos', 'Package', '/products', 2),
  ('suppliers', 'Fornecedores', 'Gestão de fornecedores', 'Users', '/suppliers', 3),
  ('purchase_orders', 'Ordens de Compra', 'Criação e gestão de ordens de compra', 'ShoppingCart', '/purchase-orders', 4),
  ('goods_receipts', 'Receção de Mercadorias', 'Receção e validação de mercadorias', 'ClipboardCheck', '/goods-receipts', 5),
  ('stock', 'Stock', 'Gestão de inventário', 'Package', '/stock', 6),
  ('stock_counts', 'Contagem de Stock', 'Inventário físico', 'ClipboardList', '/stock-counts', 7),
  ('packaging', 'Embalamento', 'Processo de embalamento', 'Package', '/packaging', 8),
  ('recipes', 'Receitas', 'Gestão de receitas de produção', 'ChefHat', '/recipes', 9),
  ('production', 'Produção', 'Gestão de produção', 'Factory', '/production', 10),
  ('internal_orders', 'Pedidos Internos', 'Pedidos entre unidades', 'ArrowRightLeft', '/internal-orders', 11),
  ('price_analysis', 'Análise de Preços', 'Histórico e análise de preços', 'TrendingUp', '/price-analysis', 12),
  ('users', 'Utilizadores', 'Gestão de utilizadores e permissões', 'Users', '/users', 13),
  ('import', 'Importação', 'Importação de dados', 'Upload', '/import', 14),
  ('smtp_settings', 'Configurações SMTP', 'Configuração de email', 'Mail', '/smtp-settings', 15)
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- INSERT DEFAULT ACTIONS
-- =====================================================

INSERT INTO module_actions (code, name, description) VALUES
  ('view', 'Visualizar', 'Pode visualizar o módulo e seus dados'),
  ('create', 'Criar', 'Pode criar novos registos'),
  ('update', 'Editar', 'Pode editar registos existentes'),
  ('delete', 'Eliminar', 'Pode eliminar registos'),
  ('export', 'Exportar', 'Pode exportar dados'),
  ('import', 'Importar', 'Pode importar dados')
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- HELPER FUNCTION: Check User Permission
-- =====================================================

CREATE OR REPLACE FUNCTION user_has_module_permission(
  p_user_id uuid,
  p_module_code text,
  p_action_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_is_admin boolean;
  v_has_permission boolean;
BEGIN
  -- Check if user is Admin (Admin has all permissions)
  SELECT role = 'Admin' INTO v_is_admin
  FROM profiles
  WHERE id = p_user_id;
  
  IF v_is_admin THEN
    RETURN true;
  END IF;
  
  -- Check specific user permission
  SELECT EXISTS (
    SELECT 1
    FROM user_module_permissions ump
    JOIN system_modules m ON m.id = ump.module_id
    JOIN module_actions a ON a.id = ump.action_id
    WHERE ump.user_id = p_user_id
      AND m.code = p_module_code
      AND a.code = p_action_code
      AND ump.granted = true
      AND m.active = true
  ) INTO v_has_permission;
  
  RETURN v_has_permission;
END;
$$;

-- =====================================================
-- HELPER FUNCTION: Get User Permissions for Module
-- =====================================================

CREATE OR REPLACE FUNCTION get_user_permissions_for_module(
  p_user_id uuid,
  p_module_code text
)
RETURNS TABLE(action_code text, action_name text, granted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  -- Check if user is Admin
  SELECT role = 'Admin' INTO v_is_admin
  FROM profiles
  WHERE id = p_user_id;
  
  -- If Admin, return all actions as granted
  IF v_is_admin THEN
    RETURN QUERY
    SELECT a.code, a.name, true
    FROM module_actions a
    ORDER BY a.code;
    RETURN;
  END IF;
  
  -- Return user's specific permissions
  RETURN QUERY
  SELECT a.code, a.name, COALESCE(ump.granted, false)
  FROM module_actions a
  LEFT JOIN user_module_permissions ump ON ump.action_id = a.id
    AND ump.user_id = p_user_id
    AND ump.module_id = (SELECT id FROM system_modules WHERE code = p_module_code)
  ORDER BY a.code;
END;
$$;

-- =====================================================
-- HELPER FUNCTION: Get All User Permissions
-- =====================================================

CREATE OR REPLACE FUNCTION get_complete_user_permissions(p_user_id uuid)
RETURNS TABLE(
  module_code text,
  module_name text,
  action_code text,
  action_name text,
  granted boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  -- Check if user is Admin
  SELECT role = 'Admin' INTO v_is_admin
  FROM profiles
  WHERE id = p_user_id;
  
  -- If Admin, return all permissions for all modules as granted
  IF v_is_admin THEN
    RETURN QUERY
    SELECT m.code, m.name, a.code, a.name, true
    FROM system_modules m
    CROSS JOIN module_actions a
    WHERE m.active = true
    ORDER BY m.display_order, a.code;
    RETURN;
  END IF;
  
  -- Return user's specific permissions
  RETURN QUERY
  SELECT 
    m.code,
    m.name,
    a.code,
    a.name,
    COALESCE(ump.granted, false)
  FROM system_modules m
  CROSS JOIN module_actions a
  LEFT JOIN user_module_permissions ump ON ump.module_id = m.id 
    AND ump.action_id = a.id 
    AND ump.user_id = p_user_id
  WHERE m.active = true
  ORDER BY m.display_order, a.code;
END;
$$;

-- =====================================================
-- RLS POLICIES - SYSTEM MODULES
-- =====================================================

CREATE POLICY "Everyone can view active modules"
  ON system_modules FOR SELECT
  TO authenticated
  USING (active = true);

CREATE POLICY "Only Admin can manage modules"
  ON system_modules FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin')
  );

-- =====================================================
-- RLS POLICIES - MODULE ACTIONS
-- =====================================================

CREATE POLICY "Everyone can view actions"
  ON module_actions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only Admin can manage actions"
  ON module_actions FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin')
  );

-- =====================================================
-- RLS POLICIES - USER MODULE PERMISSIONS
-- =====================================================

CREATE POLICY "Users can view own permissions"
  ON user_module_permissions FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin')
  );

CREATE POLICY "Only Admin can grant permissions"
  ON user_module_permissions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin')
  );

CREATE POLICY "Only Admin can update permissions"
  ON user_module_permissions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin')
  );

CREATE POLICY "Only Admin can revoke permissions"
  ON user_module_permissions FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin')
  );

-- =====================================================
-- CREATE INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_user_module_permissions_user ON user_module_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_module_permissions_module ON user_module_permissions(module_id);
CREATE INDEX IF NOT EXISTS idx_user_module_permissions_action ON user_module_permissions(action_id);
CREATE INDEX IF NOT EXISTS idx_user_module_permissions_lookup ON user_module_permissions(user_id, module_id, action_id);
CREATE INDEX IF NOT EXISTS idx_system_modules_code ON system_modules(code);
CREATE INDEX IF NOT EXISTS idx_system_modules_active ON system_modules(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_module_actions_code ON module_actions(code);

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

GRANT SELECT ON system_modules TO authenticated;
GRANT SELECT ON module_actions TO authenticated;
GRANT SELECT ON user_module_permissions TO authenticated;
GRANT ALL ON system_modules TO service_role;
GRANT ALL ON module_actions TO service_role;
GRANT ALL ON user_module_permissions TO service_role;
