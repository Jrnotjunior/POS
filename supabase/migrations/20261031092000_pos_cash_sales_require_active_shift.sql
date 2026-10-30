-- New cash sales must be attached to the cashier's active shift.
-- Idempotent retries return the original sale before checking shift state.
do $migration$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='create_pos_cash_sale'
    and pg_get_function_identity_arguments(p.oid)='p_actor_user_id uuid, p_branch_id uuid, p_idempotency_key uuid, p_items jsonb, p_cash_tendered_centavos bigint';
  if v_def is null then raise exception 'create_pos_cash_sale function not found'; end if;
  if position('v_shift_id uuid' in v_def)=0 then
    v_def := replace(v_def, '  v_sale_id uuid;', '  v_sale_id uuid;
  v_shift_id uuid;');
  end if;
  if position('cashier_shift_id' in v_def)=0 then
    v_def := replace(v_def,
      '  INSERT INTO public.pos_sales(
    tenant_id, branch_id, cashier_user_id, idempotency_key, request_fingerprint,',
      '  SELECT s.id INTO v_shift_id FROM public.pos_cashier_shifts s
  WHERE s.tenant_id = v_tenant_id AND s.branch_id = p_branch_id
    AND s.cashier_user_id = p_actor_user_id AND s.status = ''open''
  FOR UPDATE;
  IF v_shift_id IS NULL THEN
    RAISE EXCEPTION ''Open a cashier shift before recording a sale.'' USING ERRCODE=''P0002'';
  END IF;

  INSERT INTO public.pos_sales(
    tenant_id, branch_id, cashier_user_id, cashier_shift_id, idempotency_key, request_fingerprint,');
    v_def := replace(v_def,
      '  ) VALUES (
    v_tenant_id, p_branch_id, p_actor_user_id, p_idempotency_key, v_fingerprint,',
      '  ) VALUES (
    v_tenant_id, p_branch_id, p_actor_user_id, v_shift_id, p_idempotency_key, v_fingerprint,');
    if position('cashier_shift_id' in v_def)=0 or position('v_shift_id, p_idempotency_key' in v_def)=0 then
      raise exception 'Could not safely patch cash sale function for shift association';
    end if;
    execute v_def;
  end if;
end $migration$;
