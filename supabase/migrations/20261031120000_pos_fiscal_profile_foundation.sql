-- Taxpayer-specific fiscal configuration foundation.
-- This stores configuration only; it does not enable tax invoice issuance or confer BIR authorization.
create table if not exists public.pos_fiscal_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  taxpayer_registered_name text not null check (length(btrim(taxpayer_registered_name)) between 2 and 200),
  trade_name text check (trade_name is null or length(btrim(trade_name)) between 1 and 200),
  taxpayer_tin text not null check (taxpayer_tin ~ '^[0-9]{9,12}$'),
  tin_branch_code text not null check (tin_branch_code ~ '^[0-9]{3}$'),
  registered_address text not null check (length(btrim(registered_address)) between 5 and 500),
  tax_regime text not null check (tax_regime in ('vat_registered','non_vat','other_requires_review')),
  invoice_document_type text not null default 'invoice' check (invoice_document_type = 'invoice'),
  invoice_series_prefix text not null check (invoice_series_prefix ~ '^[A-Z0-9-]{1,20}$'),
  fiscal_status text not null default 'draft' check (fiscal_status in ('draft','pending_review','authorized','suspended')),
  authorization_reference text,
  authorization_effective_at timestamptz,
  authorization_expires_at timestamptz,
  authorized_by uuid references auth.users(id) on delete restrict,
  authorized_at timestamptz,
  software_name text not null check (length(btrim(software_name)) between 2 and 160),
  software_version text not null check (length(btrim(software_version)) between 1 and 80),
  machine_or_terminal_identifier text,
  additional_authorization_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(additional_authorization_metadata) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_fiscal_profiles_branch_tenant_fk foreign key (tenant_id, branch_id)
    references public.branches(tenant_id, id) on delete restrict,
  constraint pos_fiscal_profiles_tenant_branch_unique unique (tenant_id, branch_id),
  constraint pos_fiscal_profiles_authorized_state check (
    fiscal_status <> 'authorized'
    or (
      nullif(btrim(authorization_reference), '') is not null
      and authorization_effective_at is not null
      and authorized_by is not null
      and authorized_at is not null
    )
  ),
  constraint pos_fiscal_profiles_authorization_dates check (
    authorization_expires_at is null or authorization_effective_at is null
    or authorization_expires_at > authorization_effective_at
  )
);

create table if not exists public.pos_fiscal_profile_audit_events (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.pos_fiscal_profiles(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  event_type text not null check (event_type in ('created','updated','status_changed')),
  previous_status text,
  new_status text not null,
  changed_fields text[] not null default '{}',
  actor_user_id uuid,
  occurred_at timestamptz not null default clock_timestamp(),
  transaction_id bigint not null default txid_current()
);

create index if not exists pos_fiscal_profile_audit_events_tenant_branch_time_idx
  on public.pos_fiscal_profile_audit_events (tenant_id, branch_id, occurred_at desc);

create or replace function public.capture_pos_fiscal_profile_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed_fields text[] := array[]::text[];
  v_event_type text;
  v_actor uuid;
begin
  v_actor := coalesce(new.updated_by, new.created_by);
  if tg_op = 'INSERT' then
    v_event_type := 'created';
    v_changed_fields := array[
      'taxpayer_registered_name','trade_name','taxpayer_tin','tin_branch_code',
      'registered_address','tax_regime','invoice_document_type','invoice_series_prefix',
      'fiscal_status','authorization_reference','authorization_effective_at',
      'authorization_expires_at','authorized_by','authorized_at','software_name',
      'software_version','machine_or_terminal_identifier','additional_authorization_metadata'
    ];
    insert into public.pos_fiscal_profile_audit_events
      (profile_id,tenant_id,branch_id,event_type,previous_status,new_status,changed_fields,actor_user_id)
    values (new.id,new.tenant_id,new.branch_id,v_event_type,null,new.fiscal_status,v_changed_fields,v_actor);
    return new;
  end if;

  if new.tenant_id is distinct from old.tenant_id then v_changed_fields := array_append(v_changed_fields,'tenant_id'); end if;
  if new.branch_id is distinct from old.branch_id then v_changed_fields := array_append(v_changed_fields,'branch_id'); end if;
  if new.taxpayer_registered_name is distinct from old.taxpayer_registered_name then v_changed_fields := array_append(v_changed_fields,'taxpayer_registered_name'); end if;
  if new.trade_name is distinct from old.trade_name then v_changed_fields := array_append(v_changed_fields,'trade_name'); end if;
  if new.taxpayer_tin is distinct from old.taxpayer_tin then v_changed_fields := array_append(v_changed_fields,'taxpayer_tin'); end if;
  if new.tin_branch_code is distinct from old.tin_branch_code then v_changed_fields := array_append(v_changed_fields,'tin_branch_code'); end if;
  if new.registered_address is distinct from old.registered_address then v_changed_fields := array_append(v_changed_fields,'registered_address'); end if;
  if new.tax_regime is distinct from old.tax_regime then v_changed_fields := array_append(v_changed_fields,'tax_regime'); end if;
  if new.invoice_document_type is distinct from old.invoice_document_type then v_changed_fields := array_append(v_changed_fields,'invoice_document_type'); end if;
  if new.invoice_series_prefix is distinct from old.invoice_series_prefix then v_changed_fields := array_append(v_changed_fields,'invoice_series_prefix'); end if;
  if new.fiscal_status is distinct from old.fiscal_status then v_changed_fields := array_append(v_changed_fields,'fiscal_status'); end if;
  if new.authorization_reference is distinct from old.authorization_reference then v_changed_fields := array_append(v_changed_fields,'authorization_reference'); end if;
  if new.authorization_effective_at is distinct from old.authorization_effective_at then v_changed_fields := array_append(v_changed_fields,'authorization_effective_at'); end if;
  if new.authorization_expires_at is distinct from old.authorization_expires_at then v_changed_fields := array_append(v_changed_fields,'authorization_expires_at'); end if;
  if new.authorized_by is distinct from old.authorized_by then v_changed_fields := array_append(v_changed_fields,'authorized_by'); end if;
  if new.authorized_at is distinct from old.authorized_at then v_changed_fields := array_append(v_changed_fields,'authorized_at'); end if;
  if new.software_name is distinct from old.software_name then v_changed_fields := array_append(v_changed_fields,'software_name'); end if;
  if new.software_version is distinct from old.software_version then v_changed_fields := array_append(v_changed_fields,'software_version'); end if;
  if new.machine_or_terminal_identifier is distinct from old.machine_or_terminal_identifier then v_changed_fields := array_append(v_changed_fields,'machine_or_terminal_identifier'); end if;
  if new.additional_authorization_metadata is distinct from old.additional_authorization_metadata then v_changed_fields := array_append(v_changed_fields,'additional_authorization_metadata'); end if;

  if cardinality(v_changed_fields) = 0 then return new; end if;
  v_event_type := case when new.fiscal_status is distinct from old.fiscal_status then 'status_changed' else 'updated' end;
  insert into public.pos_fiscal_profile_audit_events
    (profile_id,tenant_id,branch_id,event_type,previous_status,new_status,changed_fields,actor_user_id)
  values (new.id,new.tenant_id,new.branch_id,v_event_type,old.fiscal_status,new.fiscal_status,v_changed_fields,v_actor);
  return new;
end;
$$;

create or replace function public.prevent_pos_fiscal_profile_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Fiscal profile audit events are append-only';
end;
$$;

drop trigger if exists pos_fiscal_profile_audit_capture on public.pos_fiscal_profiles;
create trigger pos_fiscal_profile_audit_capture
after insert or update on public.pos_fiscal_profiles
for each row execute function public.capture_pos_fiscal_profile_audit_event();

drop trigger if exists pos_fiscal_profile_audit_append_only on public.pos_fiscal_profile_audit_events;
create trigger pos_fiscal_profile_audit_append_only
before update or delete on public.pos_fiscal_profile_audit_events
for each row execute function public.prevent_pos_fiscal_profile_audit_mutation();

drop trigger if exists pos_fiscal_profile_audit_no_truncate on public.pos_fiscal_profile_audit_events;
create trigger pos_fiscal_profile_audit_no_truncate
before truncate on public.pos_fiscal_profile_audit_events
for each statement execute function public.prevent_pos_fiscal_profile_audit_mutation();

alter table public.pos_fiscal_profiles enable row level security;
alter table public.pos_fiscal_profile_audit_events enable row level security;
revoke all on public.pos_fiscal_profiles from public, anon, authenticated;
revoke all on public.pos_fiscal_profile_audit_events from public, anon, authenticated;
grant select, insert, update on public.pos_fiscal_profiles to service_role;
grant select on public.pos_fiscal_profile_audit_events to service_role;
grant usage, select on sequence public.pos_fiscal_profile_audit_events_id_seq to service_role;
revoke all on function public.capture_pos_fiscal_profile_audit_event() from public, anon, authenticated;
revoke all on function public.prevent_pos_fiscal_profile_audit_mutation() from public, anon, authenticated;

comment on table public.pos_fiscal_profiles is 'Tenant/branch-specific taxpayer configuration. Configuration alone does not imply BIR authorization; fiscal issuance remains gated until authorization and applicable requirements are verified.';
comment on table public.pos_fiscal_profile_audit_events is 'Append-only metadata audit trail for taxpayer fiscal configuration; intentionally excludes TIN/address values from event payloads.';
