/*
# Update staff accounts — Gizelle, Cintia, Erika, Gabriele

1. Purpose
   Update staff roles and access for BN Braga:
   - Gizelle Carvalho: promote to manager (Chefe), fix rejected duplicate account
   - Cintia Santiago Lima: promote to manager (Chefe) with Gestor/Chefe access profile
   - Erika Martins: deactivate (left the company)
   - Gabriele Alves: already inactive, confirmed

2. Changes

   a) Gizelle Carvalho — gizellecarv@gmail.com (id 53ad8386...)
      - role: Staff → Chefe (manager)
      - access_profile_id: already "Gestor / Chefe" — keep

   b) Gizelle Carvalho — restaurantebirabraga@gmail.com (id 681e256c...)
      - account_status: rejected → active
      - role: Staff → Chefe
      - This is a duplicate account that was rejected, causing the login error.
      - We activate it so it no longer blocks, and set it to Chefe as well.
      - Both accounts have the Gestor/Chefe access profile.

   c) Cintia Santiago Lima — cinthiasantiago12@gmail.com (id 3d475627...)
      - role: Staff → Chefe (manager)
      - access_profile_id: Staff Sala → Gestor / Chefe (00154236-6c48-4397-bb8c-b6c7af3f49ca)

   d) Erika Martins — erika.santos.martins@gmail.com (id c869e04a...)
      - active: true → false (deactivated, left the company)

   e) Gabriele Alves — gabrielealves_02@outlook.com (id 4c758540...)
      - Already active = false. No change needed.

3. Security
   - No RLS policy changes.
   - No new tables or columns.
*/
