/*
  # Update Roles, Units and Departments

  1. Changes
    - Update roles to: Admin, Staff, Chefe
    - Update units to: Centro de Produção, BN Braga, BN Porto, BN Eventos
    - Update departments to: Sala, Cozinha, Produção, Geral
    
  2. Notes
    - Existing data will be preserved where possible
    - New role mapping: admin -> Admin, staff roles -> Staff, manager roles -> Chefe
*/

-- Remove old constraints
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_check;

-- Update existing roles in profiles
UPDATE profiles SET role = 'Admin' WHERE role = 'admin';
UPDATE profiles SET role = 'Chefe' WHERE role IN ('cdp_manager', 'restaurant_manager');
UPDATE profiles SET role = 'Staff' WHERE role IN ('cdp_staff', 'restaurant_staff', 'events_staff');

-- Delete overlapping permissions before merging
DELETE FROM role_permissions 
WHERE role IN ('restaurant_manager') 
AND permission_id IN (
  SELECT permission_id FROM role_permissions WHERE role = 'cdp_manager'
);

DELETE FROM role_permissions 
WHERE role IN ('restaurant_staff', 'events_staff') 
AND permission_id IN (
  SELECT permission_id FROM role_permissions WHERE role = 'cdp_staff'
);

-- Now update the roles
UPDATE role_permissions SET role = 'Admin' WHERE role = 'admin';
UPDATE role_permissions SET role = 'Chefe' WHERE role IN ('cdp_manager', 'restaurant_manager');
UPDATE role_permissions SET role = 'Staff' WHERE role IN ('cdp_staff', 'restaurant_staff', 'events_staff');

-- Remove any remaining duplicates using CTID
DELETE FROM role_permissions a
WHERE a.ctid NOT IN (
  SELECT MIN(b.ctid)
  FROM role_permissions b
  WHERE b.role = a.role AND b.permission_id = a.permission_id
);

-- Add new constraints
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role = ANY (ARRAY['Admin'::text, 'Staff'::text, 'Chefe'::text]));

ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_role_check 
  CHECK (role = ANY (ARRAY['Admin'::text, 'Staff'::text, 'Chefe'::text]));

-- Update units
UPDATE units SET name = 'Centro de Produção', code = 'CDP' WHERE type = 'cdp';
UPDATE units SET name = 'BN Braga', code = 'BRG' WHERE name IN ('Restaurant Braga', 'BN Braga');
UPDATE units SET name = 'BN Porto', code = 'PRT' WHERE name IN ('Restaurant Porto', 'BN Porto');
UPDATE units SET name = 'BN Eventos', code = 'EVT' WHERE type = 'events';

-- Update Gestão to Geral first
UPDATE departments SET name = 'Geral', description = 'Geral' WHERE name = 'Gestão';

-- Ensure required departments exist
INSERT INTO departments (name, description, active) VALUES
  ('Sala', 'Sala de Atendimento', true),
  ('Cozinha', 'Cozinha', true),
  ('Produção', 'Produção', true)
ON CONFLICT (name) DO UPDATE SET active = true, description = EXCLUDED.description;

-- Mark old departments as inactive
UPDATE departments SET active = false WHERE name IN ('Armazém', 'Bar', 'Compras', 'Events');
