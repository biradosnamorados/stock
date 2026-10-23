-- Avisos da administração: para todos, unidades, equipas (unidade + equipa) ou pessoas escolhidas,
-- com lista de destinatários resolvida no envio (contagem, confirmação de leitura e, mais tarde, push).
alter table public.dashboard_notices add column if not exists audience jsonb;
alter table public.dashboard_notices add column if not exists urgent boolean not null default false;
alter table public.dashboard_notices add column if not exists require_ack boolean not null default false;

create table if not exists public.notice_recipients (
  notice_id uuid not null references public.dashboard_notices(id),
  user_id uuid not null references public.profiles(id),
  read_at timestamptz,
  primary key (notice_id, user_id)
);
alter table public.notice_recipients enable row level security;

-- funções auxiliares (security definer) para as regras não se chamarem umas às outras em ciclo
create or replace function public.is_notice_author(p_notice uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from dashboard_notices where id = p_notice and created_by = auth.uid())
$$;
create or replace function public.is_notice_recipient(p_notice uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from notice_recipients where notice_id = p_notice and user_id = auth.uid())
$$;

create policy notice_recipients_own on public.notice_recipients for select to authenticated
  using (user_id = auth.uid() or public.is_admin() or public.is_notice_author(notice_id));

-- quem recebe um aviso também o pode ler (além da regra antiga por unidade/equipa)
create policy notices_recipient_read on public.dashboard_notices for select to authenticated
  using (public.is_notice_recipient(dashboard_notices.id) or created_by = auth.uid());

-- audience: {"type":"all"} | {"type":"units","units":[uuid]} | {"type":"teams","teams":[{"unit":uuid,"dept":uuid}]} | {"type":"people","people":[uuid]}
create or replace function public.notice_audience_users(p_audience jsonb) returns setof uuid
language plpgsql stable security definer set search_path = public as $$
declare v_me profiles%rowtype; v_type text := coalesce(p_audience->>'type', 'all');
begin
  select * into v_me from profiles where id = auth.uid() and active;
  if v_me.id is null then raise exception 'Sem sessão válida'; end if;
  if coalesce(v_me.role, '') <> 'Admin' and coalesce(v_me.access_level, '') <> 'gerente' then
    raise exception 'Só a administração pode enviar avisos';
  end if;
  return query
    select p.id from profiles p
    where p.active
      and (v_me.role = 'Admin' or p.unit_id = v_me.unit_id)          -- gerente: só a sua unidade
      and case v_type
        when 'all' then true
        when 'units' then p.unit_id in (select (jsonb_array_elements_text(p_audience->'units'))::uuid)
        when 'teams' then exists (select 1 from jsonb_array_elements(p_audience->'teams') t
                                  where (t->>'unit')::uuid = p.unit_id and (t->>'dept')::uuid = p.department_id)
        when 'people' then p.id in (select (jsonb_array_elements_text(p_audience->'people'))::uuid)
        else false end;
end $$;

create or replace function public.notice_audience_count(p_audience jsonb) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.notice_audience_users(p_audience)
$$;

create or replace function public.send_notice(p_title text, p_message text, p_audience jsonb,
  p_urgent boolean default false, p_require_ack boolean default false, p_days int default 7) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_n int;
begin
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_message), '') = '' then raise exception 'Título e mensagem são obrigatórios'; end if;
  insert into dashboard_notices (title, message, start_date, end_date, priority, created_by, audience, urgent, require_ack)
  values (trim(p_title), trim(p_message), current_date, current_date + greatest(1, least(coalesce(p_days, 7), 90)),
          case when p_urgent then 'urgent' else 'high' end, auth.uid(), p_audience, coalesce(p_urgent, false), coalesce(p_require_ack, false))
  returning id into v_id;
  insert into notice_recipients (notice_id, user_id) select v_id, u from notice_audience_users(p_audience) u
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Nenhum destinatário — escolha outra audiência'; end if;
  return jsonb_build_object('id', v_id, 'recipients', v_n);
end $$;

create or replace function public.mark_notice_read(p_notice uuid) returns void
language sql security definer set search_path = public as $$
  update notice_recipients set read_at = coalesce(read_at, now()) where notice_id = p_notice and user_id = auth.uid()
$$;

revoke execute on function public.notice_audience_users(jsonb) from public, anon, authenticated;
revoke execute on function public.notice_audience_count(jsonb) from public, anon;
revoke execute on function public.send_notice(text, text, jsonb, boolean, boolean, int) from public, anon;
revoke execute on function public.mark_notice_read(uuid) from public, anon;
grant execute on function public.notice_audience_count(jsonb) to authenticated;
grant execute on function public.send_notice(text, text, jsonb, boolean, boolean, int) to authenticated;
grant execute on function public.mark_notice_read(uuid) to authenticated;

-- a regra antiga mostrava todos os avisos ativos a toda a gente; passa a valer só para os avisos antigos (sem audiência)
alter policy "Authenticated users can view active relevant notices" on public.dashboard_notices
  using (audience is null and current_date >= start_date and current_date <= end_date);
