-- Authenticated POS API lifecycle operations for cashier shifts.
create or replace function public.open_pos_cashier_shift(
  p_actor_user_id uuid, p_branch_id uuid, p_opening_cash_centavos bigint
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_tenant_id uuid; v_role text; v_shift public.pos_cashier_shifts%rowtype;
begin
  if p_actor_user_id is null or p_branch_id is null or p_opening_cash_centavos is null
    or p_opening_cash_centavos < 0 or p_opening_cash_centavos > 2000000000 then
    raise exception 'Opening cash must be a valid amount.' using errcode='22023';
  end if;
  select b.tenant_id into v_tenant_id from public.branches b where b.id=p_branch_id and b.is_active;
  if v_tenant_id is null then raise exception 'This branch is unavailable.' using errcode='42501'; end if;
  select m.role into v_role from public.tenant_memberships m where m.tenant_id=v_tenant_id
    and m.user_id=p_actor_user_id and m.status='active' and m.role in ('restaurant_owner','cashier');
  if v_role is null then raise exception 'Active cashier or restaurant-owner access is required.' using errcode='42501'; end if;
  if v_role='cashier' and not exists (select 1 from public.branch_memberships bm
    where bm.tenant_id=v_tenant_id and bm.branch_id=p_branch_id and bm.user_id=p_actor_user_id)
  then raise exception 'You are not assigned to this branch.' using errcode='42501'; end if;
  insert into public.pos_cashier_shifts(tenant_id,branch_id,cashier_user_id,opening_cash_centavos)
    values(v_tenant_id,p_branch_id,p_actor_user_id,p_opening_cash_centavos) returning * into v_shift;
  return jsonb_build_object('id',v_shift.id,'tenant_id',v_shift.tenant_id,'branch_id',v_shift.branch_id,
    'cashier_user_id',v_shift.cashier_user_id,'status',v_shift.status,
    'opening_cash_centavos',v_shift.opening_cash_centavos,'opened_at',v_shift.opened_at);
exception when unique_violation then
  raise exception 'You already have an open shift at this branch.' using errcode='23505';
end;
$$;

create or replace function public.get_pos_cashier_shift(p_actor_user_id uuid,p_branch_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_tenant_id uuid; v_role text; v_shift public.pos_cashier_shifts%rowtype; v_cash_sales bigint;
begin
  select b.tenant_id into v_tenant_id from public.branches b where b.id=p_branch_id and b.is_active;
  if v_tenant_id is null then raise exception 'This branch is unavailable.' using errcode='42501'; end if;
  select m.role into v_role from public.tenant_memberships m where m.tenant_id=v_tenant_id
    and m.user_id=p_actor_user_id and m.status='active' and m.role in ('restaurant_owner','cashier');
  if v_role is null then raise exception 'Active cashier or restaurant-owner access is required.' using errcode='42501'; end if;
  if v_role='cashier' and not exists (select 1 from public.branch_memberships bm
    where bm.tenant_id=v_tenant_id and bm.branch_id=p_branch_id and bm.user_id=p_actor_user_id)
  then raise exception 'You are not assigned to this branch.' using errcode='42501'; end if;
  select * into v_shift from public.pos_cashier_shifts s where s.tenant_id=v_tenant_id
    and s.branch_id=p_branch_id and s.cashier_user_id=p_actor_user_id and s.status='open';
  if not found then return jsonb_build_object('active',false); end if;
  select coalesce(sum(s.total_centavos),0)::bigint into v_cash_sales from public.pos_sales s
    where s.cashier_shift_id=v_shift.id and s.payment_method='cash' and s.payment_status='paid';
  return jsonb_build_object('active',true,'id',v_shift.id,'tenant_id',v_shift.tenant_id,
    'branch_id',v_shift.branch_id,'cashier_user_id',v_shift.cashier_user_id,'status',v_shift.status,
    'opening_cash_centavos',v_shift.opening_cash_centavos,'cash_sales_centavos',v_cash_sales,
    'expected_cash_centavos',v_shift.opening_cash_centavos+v_cash_sales,'opened_at',v_shift.opened_at);
end;
$$;

create or replace function public.close_pos_cashier_shift(
  p_actor_user_id uuid,p_branch_id uuid,p_counted_cash_centavos bigint,p_close_note text default null
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_tenant_id uuid; v_role text; v_shift public.pos_cashier_shifts%rowtype; v_cash_sales bigint; v_expected bigint;
begin
  if p_counted_cash_centavos is null or p_counted_cash_centavos < 0 or p_counted_cash_centavos > 2000000000
    then raise exception 'Counted cash must be a valid amount.' using errcode='22023'; end if;
  select b.tenant_id into v_tenant_id from public.branches b where b.id=p_branch_id and b.is_active;
  if v_tenant_id is null then raise exception 'This branch is unavailable.' using errcode='42501'; end if;
  select m.role into v_role from public.tenant_memberships m where m.tenant_id=v_tenant_id
    and m.user_id=p_actor_user_id and m.status='active' and m.role in ('restaurant_owner','cashier');
  if v_role is null then raise exception 'Active cashier or restaurant-owner access is required.' using errcode='42501'; end if;
  if v_role='cashier' and not exists (select 1 from public.branch_memberships bm
    where bm.tenant_id=v_tenant_id and bm.branch_id=p_branch_id and bm.user_id=p_actor_user_id)
  then raise exception 'You are not assigned to this branch.' using errcode='42501'; end if;
  select * into v_shift from public.pos_cashier_shifts s where s.tenant_id=v_tenant_id
    and s.branch_id=p_branch_id and s.cashier_user_id=p_actor_user_id and s.status='open' for update;
  if not found then raise exception 'There is no open shift to close.' using errcode='P0002'; end if;
  select coalesce(sum(s.total_centavos),0)::bigint into v_cash_sales from public.pos_sales s
    where s.cashier_shift_id=v_shift.id and s.payment_method='cash' and s.payment_status='paid';
  v_expected := v_shift.opening_cash_centavos+v_cash_sales;
  update public.pos_cashier_shifts set status='closed',expected_cash_centavos=v_expected,
    counted_cash_centavos=p_counted_cash_centavos,cash_variance_centavos=p_counted_cash_centavos-v_expected,
    closed_at=now(),close_note=nullif(left(coalesce(p_close_note,''),500),''),updated_at=now()
    where id=v_shift.id returning * into v_shift;
  return jsonb_build_object('id',v_shift.id,'status',v_shift.status,
    'opening_cash_centavos',v_shift.opening_cash_centavos,'expected_cash_centavos',v_shift.expected_cash_centavos,
    'counted_cash_centavos',v_shift.counted_cash_centavos,'cash_variance_centavos',v_shift.cash_variance_centavos,
    'opened_at',v_shift.opened_at,'closed_at',v_shift.closed_at,'close_note',v_shift.close_note);
end;
$$;

revoke all on function public.open_pos_cashier_shift(uuid,uuid,bigint) from public, anon, authenticated;
revoke all on function public.get_pos_cashier_shift(uuid,uuid) from public, anon, authenticated;
revoke all on function public.close_pos_cashier_shift(uuid,uuid,bigint,text) from public, anon, authenticated;
grant execute on function public.open_pos_cashier_shift(uuid,uuid,bigint) to service_role;
grant execute on function public.get_pos_cashier_shift(uuid,uuid) to service_role;
grant execute on function public.close_pos_cashier_shift(uuid,uuid,bigint,text) to service_role;
