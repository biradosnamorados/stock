insert into public.system_modules (code, name, description, route, display_order, active)
values ('notices', 'Enviar avisos', 'Enviar avisos a toda a equipa, unidades, equipas ou pessoas', '/avisos/novo', 3, true)
on conflict (code) do nothing;
insert into public.access_rules (department_id, level, module_code) values (null, 'gerente', 'notices') on conflict do nothing;
