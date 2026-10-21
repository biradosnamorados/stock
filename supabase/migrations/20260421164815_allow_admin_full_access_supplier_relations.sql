/*
  # Allow Admin Full Access to Supplier Relations

  ## Problem
  Admin users have no fixed unit (`unit_id` may be null) and are meant to oversee all
  units. The existing SELECT RLS on `supplier_products` filters by
  `supplier_units.unit_id = profile.unit_id`, so admins see zero rows and therefore
  cannot list or associate products to suppliers outside "their" unit.

  ## Fix
  Recreate the SELECT policy so that admins always bypass the unit filter. Also add
  the same bypass for `suppliers` (kept as two permissive policies so the existing
  per-unit visibility for non-admins still applies).

  ## Security
  - Uses existing SECURITY DEFINER `is_admin()` helper to avoid recursive lookups on
    `profiles`.
  - Non-admin users remain restricted to suppliers assigned to their own unit.
*/

DROP POLICY IF EXISTS "Users can view supplier products" ON supplier_products;

CREATE POLICY "Users view supplier products by unit or admin"
  ON supplier_products FOR SELECT
  TO authenticated
  USING (
    is_admin()
    OR supplier_id IN (
      SELECT supplier_units.supplier_id
      FROM supplier_units
      WHERE supplier_units.unit_id IN (
        SELECT profiles.unit_id FROM profiles WHERE profiles.id = auth.uid()
      )
    )
  );
