/*
  # Add username to profiles

  ## Summary
  Adds a unique `username` field to the profiles table to allow login by username in addition to email.

  ## Changes
  - `profiles`: new column `username` (text, unique, nullable)
  - New function `get_email_by_username(username text)` returns the auth email for a given username (security definer, accessible to anon)

  ## Notes
  - Username is optional; users can still log in with email
  - Username must be unique across all profiles
  - The helper function is SECURITY DEFINER so it can query auth.users without exposing all data
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'username'
  ) THEN
    ALTER TABLE profiles ADD COLUMN username text UNIQUE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS profiles_username_idx ON profiles (username);

CREATE OR REPLACE FUNCTION get_email_by_username(p_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT u.email INTO v_email
  FROM profiles pr
  JOIN auth.users u ON u.id = pr.id
  WHERE lower(pr.username) = lower(p_username)
  LIMIT 1;

  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION get_email_by_username(text) TO anon, authenticated;
