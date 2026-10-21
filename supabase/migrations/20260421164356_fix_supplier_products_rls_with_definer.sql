/*
  # Fix Supplier Products RLS — Use SECURITY DEFINER Helper

  ## Problem
  The existing policies on `supplier_products` and `supplier_units` run a subquery
  against `profiles` from within the policy. When `profiles` has its own RLS, that
  subquery can return no rows under the current session, causing legitimate
  Admin/Chefe users to hit "new row violates row-level security policy" when
  inserting into `supplier_products`.

  ## Fix
  Introduce `is_supplier_manager()` as a SECURITY DEFINER function that reads the
  role directly, bypassing RLS. Recreate the INSERT/UPDATE/DELETE policies on
  `supplier_products` and `supplier_units` to use this helper.

  ## Security
  - Function is locked to `public` and `pg_temp` search_path.
  - Returns true only for users whose profile role is `Admin` or `Chefe`.
  - No changes to SELECT policies.
*/

CREATE OR REPLACE FUNCTION public.is_supplier_manager()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  RETURN v_role IN ('Admin', 'Chefe');
END;
$function$;

DROP POLICY IF EXISTS "Admins and Chefes can insert supplier products" ON supplier_products;
DROP POLICY IF EXISTS "Admins and Chefes can update supplier products" ON supplier_products;
DROP POLICY IF EXISTS "Admins and Chefes can delete supplier products" ON supplier_products;

CREATE POLICY "Managers can insert supplier products"
  ON supplier_products FOR INSERT
  TO authenticated
  WITH CHECK (is_supplier_manager());

CREATE POLICY "Managers can update supplier products"
  ON supplier_products FOR UPDATE
  TO authenticated
  USING (is_supplier_manager())
  WITH CHECK (is_supplier_manager());

CREATE POLICY "Managers can delete supplier products"
  ON supplier_products FOR DELETE
  TO authenticated
  USING (is_supplier_manager());

DROP POLICY IF EXISTS "Admins and Chefes can insert supplier units" ON supplier_units;
DROP POLICY IF EXISTS "Admins and Chefe can update supplier units" ON supplier_units;
DROP POLICY IF EXISTS "Admins and Chefes can update supplier units" ON supplier_units;
DROP POLICY IF EXISTS "Admins and Chefes can delete supplier units" ON supplier_units;

CREATE POLICY "Managers can insert supplier units"
  ON supplier_units FOR INSERT
  TO authenticated
  WITH CHECK (is_supplier_manager());

CREATE POLICY "Managers can update supplier units"
  ON supplier_units FOR UPDATE
  TO authenticated
  USING (is_supplier_manager())
  WITH CHECK (is_supplier_manager());

CREATE POLICY "Managers can delete supplier units"
  ON supplier_units FOR DELETE
  TO authenticated
  USING (is_supplier_manager());
