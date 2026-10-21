/*
# Fix RLS policies on purchased_product_suppliers

## Problem
The existing INSERT/UPDATE/DELETE policy checks `profiles.role = ANY(ARRAY['admin', 'cdp_manager'])`
in lowercase, but actual roles are stored as 'Admin', 'Chefe', 'Staff' (capitalized).
This mismatch blocks all inserts, causing "new row violates row-level security policy"
errors during supplier-product imports.

## Changes
1. Drop the broken "CDP managers can manage supplier products" FOR ALL policy.
2. Create separate SELECT, INSERT, UPDATE, DELETE policies scoped to Admin and Chefe roles
   using a case-insensitive comparison (lower(role) IN ('admin', 'cdp_manager')).
   Note: 'cdp_manager' is kept for forward-compat even though current roles use 'Chefe'.
3. Drop the redundant permissive SELECT policy (replaced by the new scoped one).
*/

-- Drop old policies
DROP POLICY IF EXISTS "CDP managers can manage supplier products" ON purchased_product_suppliers;
DROP POLICY IF EXISTS "All authenticated users can view supplier products" ON purchased_product_suppliers;

-- SELECT: all authenticated users can view
CREATE POLICY "select_purchased_product_suppliers"
ON purchased_product_suppliers FOR SELECT
TO authenticated
USING (true);

-- INSERT: Admin and Chefe only
CREATE POLICY "insert_purchased_product_suppliers"
ON purchased_product_suppliers FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND lower(profiles.role) IN ('admin', 'cdp_manager', 'chefe')
  )
);

-- UPDATE: Admin and Chefe only
CREATE POLICY "update_purchased_product_suppliers"
ON purchased_product_suppliers FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND lower(profiles.role) IN ('admin', 'cdp_manager', 'chefe')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND lower(profiles.role) IN ('admin', 'cdp_manager', 'chefe')
  )
);

-- DELETE: Admin and Chefe only
CREATE POLICY "delete_purchased_product_suppliers"
ON purchased_product_suppliers FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND lower(profiles.role) IN ('admin', 'cdp_manager', 'chefe')
  )
);
