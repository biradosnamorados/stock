-- Novo modelo de acessos: Unidade + Equipa (departments) + Nível.
--   colaborador < responsavel < gerente < admin
-- O acesso a cada área sai da grelha access_rules (equipa × nível × módulo), com exceções por pessoa
-- em user_access_overrides. O "papel" antigo (Staff/Chefe/Admin), usado pelas regras RLS,
-- passa a ser derivado automaticamente do nível.

-- ── nível ──
alter table public.profiles add column if not exists access_level text
  check (access_level in ('colaborador', 'responsavel', 'gerente', 'admin'));

create or replace function public.level_rank(p text) returns int language sql immutable as $$
  select case p when 'colaborador' then 1 when 'responsavel' then 2 when 'gerente' then 3 when 'admin' then 4 else 0 end
$$;

create or replace function public.profiles_sync_role() returns trigger language plpgsql as $$
begin
  if new.access_level is not null then
    new.role := case new.access_level when 'admin' then 'Admin' when 'colaborador' then 'Staff' else 'Chefe' end;
  end if;
  return new;
end $$;
create trigger profiles_sync_role before insert or update of access_level, role on public.profiles
  for each row execute function public.profiles_sync_role();

-- ── proteção: ninguém muda o próprio papel/nível/unidade pela API ──
-- (antes, "Users can update own profile" permitia a qualquer utilizador pôr-se como Admin)
create or replace function public.profiles_guard() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and not coalesce(public.is_admin(), false) then
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
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- ── módulos novos ──
insert into public.system_modules (code, name, description, route, display_order, active) values
  ('scanner', 'Ler QR', 'Leitura das etiquetas e ações nas embalagens', '/scanner', 2, true),
  ('cash_closing_manage', 'Fecho de caixa – gestão', 'Ver o teórico, validar fechos, histórico e gorjetas', '/cash-closing-report', 19, true),
  ('uber', 'Uber Eats', 'Relatórios e reembolsos da Uber Eats', '/uber', 20, true),
  ('access_rules', 'Níveis de acesso', 'Grelha de acessos por equipa e nível', '/access-profiles', 30, true)
on conflict (code) do nothing;

-- ── grelha ──
create table if not exists public.access_rules (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id),   -- null = todas as equipas
  level text not null check (level in ('colaborador', 'responsavel', 'gerente')),
  module_code text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists access_rules_uniq on public.access_rules
  (coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid), level, module_code);

create table if not exists public.user_access_overrides (
  user_id uuid not null references public.profiles(id),
  module_code text not null,
  granted boolean,            -- true = dá acesso, false = tira, null = sem exceção
  set_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (user_id, module_code)
);

alter table public.access_rules enable row level security;
alter table public.user_access_overrides enable row level security;
create policy access_rules_read on public.access_rules for select to authenticated using (true);
create policy access_rules_admin on public.access_rules for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy overrides_read on public.user_access_overrides for select to authenticated
  using (user_id = auth.uid() or public.is_admin() or exists (
    select 1 from public.profiles me, public.profiles t
    where me.id = auth.uid() and me.access_level = 'gerente' and t.id = user_access_overrides.user_id and t.unit_id = me.unit_id));

-- ── que áreas tem cada pessoa ──
create or replace function public.modules_for(p_user uuid) returns text[]
language sql stable security definer set search_path = public as $$
  with me as (select id, coalesce(access_level, case role when 'Admin' then 'admin' when 'Chefe' then 'responsavel' else 'colaborador' end) lvl, department_id
              from profiles where id = p_user and active),
  base as (
    select sm.code from system_modules sm, me where me.lvl = 'admin' and sm.active
    union
    select r.module_code from access_rules r, me
     where me.lvl <> 'admin'
       and (r.department_id is null or r.department_id = me.department_id)
       and public.level_rank(r.level) <= public.level_rank(me.lvl)
  )
  select coalesce(array_agg(distinct code order by code), '{}') from (
    select code from base
     where code not in (select o.module_code from user_access_overrides o, me where o.user_id = me.id and o.granted = false)
    union
    select o.module_code from user_access_overrides o, me where o.user_id = me.id and o.granted = true
  ) x
$$;

create or replace function public.my_modules() returns text[]
language sql stable security definer set search_path = public as $$ select public.modules_for(auth.uid()) $$;

create or replace function public.has_module(p_code text) returns boolean
language sql stable security definer set search_path = public as $$ select p_code = any(public.modules_for(auth.uid())) $$;

-- pré-visualização para quem gere (admin, ou gerente para a sua unidade)
create or replace function public.modules_for_user(p_user uuid) returns text[]
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or exists (
      select 1 from profiles me, profiles t where me.id = auth.uid() and me.access_level = 'gerente' and t.id = p_user and t.unit_id = me.unit_id)) then
    raise exception 'Sem permissão';
  end if;
  return public.modules_for(p_user);
end $$;

-- ── alterar equipa / nível / exceções (admin; gerente só na sua unidade e até responsável) ──
create or replace function public.set_user_access(p_user uuid, p_unit uuid, p_department uuid, p_level text) returns void
language plpgsql security definer set search_path = public as $$
declare v_me profiles%rowtype; v_t profiles%rowtype;
begin
  select * into v_me from profiles where id = auth.uid() and active;
  select * into v_t from profiles where id = p_user;
  if v_t.id is null then raise exception 'Utilizador não encontrado'; end if;
  if p_level not in ('colaborador', 'responsavel', 'gerente', 'admin') then raise exception 'Nível inválido'; end if;
  if v_me.id is null then raise exception 'Sem sessão válida'; end if;
  if coalesce(v_me.role, '') <> 'Admin' then
    if coalesce(v_me.access_level, '') <> 'gerente' or v_me.unit_id is null
       or v_t.unit_id is distinct from v_me.unit_id or p_unit is distinct from v_me.unit_id
       or p_level not in ('colaborador', 'responsavel') or v_t.access_level in ('gerente', 'admin') or v_t.id = v_me.id then
      raise exception 'Sem permissão';
    end if;
  end if;
  update profiles set unit_id = p_unit, department_id = p_department, access_level = p_level, updated_at = now() where id = p_user;
  insert into audit_logs (user_id, action, entity, entity_id, changes)
  values (auth.uid(), 'set_user_access', 'profiles', p_user, jsonb_build_object('unit_id', p_unit, 'department_id', p_department, 'level', p_level));
end $$;

create or replace function public.set_user_override(p_user uuid, p_module text, p_granted boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_me profiles%rowtype; v_t profiles%rowtype;
begin
  select * into v_me from profiles where id = auth.uid() and active;
  select * into v_t from profiles where id = p_user;
  if v_me.id is null then raise exception 'Sem sessão válida'; end if;
  if v_t.id is null then raise exception 'Utilizador não encontrado'; end if;
  if coalesce(v_me.role, '') <> 'Admin' then
    if coalesce(v_me.access_level, '') <> 'gerente' or v_me.unit_id is null or v_t.unit_id is distinct from v_me.unit_id or v_t.id = v_me.id
       or p_module in ('import', 'smtp_settings', 'cashmatic_settings', 'access_rules') then
      raise exception 'Sem permissão';
    end if;
  end if;
  insert into user_access_overrides (user_id, module_code, granted, set_by) values (p_user, p_module, p_granted, auth.uid())
  on conflict (user_id, module_code) do update set granted = excluded.granted, set_by = excluded.set_by, created_at = now();
  insert into audit_logs (user_id, action, entity, entity_id, changes)
  values (auth.uid(), 'set_user_override', 'profiles', p_user, jsonb_build_object('module', p_module, 'granted', p_granted));
end $$;

revoke execute on function public.modules_for(uuid) from public, anon, authenticated;
revoke execute on function public.set_user_access(uuid, uuid, uuid, text) from public, anon;
revoke execute on function public.set_user_override(uuid, text, boolean) from public, anon;
revoke execute on function public.modules_for_user(uuid) from public, anon;
grant execute on function public.my_modules() to authenticated;
grant execute on function public.has_module(text) to authenticated;
grant execute on function public.modules_for_user(uuid) to authenticated;
grant execute on function public.set_user_access(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.set_user_override(uuid, text, boolean) to authenticated;

-- ── fecho de caixa: validar / gorjetas passa a depender da área "gestão", não do papel ──
alter policy cash_closings_update on public.cash_closings
  using ((select public.is_admin()) or ((unit_id = (select public.current_user_unit_id()))
         and ((status <> 'validated') or (select public.has_module('cash_closing_manage')))));
alter policy tip_payouts_insert on public.tip_payouts
  with check ((select public.is_admin()) or ((unit_id = (select public.current_user_unit_id()))
              and (select public.has_module('cash_closing_manage'))));
