-- Fiscal tax-policy security regression checks.
-- Run against a migrated Supabase database with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/fiscal_tax_policy_security.sql
-- This checks live catalog protections; it does not create or modify business data.

do $$
declare
  v_rls_policies boolean;
  v_rls_audit boolean;
  v_service_update boolean;
  v_public_policy_access boolean;
  v_audit_write_access boolean;
  v_draft_trigger boolean;
  v_audit_capture_trigger boolean;
  v_audit_append_only_trigger boolean;
  v_audit_no_truncate_trigger boolean;
  v_draft_function text;
  v_audit_function text;
begin
  select relrowsecurity into v_rls_policies
  from pg_class where oid = 'public.pos_fiscal_tax_policies'::regclass;
  select relrowsecurity into v_rls_audit
  from pg_class where oid = 'public.pos_fiscal_tax_policy_audit_events'::regclass;

  if not coalesce(v_rls_policies, false) or not coalesce(v_rls_audit, false) then
    raise exception 'RLS must be enabled for fiscal policy and audit tables';
  end if;

  select exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='pos_fiscal_tax_policies'
      and grantee='service_role' and privilege_type='UPDATE'
  ) into v_service_update;
  if v_service_update then
    raise exception 'service_role must not have UPDATE on fiscal tax policies while approval is disabled';
  end if;

  select exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='pos_fiscal_tax_policies'
      and grantee in ('PUBLIC','anon','authenticated')
      and privilege_type in ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
  ) into v_public_policy_access;
  if v_public_policy_access then
    raise exception 'Public/anon/authenticated roles must not have direct fiscal policy table privileges';
  end if;

  select exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='pos_fiscal_tax_policy_audit_events'
      and grantee='service_role'
      and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
  ) into v_audit_write_access;
  if v_audit_write_access then
    raise exception 'service_role must not have direct write privileges on fiscal policy audit events';
  end if;

  select exists (
    select 1 from pg_trigger
    where tgrelid='public.pos_fiscal_tax_policies'::regclass
      and tgname='pos_fiscal_tax_policy_draft_only' and not tgisinternal and tgenabled='O'
  ) into v_draft_trigger;
  select exists (
    select 1 from pg_trigger
    where tgrelid='public.pos_fiscal_tax_policies'::regclass
      and tgname='pos_fiscal_tax_policy_audit_capture' and not tgisinternal and tgenabled='O'
  ) into v_audit_capture_trigger;
  select exists (
    select 1 from pg_trigger
    where tgrelid='public.pos_fiscal_tax_policy_audit_events'::regclass
      and tgname='pos_fiscal_tax_policy_audit_append_only' and not tgisinternal and tgenabled='O'
  ) into v_audit_append_only_trigger;
  select exists (
    select 1 from pg_trigger
    where tgrelid='public.pos_fiscal_tax_policy_audit_events'::regclass
      and tgname='pos_fiscal_tax_policy_audit_no_truncate' and not tgisinternal and tgenabled='O'
  ) into v_audit_no_truncate_trigger;

  if not coalesce(v_draft_trigger, false) then
    raise exception 'Enabled draft-only fiscal policy trigger is missing';
  end if;
  if not coalesce(v_audit_capture_trigger, false) then
    raise exception 'Enabled fiscal policy audit capture trigger is missing';
  end if;
  if not coalesce(v_audit_append_only_trigger, false) or not coalesce(v_audit_no_truncate_trigger, false) then
    raise exception 'Audit append-only update/delete and truncate triggers must be enabled';
  end if;

  select pg_get_functiondef('public.enforce_pos_fiscal_tax_policy_draft_only()'::regprocedure)
    into v_draft_function;
  if position('unreviewed drafts' in v_draft_function)=0
     or position('approval is disabled' in v_draft_function)=0 then
    raise exception 'Draft-only trigger function does not contain the expected insert/update guards';
  end if;

  select pg_get_functiondef('public.prevent_pos_fiscal_tax_policy_audit_mutation()'::regprocedure)
    into v_audit_function;
  if position('append-only' in v_audit_function)=0 then
    raise exception 'Audit mutation guard function is missing the append-only rejection';
  end if;
end;
$$;

select 'Fiscal tax-policy security catalog checks passed' as result;
