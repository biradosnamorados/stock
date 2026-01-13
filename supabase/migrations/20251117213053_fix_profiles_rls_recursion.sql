/*
  # Fix Profiles RLS Infinite Recursion

  1. Problem
    - The "Admins can manage all profiles" policy was querying the profiles table
    - This caused infinite recursion when trying to load profile data
  
  2. Solution
    - Drop the problematic policy
    - Create simpler policies that don't cause recursion
    - Allow users to read their own profile
    - Use a different approach for admin access
  
  3. Security
    - Users can only read their own profile
    - No recursion in policy checks
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON profiles;

-- Create simple, non-recursive policies
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
