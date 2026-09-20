-- ============================================================================
-- Aari Transactions · fix trg_platform_alert_on_files closed_file_edit branch
-- ============================================================================
-- Sep 20 2026. Applied via Supabase MCP the same day.
--
-- The closed_file_edit branch of trg_platform_alert_on_files built its
-- "changed fields" list as:
--   SELECT unnest(ARRAY[...]) WHERE unnest IS NOT NULL
--
-- Postgres rejects that with "column unnest does not exist" the moment the
-- branch actually fires (unnest is a function, not an implicit column alias
-- in a WHERE clause). Reclassifying a closed file — e.g. changing 844 Bell
-- Blvd from file_organization to mls_setup because Milennys is doing her own
-- MLS input — hit this bug and rolled back the whole UPDATE.
--
-- Fix · drop the CASE-produced NULLs with array_remove(ARRAY[...], NULL),
-- which is the idiomatic Postgres pattern for this exact shape. Everything
-- else in the trigger — reassigned / unarchived / manual_paid_mark / the set
-- of watched columns — is unchanged.
-- ============================================================================

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
    extra := jsonb_build_object('fields', to_jsonb(array_remove(ARRAY[
      CASE WHEN NEW.property_address IS DISTINCT FROM OLD.property_address THEN 'property_address' END,
      CASE WHEN NEW.service_type IS DISTINCT FROM OLD.service_type THEN 'service_type' END,
      CASE WHEN NEW.assigned_tc_id IS DISTINCT FROM OLD.assigned_tc_id THEN 'assigned_tc_id' END,
      CASE WHEN NEW.closing_date IS DISTINCT FROM OLD.closing_date THEN 'closing_date' END,
      CASE WHEN NEW.effective_date IS DISTINCT FROM OLD.effective_date THEN 'effective_date' END,
      CASE WHEN NEW.actual_closing_date IS DISTINCT FROM OLD.actual_closing_date THEN 'actual_closing_date' END,
      CASE WHEN NEW.purchase_price_cents IS DISTINCT FROM OLD.purchase_price_cents THEN 'purchase_price_cents' END,
      CASE WHEN NEW.commission_pct IS DISTINCT FROM OLD.commission_pct THEN 'commission_pct' END,
      CASE WHEN NEW.commission_flat_cents IS DISTINCT FROM OLD.commission_flat_cents THEN 'commission_flat_cents' END
    ], NULL)));
    PERFORM public.call_edge_function('platform-alert',
      jsonb_build_object('kind','closed_file_edit','file_id', NEW.id, 'extra', extra));
  END IF;
  RETURN NEW;
END;
$$;
