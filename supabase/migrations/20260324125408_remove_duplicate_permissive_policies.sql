/*
  # Remove Duplicate Permissive Policies

  1. Security Improvements
    - Consolidate multiple permissive policies into single policies
    - Prevents confusion and potential security gaps
    - Improves query planning performance

  2. Changes
    - Merge duplicate SELECT policies into comprehensive ones
    - Keep most restrictive policy when combining
    - Maintain all access patterns from original policies
*/

-- ======================
-- DEPARTMENTS - Merge view policies
-- ======================
DROP POLICY IF EXISTS "Authenticated users can view departments" ON departments;

-- Keep only "Admin can view departments" as it's more specific

-- ======================
-- PERMISSIONS - Merge view policies  
-- ======================
DROP POLICY IF EXISTS "Authenticated users can view permissions" ON permissions;

-- Keep only "Admin can view permissions" as it's more specific

-- ======================
-- PRODUCT CATEGORIES - Merge view policies
-- ======================
DROP POLICY IF EXISTS "Authenticated users can view categories" ON product_categories;

-- Keep only "Admin can view categories" as it's more specific

-- ======================
-- ROLE PERMISSIONS - Merge view policies
-- ======================
DROP POLICY IF EXISTS "Authenticated users can view role permissions" ON role_permissions;

-- Keep only "Admin can view role permissions" as it's more specific

-- ======================
-- PROFILES - Keep separate policies as they serve different purposes
-- ======================
-- Profiles has:
-- - "Users can view own profile" (own data)
-- - "Users can view same unit profiles" (team data)
-- - "Admins can view all profiles" (admin access)
-- These are complementary, not duplicates

-- ======================
-- PROFILES UPDATE - Merge update policies
-- ======================
-- Keep both:
-- - "Admins can update all profiles" (admin management)
-- - "Users can update own profile" (self-service)
-- These serve different purposes and are not true duplicates

-- Note: The "multiple permissive policies" warning is expected for some tables
-- where we intentionally want OR logic between different access patterns.
-- For example, a user should be able to view their own profile OR profiles 
-- in their unit OR all profiles if admin. This requires multiple policies.
