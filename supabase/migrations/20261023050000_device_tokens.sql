-- Aparelhos (iPhone) que recebem notificações push dos avisos.
create table if not exists public.device_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null default 'ios',
  environment text not null default 'production', -- production (TestFlight/App Store) ou sandbox (Xcode)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists device_tokens_user_idx on public.device_tokens(user_id) where active;
alter table public.device_tokens enable row level security;
-- ninguém lê/escreve diretamente; só pelas funções abaixo e pela função de envio (service role)

create or replace function public.register_device(p_token text, p_platform text default 'ios', p_environment text default 'production')
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sem sessão'; end if;
  insert into device_tokens (token, user_id, platform, environment, active, last_seen_at)
  values (p_token, auth.uid(), coalesce(p_platform, 'ios'), coalesce(p_environment, 'production'), true, now())
  on conflict (token) do update set user_id = auth.uid(), platform = excluded.platform,
    environment = excluded.environment, active = true, last_seen_at = now();
end $$;

create or replace function public.forget_device(p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update device_tokens set active = false where token = p_token and user_id = auth.uid();
end $$;

revoke all on function public.register_device(text, text, text) from public, anon;
revoke all on function public.forget_device(text) from public, anon;
grant execute on function public.register_device(text, text, text) to authenticated;
grant execute on function public.forget_device(text) to authenticated;

alter table public.dashboard_notices add column if not exists pushed_at timestamptz;
