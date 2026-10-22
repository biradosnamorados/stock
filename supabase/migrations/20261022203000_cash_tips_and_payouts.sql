-- Gorjetas recebidas em cartão (registadas no fecho) e pagamentos de gorjetas à equipa
-- (aplicada no projeto em 22/10/2026)

create table if not exists public.cash_tips (
  id uuid primary key default gen_random_uuid(),
  closing_id uuid not null references public.cash_closings(id) on delete cascade,
  unit_id uuid not null references public.units(id),
  amount numeric(10,2) not null check (amount > 0),
  payment_method text not null,
  invoice_ref text,
  storage_path text,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_cash_tips_closing on public.cash_tips(closing_id);
create index if not exists idx_cash_tips_unit on public.cash_tips(unit_id, created_at);

create table if not exists public.tip_payouts (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id),
  payout_date date not null default current_date,
  amount numeric(10,2) not null check (amount > 0),
  source text not null default 'caixa' check (source in ('caixa','maquina_trocos','transferencia','outro')),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_tip_payouts_unit on public.tip_payouts(unit_id, payout_date);

alter table public.cash_tips enable row level security;
alter table public.tip_payouts enable row level security;

create policy cash_tips_select on public.cash_tips for select to authenticated
  using ((select public.is_admin()) or unit_id = (select public.current_user_unit_id()));
create policy cash_tips_insert on public.cash_tips for insert to authenticated
  with check (exists (select 1 from public.cash_closings c where c.id = closing_id and c.unit_id = cash_tips.unit_id
    and ((select public.is_admin()) or (c.unit_id = (select public.current_user_unit_id()) and c.status <> 'validated'))));
create policy cash_tips_delete on public.cash_tips for delete to authenticated
  using (exists (select 1 from public.cash_closings c where c.id = closing_id
    and ((select public.is_admin()) or (c.unit_id = (select public.current_user_unit_id()) and c.status <> 'validated'))));

create policy tip_payouts_select on public.tip_payouts for select to authenticated
  using ((select public.is_admin()) or unit_id = (select public.current_user_unit_id()));
create policy tip_payouts_insert on public.tip_payouts for insert to authenticated
  with check ((select public.is_admin())
    or (unit_id = (select public.current_user_unit_id()) and (select public.current_user_role()) = 'Chefe'));
create policy tip_payouts_delete on public.tip_payouts for delete to authenticated
  using ((select public.is_admin()));
