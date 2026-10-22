-- Passo 2 (depois de o site novo estar publicado):
-- a vista de login deixa de expor o hash do PIN e os hashes antigos são apagados de profiles.

drop view if exists public.login_users;
create view public.login_users as
select p.id, p.full_name, p.username, p.email, p.unit_id, p.department_id, p.active,
       p.has_pin, d.name as department_name
from public.profiles p
left join public.departments d on d.id = p.department_id
where p.active = true;
grant select on public.login_users to anon, authenticated;

update public.profiles set pin_hash = null where pin_hash is not null;
