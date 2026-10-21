/*
  # Fix Infinite Recursion in Profiles RLS Policies

  ## Problem
  The current RLS policies on the profiles table cause infinite recursion because they query
  the profiles table within the policy conditions themselves.

  ## Solution
  1. Drop existing problematic policies
  2. Create a security definer function that bypasses RLS to check user role
  3. Create new, simpler policies that use the function
  
  ## New Policies
  - Users can always view their own profile
  - Admins can view and manage all profiles (using helper function)
  - Users can view profiles in their same unit (using helper function)
  - Users can update their own profile (non-sensitive fields only)

  ## Security Notes
  - The helper functions are SECURITY DEFINER but safe because they only return simple values
  - Functions are STABLE for better performance (result cached per statement)
*/

-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "Admins can manage all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view profiles in their unit" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Create helper function to check if current user is admin
-- SECURITY DEFINER allows it to bypass RLS when checking role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE id = auth.uid() 
    AND role = 'admin'
    AND active = true
  );
END;
$$;

-- Create helper function to get current user's unit_id
CREATE OR REPLACE FUNCTION public.current_user_unit_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  user_unit_id uuid;
BEGIN
  SELECT unit_id INTO user_unit_id
  FROM public.profiles 
  WHERE id = auth.uid();
  
  RETURN user_unit_id;
END;
$$;

-- Policy: Users can always view their own profile
CREATE POLICY "Users can view own profile"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Policy: Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Policy: Users can view profiles in their unit
CREATE POLICY "Users can view same unit profiles"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (
    unit_id IS NOT NULL 
    AND unit_id = public.current_user_unit_id()
  );

-- Policy: Users can update their own profile (except role and active status)
CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
    AND active = (SELECT active FROM profiles WHERE id = auth.uid())
  );

-- Policy: Admins can insert new profiles
CREATE POLICY "Admins can insert profiles"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- Policy: Admins can update any profile
CREATE POLICY "Admins can update all profiles"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Policy: Admins can delete profiles
CREATE POLICY "Admins can delete profiles"
  ON profiles
  FOR DELETE
  TO authenticated
  USING (public.is_admin());
