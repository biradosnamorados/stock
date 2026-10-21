/*
  # Allow all users to view CDP units
  
  1. Changes
    - Add new RLS policy to allow all authenticated users to view units of type 'cdp'
    - This is required for internal orders where restaurants need to see the CDP as destination
  
  2. Security
    - Only applies to SELECT operations
    - Only for authenticated users
    - Only for units with type = 'cdp'
*/

CREATE POLICY "All users can view CDP units"
  ON units
  FOR SELECT
  TO authenticated
  USING (type = 'cdp');
