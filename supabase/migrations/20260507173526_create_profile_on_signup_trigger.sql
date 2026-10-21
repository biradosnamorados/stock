/*
  # Auto-create profile on auth user signup

  When a new user is created via supabase.auth.signUp(), Supabase inserts a row
  into auth.users but does NOT automatically create a row in public.profiles.
  This trigger fills that gap so that the registration flow can immediately
  update the profile and insert into registration_requests (which has a FK to profiles).

  Changes:
  - Function: handle_new_user() — inserts a minimal profile row on auth.users INSERT
  - Trigger: on_auth_user_created — fires AFTER INSERT on auth.users
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, active, account_status)
  VALUES (
    NEW.id,
    NEW.email,
    'Staff',
    false,
    'pending_approval'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
