/*
  # Allow public read access to units

  The registration form is shown to unauthenticated users who need to select
  their unit. This adds a SELECT policy so anyone (including anonymous visitors)
  can read the units list, while all write operations remain admin-only.
*/

CREATE POLICY "Public can view units"
  ON units FOR SELECT
  TO anon
  USING (true);
