-- Link POS sales to customer identities and loyalty ledger entries.
-- All fields are nullable so existing sales and online-order loyalty history remain unchanged.
ALTER TABLE public.pos_sales
  ADD COLUMN IF NOT EXISTS customer_user_id uuid
  REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public.tenant_customer_loyalty_transactions
  ADD COLUMN IF NOT EXISTS pos_sale_id uuid
  REFERENCES public.pos_sales(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_customer_loyalty_pos_sale_transaction_unique
  ON public.tenant_customer_loyalty_transactions (tenant_id, pos_sale_id, transaction_type)
  WHERE pos_sale_id IS NOT NULL
    AND transaction_type IN ('earned', 'redeemed');

CREATE INDEX IF NOT EXISTS pos_sales_tenant_customer_created_idx
  ON public.pos_sales (tenant_id, customer_user_id, created_at DESC)
  WHERE customer_user_id IS NOT NULL;

COMMENT ON COLUMN public.pos_sales.customer_user_id IS
  'Optional authenticated customer associated with this POS sale; set only by the authorized POS API.';
COMMENT ON COLUMN public.tenant_customer_loyalty_transactions.pos_sale_id IS
  'POS sale linked to this loyalty ledger event; unique per tenant, sale, and earned/redeemed event type.';
