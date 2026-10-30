-- Effective-dated tax policy configuration foundation.
-- Rates/classifications are explicitly configured per taxpayer/branch and reviewed
-- before use. This migration does not set statutory defaults or enable invoice issuance.

create table if not exists public.pos_fiscal_tax_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  fiscal_profile_id uuid not null references public.pos_fiscal_profiles(id) on delete restrict,
  policy_name text not null check (length(btrim(policy_name)) between 2 and 120),
  policy_version integer not null check (policy_version > 0),
  status text not null default 'draft' check (status in ('draft','pending_review','approved','retired')),
  effective_from timestamptz,
  effective_until timestamptz,
  currency_code text not null default 'PHP' check (currency_code = 'PHP'),
  rounding_mode text not null default 'nearest_centavo' check (rounding_mode = 'nearest_centavo'),
  rules jsonb not null default '[]'::jsonb check (jsonb_typeof(rules) = 'array'),
  review_reference text,
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_fiscal_tax_policy_branch_tenant_fk foreign key (tenant_id, branch_id)
    references public.branches(tenant_id, id) on delete restrict,
  constraint pos_fiscal_tax_policy_profile_scope_fk foreign key (fiscal_profile_id, tenant_id, branch_id)
    references public.pos_fiscal_profiles(id, tenant_id, branch_id) on delete restrict,
  constraint pos_fiscal_tax_policy_scope_version_unique unique (tenant_id, branch_id, policy_version),
  constraint pos_fiscal_tax_policy_dates check (
    effective_until is null or effective_from is null or effective_until > effective_from
  ),
  constraint pos_fiscal_tax_policy_approval_guard check (
    status <> 'approved'
    or (
      effective_from is not null
      and reviewed_by is not null
      and reviewed_at is not null
      and nullif(btrim(review_reference), '') is not null
      and jsonb_array_length(rules) > 0
    )
  )
);

-- Needed for the composite foreign key from tax policies.
create unique index if not exists pos_fiscal_profiles_id_tenant_branch_unique
  on public.pos_fiscal_profiles (id, tenant_id, branch_id);

create index if not exists pos_fiscal_tax_policies_effective_lookup_idx
  on public.pos_fiscal_tax_policies (tenant_id, branch_id, status, effective_from desc);

create table if not exists public.pos_fiscal_tax_policy_audit_events (
  id bigint generated always as identity primary key,
  policy_id uuid not null references public.pos_fiscal_tax_policies(id) on delete restrict,
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

create index if not exists pos_fiscal_tax_policy_audit_scope_time_idx
  on public.pos_fiscal_tax_policy_audit_events (tenant_id, branch_id, occurred_at desc);

create or replace function public.capture_pos_fiscal_tax_policy_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fields text[] := array[]::text[];
  v_event text;
  v_actor uuid;
begin
  v_actor := coalesce(new.updated_by, new.created_by);
  if tg_op = 'INSERT' then
    v_fields := array['policy_name','policy_version','status','effective_from','effective_until','currency_code','rounding_mode','rules','review_reference','reviewed_by','reviewed_at'];
    v_event := 'created';
    insert into public.pos_fiscal_tax_policy_audit_events
      (policy_id,tenant_id,branch_id,event_type,previous_status,new_status,changed_fields,actor_user_id)
    values (new.id,new.tenant_id,new.branch_id,v_event,null,new.status,v_fields,v_actor);
    return new;
  end if;

  if new.tenant_id is distinct from old.tenant_id then v_fields := array_append(v_fields,'tenant_id'); end if;
  if new.branch_id is distinct from old.branch_id then v_fields := array_append(v_fields,'branch_id'); end if;
  if new.fiscal_profile_id is distinct from old.fiscal_profile_id then v_fields := array_append(v_fields,'fiscal_profile_id'); end if;
  if new.policy_name is distinct from old.policy_name then v_fields := array_append(v_fields,'policy_name'); end if;
  if new.policy_version is distinct from old.policy_version then v_fields := array_append(v_fields,'policy_version'); end if;
  if new.status is distinct from old.status then v_fields := array_append(v_fields,'status'); end if;
  if new.effective_from is distinct from old.effective_from then v_fields := array_append(v_fields,'effective_from'); end if;
  if new.effective_until is distinct from old.effective_until then v_fields := array_append(v_fields,'effective_until'); end if;
  if new.currency_code is distinct from old.currency_code then v_fields := array_append(v_fields,'currency_code'); end if;
  if new.rounding_mode is distinct from old.rounding_mode then v_fields := array_append(v_fields,'rounding_mode'); end if;
  if new.rules is distinct from old.rules then v_fields := array_append(v_fields,'rules'); end if;
  if new.review_reference is distinct from old.review_reference then v_fields := array_append(v_fields,'review_reference'); end if;
  if new.reviewed_by is distinct from old.reviewed_by then v_fields := array_append(v_fields,'reviewed_by'); end if;
  if new.reviewed_at is distinct from old.reviewed_at then v_fields := array_append(v_fields,'reviewed_at'); end if;
  if cardinality(v_fields) = 0 then return new; end if;
  v_event := case when new.status is distinct from old.status then 'status_changed' else 'updated' end;
  insert into public.pos_fiscal_tax_policy_audit_events
    (policy_id,tenant_id,branch_id,event_type,previous_status,new_status,changed_fields,actor_user_id)
  values (new.id,new.tenant_id,new.branch_id,v_event,old.status,new.status,v_fields,v_actor);
  return new;
end;
$$;

create or replace function public.prevent_pos_fiscal_tax_policy_audit_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Fiscal tax policy audit events are append-only';
end;
$$;

drop trigger if exists pos_fiscal_tax_policy_audit_capture on public.pos_fiscal_tax_policies;
create trigger pos_fiscal_tax_policy_audit_capture
after insert or update on public.pos_fiscal_tax_policies
for each row execute function public.capture_pos_fiscal_tax_policy_audit_event();

drop trigger if exists pos_fiscal_tax_policy_audit_append_only on public.pos_fiscal_tax_policy_audit_events;
create trigger pos_fiscal_tax_policy_audit_append_only
before update or delete on public.pos_fiscal_tax_policy_audit_events
for each row execute function public.prevent_pos_fiscal_tax_policy_audit_mutation();

drop trigger if exists pos_fiscal_tax_policy_audit_no_truncate on public.pos_fiscal_tax_policy_audit_events;
create trigger pos_fiscal_tax_policy_audit_no_truncate
before truncate on public.pos_fiscal_tax_policy_audit_events
for each statement execute function public.prevent_pos_fiscal_tax_policy_audit_mutation();

alter table public.pos_fiscal_tax_policies enable row level security;
alter table public.pos_fiscal_tax_policy_audit_events enable row level security;
revoke all on public.pos_fiscal_tax_policies from public, anon, authenticated;
revoke all on public.pos_fiscal_tax_policy_audit_events from public, anon, authenticated;
grant select, insert, update on public.pos_fiscal_tax_policies to service_role;
grant select on public.pos_fiscal_tax_policy_audit_events to service_role;
grant usage, select on sequence public.pos_fiscal_tax_policy_audit_events_id_seq to service_role;
