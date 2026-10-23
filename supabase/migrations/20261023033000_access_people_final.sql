-- Ajustes pedidos: Brenno → Cozinha; Miguel e Gizelle já não trabalham (desativados);
-- Cintia → Gerente (BN Braga); Diogo → Admin.
update public.profiles set department_id = 'c925b7e0-eb05-4f43-a387-8ea471cbd3d6', access_level = 'colaborador' where id = '7caa8c18-9fd4-46c5-b899-dee4c57a584f';
update public.profiles set active = false, updated_at = now() where id in ('7c48c0cc-a382-4003-8832-e2fea68b9c56', '681e256c-a3ac-486b-9753-e26fc9a41c7a');
update public.profiles set access_level = 'gerente' where id = '3d475627-8743-48d1-ac1c-60f42d1e0fee';
update public.profiles set access_level = 'admin' where id = 'f657632c-d148-4098-86a2-3f24eb1889f3';
