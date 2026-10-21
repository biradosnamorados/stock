/*
  # Fix Profiles RLS Infinite Recursion

  1. Changes
    - Update is_admin() function to use correct role value 'Admin'
    - Update current_user_unit_id() function for better performance
    - Remove duplicate/conflicting RLS policies causing recursion
    - Keep only one set of consistent policies
    
  2. Security
    - Maintains proper access control
    - Eliminates infinite recursion in policy checks
    - Uses direct auth.uid() checks instead of nested subqueries
*/

-- Drop the conflicting policy that causes recursion
DROP POLICY IF EXISTS "Admins can manage all users" ON profiles;

-- Update is_admin function to use correct role
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE id = auth.uid() 
      AND role = 'Admin'
      AND active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Update current_user_unit_id for better performance
CREATE OR REPLACE FUNCTION current_user_unit_id()
RETURNS uuid AS $$
DECLARE
  user_unit_id uuid;
BEGIN
  SELECT unit_id INTO user_unit_id
  FROM public.profiles 
  WHERE id = auth.uid();
  
  RETURN user_unit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Verify all policies are clean and non-recursive
-- Keep existing working policies, they use is_admin() function which is now fixed
