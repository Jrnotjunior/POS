-- Fiscal tax policies remain draft-only until a separately reviewed approval workflow exists.
-- The current API only creates drafts; it has no approval or update endpoint.
revoke update on table public.pos_fiscal_tax_policies from service_role;

create or replace function public.enforce_pos_fiscal_tax_policy_draft_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft'
       or new.reviewed_by is not null
       or new.reviewed_at is not null
       or nullif(btrim(new.review_reference), '') is not null then
      raise exception 'Fiscal tax policies must be created as unreviewed drafts';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status
     or new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at
     or new.review_reference is distinct from old.review_reference then
    raise exception 'Fiscal tax policy approval is disabled until a reviewed approval workflow is deployed';
  end if;

  return new;
end;
$$;

drop trigger if exists pos_fiscal_tax_policy_draft_only on public.pos_fiscal_tax_policies;
create trigger pos_fiscal_tax_policy_draft_only
before insert or update on public.pos_fiscal_tax_policies
for each row execute function public.enforce_pos_fiscal_tax_policy_draft_only();
