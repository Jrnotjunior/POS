-- Persist the single cashier-entered customer field with a POS sale.
-- Customer identity is optional and is only attached when the cashier selected a
-- registered customer returned by the tenant-scoped loyalty lookup.
BEGIN;

ALTER TABLE public.pos_sales
  ADD COLUMN IF NOT EXISTS customer_name_snapshot text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pos_sales_customer_name_snapshot_length'
      AND conrelid = 'public.pos_sales'::regclass
  ) THEN
    ALTER TABLE public.pos_sales
      ADD CONSTRAINT pos_sales_customer_name_snapshot_length
      CHECK (customer_name_snapshot IS NULL OR length(trim(customer_name_snapshot)) BETWEEN 1 AND 120);
  END IF;
END
$$;

COMMENT ON COLUMN public.pos_sales.customer_name_snapshot IS
  'Customer name as entered/selected at the time of sale. Immutable historical snapshot; not proof of a registered customer identity.';

CREATE OR REPLACE FUNCTION public.create_pos_cash_sale_with_customer(
  p_actor_user_id uuid,
  p_branch_id uuid,
  p_idempotency_key uuid,
  p_items jsonb,
  p_cash_tendered_centavos bigint,
  p_customer_user_id uuid,
  p_customer_name text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_tenant_id uuid;
  v_sale jsonb;
  v_sale_id uuid;
  v_resolved_customer_name text;
  v_existing_customer_user_id uuid;
  v_existing_customer_name text;
  v_requested_name text;
BEGIN
  v_requested_name := nullif(trim(coalesce(p_customer_name, '')), '');
  IF v_requested_name IS NOT NULL AND length(v_requested_name) > 120 THEN
    RAISE EXCEPTION 'Customer name is too long.' USING ERRCODE = '22023';
  END IF;

  SELECT b.tenant_id
    INTO v_tenant_id
    FROM public.branches b
   WHERE b.id = p_branch_id
     AND b.is_active;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'This branch is unavailable.' USING ERRCODE = '42501';
  END IF;

  IF p_customer_user_id IS NOT NULL THEN
    SELECT nullif(trim(co.customer_name), '')
      INTO v_resolved_customer_name
      FROM public.customer_orders co
     WHERE co.tenant_id = v_tenant_id
       AND co.branch_id = p_branch_id
       AND co.customer_user_id = p_customer_user_id
     ORDER BY co.created_at DESC
     LIMIT 1;

    IF v_resolved_customer_name IS NULL THEN
      RAISE EXCEPTION 'The selected customer is not registered with this restaurant.' USING ERRCODE = '42501';
    END IF;
  ELSE
    v_resolved_customer_name := v_requested_name;
  END IF;

  -- The existing trusted sale RPC remains authoritative for price calculation,
  -- active-shift enforcement, cashier authorization and idempotent sale creation.
  v_sale := public.create_pos_cash_sale(
    p_actor_user_id,
    p_branch_id,
    p_idempotency_key,
    p_items,
    p_cash_tendered_centavos
  );

  v_sale_id := nullif(v_sale ->> 'sale_id', '')::uuid;
  IF v_sale_id IS NULL THEN
    RAISE EXCEPTION 'The cash sale response did not include a sale identifier.';
  END IF;

  SELECT s.customer_user_id, s.customer_name_snapshot
    INTO v_existing_customer_user_id, v_existing_customer_name
    FROM public.pos_sales s
   WHERE s.id = v_sale_id
     AND s.tenant_id = v_tenant_id
     AND s.branch_id = p_branch_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The saved sale is unavailable.' USING ERRCODE = 'P0002';
  END IF;

  -- Never silently reassign a previously saved sale to another customer.
  IF v_existing_customer_user_id IS NOT NULL
     AND p_customer_user_id IS NOT NULL
     AND v_existing_customer_user_id <> p_customer_user_id THEN
    RAISE EXCEPTION 'The sale already has a different registered customer.' USING ERRCODE = '23505';
  END IF;

  IF v_existing_customer_name IS NOT NULL
     AND v_resolved_customer_name IS NOT NULL
     AND v_existing_customer_name <> v_resolved_customer_name THEN
    RAISE EXCEPTION 'The sale already has a different customer name snapshot.' USING ERRCODE = '23505';
  END IF;

  UPDATE public.pos_sales
     SET customer_user_id = coalesce(v_existing_customer_user_id, p_customer_user_id),
         customer_name_snapshot = coalesce(v_existing_customer_name, v_resolved_customer_name)
   WHERE id = v_sale_id
     AND tenant_id = v_tenant_id
     AND branch_id = p_branch_id;

  RETURN v_sale;
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_pos_cash_sale_with_customer(uuid, uuid, uuid, jsonb, bigint, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_pos_cash_sale_with_customer(uuid, uuid, uuid, jsonb, bigint, uuid, text)
  TO service_role;

COMMIT;
