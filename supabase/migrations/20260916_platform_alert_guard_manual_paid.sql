-- Guard + false-alarm fix for the manual_paid_mark path (Sep 16 2026)
-- Applied via Supabase MCP the same day.
--
-- Two fixes on files.paid_at:
--   1. Guard: only the broker (or the Stripe webhook via service_role) can flip
--      paid_at from NULL to not-NULL. TCs get a clear error message telling
--      them to ask Marlenyi. Aligns with the broker's request that only she
--      confirms money landed.
--   2. Trigger fix: the manual_paid_mark alert was firing for every real Stripe
--      payment because it checked files.stripe_checkout_session_id (which the
--      webhook doesn't populate; that column lives on payments). Now the alert
--      checks the payments table for a real Stripe payment on this file and
--      stays quiet when one exists.

-- --- 1. GUARD -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_manual_paid_mark()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  claims  jsonb;
  jrole   text;
  arole   text;
  aid     uuid;
BEGIN
  IF OLD.paid_at IS DISTINCT FROM NEW.paid_at AND NEW.paid_at IS NOT NULL THEN
    BEGIN
      claims := current_setting('request.jwt.claims', true)::jsonb;
      jrole  := claims ->> 'role';
    EXCEPTION WHEN OTHERS THEN
      claims := NULL; jrole := NULL;
    END;
    IF jrole = 'service_role' THEN RETURN NEW; END IF;

    aid := auth.uid();
    IF aid IS NULL THEN
      RAISE EXCEPTION 'guard_manual_paid_mark: no caller identity; refusing to set paid_at';
    END IF;
    SELECT LOWER(role) INTO arole FROM public.agents WHERE id = aid;
    IF arole IS DISTINCT FROM 'broker' THEN
      RAISE EXCEPTION 'Only the broker can mark a file paid. Ask Marlenyi to confirm the money landed first.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_manual_paid_mark ON public.files;
CREATE TRIGGER trg_guard_manual_paid_mark
BEFORE UPDATE ON public.files
FOR EACH ROW EXECUTE FUNCTION public.guard_manual_paid_mark();

-- --- 2. FIX THE FALSE-ALARM TRIGGER ------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_platform_alert_on_files()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  extra jsonb;
  has_stripe_payment boolean;
BEGIN
  IF NEW.assigned_tc_id IS DISTINCT FROM OLD.assigned_tc_id THEN
    extra := jsonb_build_object('from_tc_id', OLD.assigned_tc_id, 'to_tc_id', NEW.assigned_tc_id);
    PERFORM public.call_edge_function('platform-alert',
      jsonb_build_object('kind','file_reassigned','file_id', NEW.id, 'extra', extra));
  END IF;

  IF OLD.status = 'archived' AND NEW.status IS DISTINCT FROM 'archived' THEN
    PERFORM public.call_edge_function('platform-alert',
      jsonb_build_object('kind','file_unarchived','file_id', NEW.id));
  END IF;

  IF OLD.paid_at IS NULL AND NEW.paid_at IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.payments
      WHERE file_id = NEW.id
        AND (stripe_payment_intent_id IS NOT NULL OR stripe_checkout_session_id IS NOT NULL OR stripe_charge_id IS NOT NULL)
    ) INTO has_stripe_payment;
    IF NOT has_stripe_payment THEN
      extra := jsonb_build_object(
        'amount_paid', NEW.amount_paid_cents,
        'method', COALESCE(NEW.raw_form_data->>'paid_method', 'manual'));
      PERFORM public.call_edge_function('platform-alert',
        jsonb_build_object('kind','manual_paid_mark','file_id', NEW.id, 'extra', extra));
    END IF;
  END IF;

  IF OLD.status = 'closed'
     AND (
       NEW.property_address IS DISTINCT FROM OLD.property_address OR
       NEW.service_type     IS DISTINCT FROM OLD.service_type     OR
       NEW.assigned_tc_id   IS DISTINCT FROM OLD.assigned_tc_id   OR
       NEW.closing_date     IS DISTINCT FROM OLD.closing_date     OR
       NEW.effective_date   IS DISTINCT FROM OLD.effective_date   OR
       NEW.actual_closing_date IS DISTINCT FROM OLD.actual_closing_date OR
       NEW.purchase_price_cents IS DISTINCT FROM OLD.purchase_price_cents OR
       NEW.commission_pct   IS DISTINCT FROM OLD.commission_pct   OR
       NEW.commission_flat_cents IS DISTINCT FROM OLD.commission_flat_cents
     )
  THEN
    extra := jsonb_build_object('fields', ARRAY(
      SELECT unnest(ARRAY[
        CASE WHEN NEW.property_address IS DISTINCT FROM OLD.property_address THEN 'property_address' END,
        CASE WHEN NEW.service_type IS DISTINCT FROM OLD.service_type THEN 'service_type' END,
        CASE WHEN NEW.assigned_tc_id IS DISTINCT FROM OLD.assigned_tc_id THEN 'assigned_tc_id' END,
        CASE WHEN NEW.closing_date IS DISTINCT FROM OLD.closing_date THEN 'closing_date' END,
        CASE WHEN NEW.effective_date IS DISTINCT FROM OLD.effective_date THEN 'effective_date' END,
        CASE WHEN NEW.actual_closing_date IS DISTINCT FROM OLD.actual_closing_date THEN 'actual_closing_date' END,
        CASE WHEN NEW.purchase_price_cents IS DISTINCT FROM OLD.purchase_price_cents THEN 'purchase_price_cents' END,
        CASE WHEN NEW.commission_pct IS DISTINCT FROM OLD.commission_pct THEN 'commission_pct' END,
        CASE WHEN NEW.commission_flat_cents IS DISTINCT FROM OLD.commission_flat_cents THEN 'commission_flat_cents' END
      ]) WHERE unnest IS NOT NULL));
    PERFORM public.call_edge_function('platform-alert',
      jsonb_build_object('kind','closed_file_edit','file_id', NEW.id, 'extra', extra));
  END IF;
  RETURN NEW;
END;
$$;
