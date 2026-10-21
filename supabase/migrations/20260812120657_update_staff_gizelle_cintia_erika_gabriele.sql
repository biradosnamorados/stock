/*
# Update staff accounts — Gizelle, Cintia, Erika, Gabriele

1. Purpose
   Update staff roles and access for BN Braga:
   - Gizelle Carvalho: promote to manager and fix the rejected duplicate account
   - Cintia Santiago Lima: promote to manager with the Gestor / Chefe access profile
   - Erika Martins: deactivate because she left the company
   - Gabriele Alves: confirm she is already inactive

2. Modified records
   - profiles for both Gizelle Carvalho accounts
   - profiles for Cintia Santiago Lima, Erika Martins, and Gabriele Alves

3. Security
   - No RLS policies are changed.
   - Cintia receives the existing Gestor / Chefe profile, whose permissions are already defined.
   - Gizelle's existing Gestor / Chefe profile remains assigned.

4. Important notes
   - The rejected Gizelle account is changed to active so it can authenticate.
   - Gabriele is not changed because she is already inactive.
*/

UPDATE profiles
SET role = 'Chefe',
    account_status = 'active',
    access_profile_id = '00154236-6c48-4397-bb8c-b6c7af3f49ca'::uuid
WHERE id IN (
  '53ad8386-d7cc-4ca7-863b-f8a97bdd84b0'::uuid,
  '681e256c-a3ac-486b-9753-e26fc9a41c7a'::uuid
);

UPDATE profiles
SET role = 'Chefe',
    access_profile_id = '00154236-6c48-4397-bb8c-b6c7af3f49ca'::uuid,
    account_status = 'active'
WHERE id = '3d475627-8743-48d1-ac1c-60f42d1e0fee'::uuid;

UPDATE profiles
SET active = false
WHERE id = 'c869e04a-fa9b-48cb-bea5-17ef8c29eaeb'::uuid;
