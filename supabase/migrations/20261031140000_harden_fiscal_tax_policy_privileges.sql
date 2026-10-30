-- Tighten fiscal tax-policy privileges. Audit rows are written by the table-owner trigger only.
revoke all on table public.pos_fiscal_tax_policies from public, anon, authenticated, service_role;
grant select, insert, update on table public.pos_fiscal_tax_policies to service_role;

revoke all on table public.pos_fiscal_tax_policy_audit_events from public, anon, authenticated, service_role;
grant select on table public.pos_fiscal_tax_policy_audit_events to service_role;
revoke all on sequence public.pos_fiscal_tax_policy_audit_events_id_seq from public, anon, authenticated, service_role;
grant usage, select on sequence public.pos_fiscal_tax_policy_audit_events_id_seq to service_role;
