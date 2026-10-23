-- Leitor de QR do dia a dia.
-- As embalagens nascem no CDP e muitas vezes chegam aos restaurantes sem a encomenda interna
-- ter as embalagens associadas. Com as políticas RLS atuais, quem está no restaurante não
-- conseguia ver uma embalagem que ainda "está" no CDP -> "Embalagem não encontrada".
-- Estas duas funções resolvem isso: qualquer utilizador ativo consegue ler a embalagem e,
-- ao registar uma ação, a embalagem passa para a unidade de quem a leu (receção implícita).

create or replace function public.qr_normalize_code(p_code text) returns text
language sql immutable as $$
  -- aceita o código puro ou um URL ".../scanner?code=XXX"
  select trim(coalesce(substring(p_code from '[?&]code=([^&#]+)'), p_code))
$$;

create or replace function public.scan_package(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_code text := public.qr_normalize_code(p_code);
  v_res jsonb;
begin
  if not exists (select 1 from profiles where id = auth.uid() and active) then
    raise exception 'Sem sessão válida';
  end if;

  select jsonb_build_object(
    'id', pu.id,
    'unique_code', pu.unique_code,
    'display_code', pu.display_code,
    'status', pu.status,
    'weight', pu.weight,
    'unit', pu.unit,
    'product_name', coalesce(p.name, bp.name),
    'product_code', coalesce(p.code, bp.code),
    'storage_type', coalesce(p.storage_type, bp.storage_type),
    'batch_code', pb.batch_code,
    'production_date', pb.production_date,
    'packaging_date', pu.packaging_date,
    'expiry_date', coalesce(pu.expiry_date, pb.expiry_date),
    'location_id', pu.location_id,
    'location_name', u.name,
    'opened_at', pu.opened_at,
    'final_action', pu.final_action,
    'final_action_at', pu.final_action_at,
    'final_action_reason', pu.final_action_reason,
    'history', coalesce((
      select jsonb_agg(h order by h->>'at' desc) from (
        select jsonb_build_object('at', a.created_at, 'action', a.action, 'by', pr.full_name) h
        from audit_logs a left join profiles pr on pr.id = a.user_id
        where a.entity = 'packaged_units' and a.entity_id = pu.id
        order by a.created_at desc limit 10
      ) x
    ), '[]'::jsonb)
  ) into v_res
  from packaged_units pu
  left join production_batches pb on pb.id = pu.batch_id
  left join products p on p.id = pu.product_id
  left join products bp on bp.id = pb.product_id
  left join units u on u.id = pu.location_id
  where pu.unique_code = v_code or pu.display_code = v_code
  limit 1;

  return v_res; -- null = não encontrada
end $$;

create or replace function public.package_action(p_code text, p_action text, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_code text := public.qr_normalize_code(p_code);
  v_user uuid := auth.uid();
  v_unit uuid;
  v_pkg packaged_units%rowtype;
  v_new_status text;
  v_moved boolean := false;
begin
  select unit_id into v_unit from profiles where id = v_user and active;
  if not found then raise exception 'Sem sessão válida'; end if;

  select * into v_pkg from packaged_units where unique_code = v_code or display_code = v_code limit 1 for update;
  if not found then raise exception 'Embalagem não encontrada'; end if;

  if v_pkg.status in ('used', 'consumed', 'waste') then
    raise exception 'Esta embalagem já foi fechada (%).', case v_pkg.status when 'waste' then 'desperdício' else 'utilizada' end;
  end if;

  if p_action not in ('open', 'used', 'waste', 'blocked', 'returned', 'unblock') then
    raise exception 'Ação inválida';
  end if;
  if p_action in ('waste', 'blocked') and coalesce(trim(p_reason), '') = '' then
    raise exception 'Indique o motivo';
  end if;
  if p_action = 'open' and v_pkg.status = 'opened' then raise exception 'A embalagem já está aberta'; end if;
  if p_action = 'unblock' and v_pkg.status <> 'blocked' then raise exception 'A embalagem não está bloqueada'; end if;
  if p_action <> 'unblock' and v_pkg.status = 'blocked' then raise exception 'Embalagem bloqueada. Desbloqueie primeiro.'; end if;

  -- receção implícita: a embalagem está a ser usada noutra unidade
  if v_unit is not null and v_pkg.location_id is distinct from v_unit then
    v_moved := true;
    insert into packaged_unit_transfers (packaged_unit_id, from_location_id, to_location_id, initiated_by, received_by,
      initiated_at, received_at, status, notes)
    values (v_pkg.id, v_pkg.location_id, v_unit, v_user, v_user, now(), now(), 'received', 'Receção automática pela leitura do QR');
  end if;

  v_new_status := case p_action
    when 'open' then 'opened'
    when 'unblock' then 'available'
    else p_action end;

  update packaged_units set
    status = v_new_status,
    location_id = coalesce(v_unit, location_id),
    received_at = case when v_moved then coalesce(received_at, now()) else received_at end,
    opened_at = case when p_action = 'open' then now() else opened_at end,
    opened_by = case when p_action = 'open' then v_user else opened_by end,
    consumed_at = case when p_action = 'used' then now() else consumed_at end,
    consumed_by = case when p_action = 'used' then v_user else consumed_by end,
    final_action = case when p_action in ('used', 'waste', 'returned') then p_action else final_action end,
    final_action_at = case when p_action in ('used', 'waste', 'returned') then now() else final_action_at end,
    final_action_by = case when p_action in ('used', 'waste', 'returned') then v_user else final_action_by end,
    final_action_reason = case when p_action in ('used', 'waste', 'returned', 'blocked') then nullif(trim(p_reason), '') else final_action_reason end,
    updated_by = v_user,
    updated_at = now()
  where id = v_pkg.id;

  if p_action in ('used', 'waste', 'returned', 'blocked') and v_unit is not null then
    insert into packaged_unit_usage_actions (packaged_unit_id, action_type, performed_by, location_id, reason, qr_code_scanned)
    values (v_pkg.id, p_action, v_user, v_unit, nullif(trim(p_reason), ''), true);
  end if;

  insert into audit_logs (user_id, action, entity, entity_id, changes)
  values (v_user, 'package_' || p_action, 'packaged_units', v_pkg.id,
          jsonb_build_object('from_status', v_pkg.status, 'to_status', v_new_status, 'reason', p_reason, 'moved_to_unit', case when v_moved then v_unit end));

  return public.scan_package(v_code);
end $$;

revoke execute on function public.scan_package(text) from public, anon;
revoke execute on function public.package_action(text, text, text) from public, anon;
grant execute on function public.scan_package(text) to authenticated;
grant execute on function public.package_action(text, text, text) to authenticated;
