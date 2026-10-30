-- Fiscal profile authorization remains disabled until a separately reviewed
-- authorization workflow is implemented and the applicable official approval is verified.
create or replace function public.enforce_pos_fiscal_profile_draft_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.fiscal_status <> 'draft'
       or nullif(btrim(new.authorization_reference), '') is not null
       or new.authorization_effective_at is not null
       or new.authorization_expires_at is not null
       or new.authorized_by is not null
       or new.authorized_at is not null then
      raise exception 'Fiscal profiles must be created as drafts without authorization claims';
    end if;
    return new;
  end if;

  if new.fiscal_status is distinct from old.fiscal_status
     or new.authorization_reference is distinct from old.authorization_reference
     or new.authorization_effective_at is distinct from old.authorization_effective_at
     or new.authorization_expires_at is distinct from old.authorization_expires_at
     or new.authorized_by is distinct from old.authorized_by
     or new.authorized_at is distinct from old.authorized_at then
    raise exception 'Fiscal authorization changes are disabled until an approved authorization workflow is deployed';
  end if;

  return new;
end;
$$;

drop trigger if exists pos_fiscal_profile_draft_only on public.pos_fiscal_profiles;
create trigger pos_fiscal_profile_draft_only
before insert or update on public.pos_fiscal_profiles
for each row execute function public.enforce_pos_fiscal_profile_draft_only();
