-- Passo 1 (compatível com a versão anterior do site):
-- PINs passam para uma tabela inacessível ao cliente, com bcrypt e limite de tentativas.

create table if not exists public.user_pins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  pin_hash text not null,
  legacy_sha boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.user_pins enable row level security; -- sem políticas: só service_role / funções definer

create table if not exists public.pin_attempts (
  id bigserial primary key,
  user_id uuid,
  ip text,
  success boolean not null,
  attempted_at timestamptz not null default now()
);
create index if not exists idx_pin_attempts_user on public.pin_attempts(user_id, attempted_at desc);
create index if not exists idx_pin_attempts_ip on public.pin_attempts(ip, attempted_at desc);
alter table public.pin_attempts enable row level security;

alter table public.profiles add column if not exists has_pin boolean not null default false;

-- migrar os PINs existentes (SHA-256 hex) para bcrypt(sha256) — os utilizadores não precisam de redefinir
insert into public.user_pins (user_id, pin_hash, legacy_sha)
select id, extensions.crypt(pin_hash, extensions.gen_salt('bf', 10)), true
from public.profiles where pin_hash is not null
on conflict (user_id) do nothing;
update public.profiles set has_pin = (pin_hash is not null);

-- definir PIN (o próprio utilizador ou Admin)
create or replace function public.set_user_pin(p_user_id uuid, p_pin text)
returns void language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if auth.uid() is null or (auth.uid() <> p_user_id and not public.is_admin()) then
    raise exception 'Sem permissão';
  end if;
  if p_pin is null or p_pin !~ '^\d{4}$' then
    raise exception 'O PIN deve ter exatamente 4 dígitos';
  end if;
  insert into public.user_pins (user_id, pin_hash, legacy_sha, updated_at)
  values (p_user_id, crypt(p_pin, gen_salt('bf', 10)), false, now())
  on conflict (user_id) do update set pin_hash = excluded.pin_hash, legacy_sha = false, updated_at = now();
  update public.profiles set has_pin = true, pin_hash = null where id = p_user_id;
end; $$;
revoke execute on function public.set_user_pin(uuid, text) from public, anon;
grant execute on function public.set_user_pin(uuid, text) to authenticated;

-- remover PIN (Admin)
create or replace function public.clear_user_pin(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'Sem permissão'; end if;
  delete from public.user_pins where user_id = p_user_id;
  update public.profiles set has_pin = false, pin_hash = null where id = p_user_id;
end; $$;
revoke execute on function public.clear_user_pin(uuid) from public, anon;
grant execute on function public.clear_user_pin(uuid) to authenticated;

-- verificar PIN com limite de tentativas (só a Edge Function, via service_role)
-- devolve: ok | invalid | locked | no_pin
create or replace function public.verify_user_pin(p_user_id uuid, p_pin text, p_ip text)
returns text language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_row public.user_pins%rowtype;
  v_fail_user int;
  v_fail_ip int;
  v_ok boolean;
begin
  select count(*) into v_fail_user from public.pin_attempts
   where user_id = p_user_id and not success and attempted_at > now() - interval '15 minutes';
  select count(*) into v_fail_ip from public.pin_attempts
   where ip = p_ip and not success and attempted_at > now() - interval '15 minutes';
  if v_fail_user >= 5 or v_fail_ip >= 20 then
    return 'locked';
  end if;

  select * into v_row from public.user_pins where user_id = p_user_id;
  if not found then return 'no_pin'; end if;

  if p_pin is null or p_pin !~ '^\d{4}$' then
    v_ok := false;
  elsif v_row.legacy_sha then
    v_ok := v_row.pin_hash = crypt(encode(digest(p_pin, 'sha256'), 'hex'), v_row.pin_hash);
  else
    v_ok := v_row.pin_hash = crypt(p_pin, v_row.pin_hash);
  end if;

  insert into public.pin_attempts (user_id, ip, success) values (p_user_id, p_ip, v_ok);

  if v_ok then
    if v_row.legacy_sha then
      update public.user_pins set pin_hash = crypt(p_pin, gen_salt('bf', 10)), legacy_sha = false, updated_at = now()
       where user_id = p_user_id;
    end if;
    delete from public.pin_attempts where attempted_at < now() - interval '30 days';
    return 'ok';
  end if;
  return 'invalid';
end; $$;
revoke execute on function public.verify_user_pin(uuid, text, text) from public, anon, authenticated;
grant execute on function public.verify_user_pin(uuid, text, text) to service_role;

-- vista de login: acrescenta has_pin e department_name (pin_hash mantém-se até ao passo 2)
create or replace view public.login_users as
select p.id, p.full_name, p.username, p.email, p.unit_id, p.department_id, p.pin_hash, p.active,
       p.has_pin, d.name as department_name
from public.profiles p
left join public.departments d on d.id = p.department_id
where p.active = true;
