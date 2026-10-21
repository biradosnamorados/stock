/*
  # Fix is_admin() function to match new role naming

  1. Changes
    - Update is_admin() function to check for 'Admin' instead of 'admin'
    - This aligns with the new role naming convention (Admin, Chefe, Staff)
  
  2. Security
    - Maintains SECURITY DEFINER with proper search_path
*/

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role
  FROM profiles
  WHERE id = auth.uid();
  
  RETURN v_role = 'Admin';
END;
$$;