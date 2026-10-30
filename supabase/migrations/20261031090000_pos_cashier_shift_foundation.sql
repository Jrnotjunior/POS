-- Cashier shift persistence foundation.
-- All reads/writes are intentionally routed through the authenticated POS API.
create table if not exists public.pos_cashier_shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  cashier_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'open' check (status in ('open','closed')),
  opening_cash_centavos bigint not null check (opening_cash_centavos >= 0 and opening_cash_centavos <= 2000000000),
  expected_cash_centavos bigint,
  counted_cash_centavos bigint,
  cash_variance_centavos bigint,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  close_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_cashier_shifts_branch_tenant_fk foreign key (tenant_id, branch_id)
    references public.branches(tenant_id, id) on delete restrict,
  constraint pos_cashier_shifts_close_state check (
    (status = 'open' and closed_at is null and counted_cash_centavos is null and cash_variance_centavos is null)
    or
    (status = 'closed' and closed_at is not null and counted_cash_centavos is not null and expected_cash_centavos is not null and cash_variance_centavos = counted_cash_centavos - expected_cash_centavos)
  )
);

create unique index if not exists pos_cashier_shifts_one_open_per_cashier_branch
  on public.pos_cashier_shifts (tenant_id, branch_id, cashier_user_id) where status = 'open';
create index if not exists pos_cashier_shifts_branch_opened_idx
  on public.pos_cashier_shifts (tenant_id, branch_id, opened_at desc);

alter table public.pos_sales add column if not exists cashier_shift_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pos_sales_cashier_shift_fk') then
    alter table public.pos_sales add constraint pos_sales_cashier_shift_fk
      foreign key (cashier_shift_id) references public.pos_cashier_shifts(id) on delete restrict;
  end if;
end $$;
create index if not exists pos_sales_cashier_shift_idx
  on public.pos_sales (cashier_shift_id) where cashier_shift_id is not null;

alter table public.pos_cashier_shifts enable row level security;
revoke all on public.pos_cashier_shifts from anon, authenticated;
grant select, insert, update on public.pos_cashier_shifts to service_role;

comment on table public.pos_cashier_shifts is 'Cashier shift records; all access is through authenticated, branch-authorized POS API operations.';
comment on column public.pos_cashier_shifts.cash_variance_centavos is 'Counted cash minus expected cash, in centavos.';
comment on column public.pos_sales.cashier_shift_id is 'Shift association for cash reconciliation; nullable for historical sales created before shift enforcement.';
