/*
  # Fix Profiles INSERT Policy
  
  1. Changes
    - Add INSERT policy for admins to create new user profiles
    - Add INSERT policy for service role (used by signUp)
  
  2. Security
    - Only admins can create profiles for other users
    - Service role can insert profiles during user creation
*/

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Service role can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

-- Allow service role to insert profiles (for signUp function)
CREATE POLICY "Service role can insert profiles"
  ON profiles
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Allow new users to insert their own profile during registration
CREATE POLICY "Users can insert own profile"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Allow admins to insert profiles for any user
CREATE POLICY "Admins can insert profiles"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );
