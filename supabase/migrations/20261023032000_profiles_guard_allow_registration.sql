-- O registo próprio (Register.tsx) atualiza a unidade do perfil pendente; permitir só nesse caso.
create or replace function public.profiles_guard() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and not coalesce(public.is_admin(), false) then
    if old.account_status = 'pending_approval' and not coalesce(old.active, false)
       and new.account_status = 'pending_approval' and not coalesce(new.active, false)
       and new.role = 'Staff' and new.access_level is not distinct from old.access_level
       and new.access_profile_id is not distinct from old.access_profile_id
       and new.email is not distinct from old.email then
      return new;
    end if;
    if new.role is distinct from old.role
      or new.access_level is distinct from old.access_level
      or new.unit_id is distinct from old.unit_id
      or new.department_id is distinct from old.department_id
      or new.access_profile_id is distinct from old.access_profile_id
      or new.active is distinct from old.active
      or new.account_status is distinct from old.account_status
      or new.email is distinct from old.email then
      raise exception 'Sem permissão para alterar estes dados';
    end if;
  end if;
  return new;
end $$;
