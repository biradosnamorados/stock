-- Fotos da fatura associadas à receção de mercadoria (e, através dela, à encomenda).
alter table public.goods_receipts add column if not exists invoice_photo_paths text[] not null default '{}';
alter table public.goods_receipts add column if not exists invoice_date date;
alter table public.goods_receipts add column if not exists invoice_total numeric;
alter table public.goods_receipts add column if not exists invoice_extraction jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoices', 'invoices', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

-- pasta = unit_id da unidade que recebe
create policy invoices_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'invoices' and ((select is_admin()) or (storage.foldername(name))[1] = (select current_user_unit_id())::text));
create policy invoices_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'invoices' and ((select is_admin()) or (storage.foldername(name))[1] = (select current_user_unit_id())::text));
create policy invoices_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'invoices' and (select is_admin()));
