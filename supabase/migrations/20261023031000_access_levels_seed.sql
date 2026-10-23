-- Grelha inicial (equipa × nível) e atribuição de cada pessoa.
-- Equipas: Sala 94517eed…, Cozinha c925b7e0…, Produção bfc9c7c7…  (null = todas)
insert into public.access_rules (department_id, level, module_code)
select nullif(d, '')::uuid, l, m from (values
  -- todos os colaboradores
  ('', 'colaborador', 'dashboard'), ('', 'colaborador', 'scanner'), ('', 'colaborador', 'haccp'), ('', 'colaborador', 'mandatory_tasks'),
  -- Sala
  ('94517eed-0b9b-42be-afb3-61e12b2e0828', 'colaborador', 'cash_closing'),
  ('94517eed-0b9b-42be-afb3-61e12b2e0828', 'responsavel', 'cash_closing_manage'),
  ('94517eed-0b9b-42be-afb3-61e12b2e0828', 'responsavel', 'uber'),
  -- Cozinha
  ('c925b7e0-eb05-4f43-a387-8ea471cbd3d6', 'colaborador', 'stock'),
  ('c925b7e0-eb05-4f43-a387-8ea471cbd3d6', 'colaborador', 'stock_counts'),
  ('c925b7e0-eb05-4f43-a387-8ea471cbd3d6', 'colaborador', 'internal_orders'),
  ('c925b7e0-eb05-4f43-a387-8ea471cbd3d6', 'colaborador', 'goods_receipts'),
  ('c925b7e0-eb05-4f43-a387-8ea471cbd3d6', 'responsavel', 'purchase_orders'),
  ('c925b7e0-eb05-4f43-a387-8ea471cbd3d6', 'responsavel', 'price_analysis'),
  -- Produção (CDP)
  ('bfc9c7c7-6323-4e4f-914a-c800a4061706', 'colaborador', 'production'),
  ('bfc9c7c7-6323-4e4f-914a-c800a4061706', 'colaborador', 'packaging'),
  ('bfc9c7c7-6323-4e4f-914a-c800a4061706', 'colaborador', 'recipes'),
  ('bfc9c7c7-6323-4e4f-914a-c800a4061706', 'colaborador', 'stock'),
  ('bfc9c7c7-6323-4e4f-914a-c800a4061706', 'colaborador', 'internal_orders'),
  ('bfc9c7c7-6323-4e4f-914a-c800a4061706', 'colaborador', 'goods_receipts'),
  ('bfc9c7c7-6323-4e4f-914a-c800a4061706', 'responsavel', 'purchase_orders'),
  ('bfc9c7c7-6323-4e4f-914a-c800a4061706', 'responsavel', 'price_analysis'),
  -- Gerente (qualquer equipa): toda a operação da unidade
  ('', 'gerente', 'cash_closing'), ('', 'gerente', 'cash_closing_manage'), ('', 'gerente', 'uber'),
  ('', 'gerente', 'internal_orders'), ('', 'gerente', 'purchase_orders'), ('', 'gerente', 'goods_receipts'),
  ('', 'gerente', 'stock'), ('', 'gerente', 'stock_counts'), ('', 'gerente', 'price_analysis'),
  ('', 'gerente', 'products'), ('', 'gerente', 'suppliers'), ('', 'gerente', 'users'),
  ('', 'gerente', 'recipes'), ('', 'gerente', 'production'), ('', 'gerente', 'packaging')
) v(d, l, m)
on conflict do nothing;

-- pessoas
update public.profiles set access_level = 'admin' where id = 'd158f485-d780-4a10-836f-9d3ddea83ea2';                       -- Diego
update public.profiles set access_level = 'responsavel'
  where id in ('1b5bfd35-da7a-41e6-84b5-1f9c2bf3fd8a', 'd71bc348-b3ff-415b-bdd8-132206e6ac65',                             -- David, Ivone
               '9e864b9d-7d9d-4bf2-99d2-ed491f828cd3', 'fcd00e5d-2df1-437f-bed2-2b270ab5e979');                            -- Juliana, João (Cozinha)
update public.profiles set access_level = 'colaborador' where id = 'fd47d09d-a0a2-4b82-8d43-7442fd39aaba';                 -- Ronald (Cozinha)
update public.profiles set access_level = 'responsavel'
  where id in ('681e256c-a3ac-486b-9753-e26fc9a41c7a', '3d475627-8743-48d1-ac1c-60f42d1e0fee');                            -- Gizelle, Cintia (Sala)
update public.profiles set access_level = 'colaborador', department_id = '94517eed-0b9b-42be-afb3-61e12b2e0828'
  where id in ('954bf8a9-99b9-4d47-b3d6-8a60792efc12', '2ee7d68a-85fc-4bb5-ba60-01730009dae5');                            -- Christiana, Maria (Sala)
update public.profiles set access_level = 'colaborador'
  where id in ('7c48c0cc-a382-4003-8832-e2fea68b9c56', '7caa8c18-9fd4-46c5-b899-dee4c57a584f');                            -- Miguel, Brenno (equipa por definir)
update public.profiles set access_level = 'colaborador' where id = '2ada253e-3f8a-49c8-8571-869b0c55b3f4';                 -- Jessy (Produção)
update public.profiles set access_level = 'responsavel' where id = '2d0a9721-9f82-43c9-9b06-accf250ee8e9';                 -- Ludmila (Produção)
update public.profiles set access_level = 'gerente' where id = 'f657632c-d148-4098-86a2-3f24eb1889f3';                     -- Diogo
