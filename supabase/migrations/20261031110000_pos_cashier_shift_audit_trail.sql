-- Append-only audit history for cashier shift lifecycle events.
-- Records operational cash totals only; close notes are intentionally excluded.
BEGIN;

CREATE TABLE IF NOT EXISTS public.pos_cashier_shift_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  shift_id uuid NOT NULL REFERENCES public.pos_cashier_shifts(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('shift_opened', 'shift_closed')),
  opening_cash_centavos bigint NOT NULL CHECK (opening_cash_centavos BETWEEN 0 AND 2000000000),
  expected_cash_centavos bigint,
  counted_cash_centavos bigint,
  cash_variance_centavos bigint,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT pos_cashier_shift_audit_branch_fk
    FOREIGN KEY (tenant_id, branch_id)
    REFERENCES public.branches(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT pos_cashier_shift_audit_event_state CHECK (
    (event_type = 'shift_opened'
      AND expected_cash_centavos IS NULL
      AND counted_cash_centavos IS NULL
      AND cash_variance_centavos IS NULL)
    OR
    (event_type = 'shift_closed'
      AND expected_cash_centavos IS NOT NULL
      AND counted_cash_centavos IS NOT NULL
      AND cash_variance_centavos = counted_cash_centavos - expected_cash_centavos)
  ),
  CONSTRAINT pos_cashier_shift_audit_event_unique UNIQUE (shift_id, event_type)
);

CREATE INDEX IF NOT EXISTS pos_cashier_shift_audit_tenant_branch_time_idx
  ON public.pos_cashier_shift_audit_events (tenant_id, branch_id, occurred_at DESC);

ALTER TABLE public.pos_cashier_shift_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pos_cashier_shift_audit_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.pos_cashier_shift_audit_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.pos_cashier_shift_audit_events_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.capture_pos_cashier_shift_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'open' THEN
    INSERT INTO public.pos_cashier_shift_audit_events (
      tenant_id, branch_id, shift_id, actor_user_id, event_type,
      opening_cash_centavos
    ) VALUES (
      NEW.tenant_id, NEW.branch_id, NEW.id, NEW.cashier_user_id, 'shift_opened',
      NEW.opening_cash_centavos
    );
  ELSIF TG_OP = 'UPDATE'
    AND OLD.status = 'open'
    AND NEW.status = 'closed' THEN
    INSERT INTO public.pos_cashier_shift_audit_events (
      tenant_id, branch_id, shift_id, actor_user_id, event_type,
      opening_cash_centavos, expected_cash_centavos, counted_cash_centavos,
      cash_variance_centavos
    ) VALUES (
      NEW.tenant_id, NEW.branch_id, NEW.id, NEW.cashier_user_id, 'shift_closed',
      NEW.opening_cash_centavos, NEW.expected_cash_centavos, NEW.counted_cash_centavos,
      NEW.cash_variance_centavos
    );
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.capture_pos_cashier_shift_audit_event() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.prevent_pos_cashier_shift_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  RAISE EXCEPTION 'Cashier shift audit events are append-only.'
    USING ERRCODE = '55000';
END;
$fn$;

REVOKE ALL ON FUNCTION public.prevent_pos_cashier_shift_audit_mutation() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS pos_cashier_shift_audit_capture ON public.pos_cashier_shifts;
CREATE TRIGGER pos_cashier_shift_audit_capture
AFTER INSERT OR UPDATE OF status ON public.pos_cashier_shifts
FOR EACH ROW
EXECUTE FUNCTION public.capture_pos_cashier_shift_audit_event();

DROP TRIGGER IF EXISTS pos_cashier_shift_audit_append_only ON public.pos_cashier_shift_audit_events;
CREATE TRIGGER pos_cashier_shift_audit_append_only
BEFORE UPDATE OR DELETE ON public.pos_cashier_shift_audit_events
FOR EACH ROW
EXECUTE FUNCTION public.prevent_pos_cashier_shift_audit_mutation();

DROP TRIGGER IF EXISTS pos_cashier_shift_audit_no_truncate ON public.pos_cashier_shift_audit_events;
CREATE TRIGGER pos_cashier_shift_audit_no_truncate
BEFORE TRUNCATE ON public.pos_cashier_shift_audit_events
FOR EACH STATEMENT
EXECUTE FUNCTION public.prevent_pos_cashier_shift_audit_mutation();

COMMENT ON TABLE public.pos_cashier_shift_audit_events IS
  'Append-only lifecycle audit for cashier shifts. Contains cash reconciliation figures only; never stores close notes.';

COMMIT;
