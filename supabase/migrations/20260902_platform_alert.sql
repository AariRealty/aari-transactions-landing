-- Platform-alert plumbing (Sep 2 2026)
-- Applied via Supabase MCP as three migrations:
--   platform_alert_triggers        · AFTER UPDATE trigger on files (reassign,
--                                    unarchive, manual paid, closed edit)
--   platform_alert_mutes_and_actions · mute table + short-lived action tokens +
--                                    address_key() helper
--   platform_alert_action_rpcs     · upsert / approve / is_muted RPCs
-- Bundled here so the file lives in the repo for future re-runs on a fresh DB.

-- ============================================================================
-- 1. AFTER UPDATE trigger on files
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trg_platform_alert_on_files()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  extra jsonb;
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

  IF OLD.paid_at IS NULL AND NEW.paid_at IS NOT NULL
     AND (NEW.stripe_checkout_session_id IS NULL OR NEW.stripe_checkout_session_id = '')
  THEN
    extra := jsonb_build_object(
      'amount_paid', NEW.amount_paid_cents,
      'method', COALESCE(NEW.raw_form_data->>'paid_method', 'manual'));
    PERFORM public.call_edge_function('platform-alert',
      jsonb_build_object('kind','manual_paid_mark','file_id', NEW.id, 'extra', extra));
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

DROP TRIGGER IF EXISTS trg_platform_alert_on_files ON public.files;
CREATE TRIGGER trg_platform_alert_on_files
AFTER UPDATE ON public.files
FOR EACH ROW EXECUTE FUNCTION public.trg_platform_alert_on_files();

-- ============================================================================
-- 2. Mute table + short-lived action tokens
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.platform_alert_mutes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address_key  text NOT NULL,
  kind         text NULL,
  muted_by     uuid NULL,
  muted_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_alert_mutes_addr_kind
  ON public.platform_alert_mutes (address_key, COALESCE(kind, '*'));

CREATE TABLE IF NOT EXISTS public.platform_alert_actions (
  token        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  op           text NOT NULL CHECK (op IN ('mute','approve_coinvoice')),
  params       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '30 days',
  executed_at  timestamptz NULL
);

CREATE OR REPLACE FUNCTION public.address_key(addr text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(split_part(coalesce(addr,''), ',', 1), '\s+', ' ', 'g'))
$$;

ALTER TABLE public.platform_alert_mutes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_alert_actions DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. RPCs called by platform-alert / platform-alert-action
-- ============================================================================
CREATE OR REPLACE FUNCTION public.platform_alert_mutes_upsert(
  p_address_key text,
  p_kind text,
  p_by uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.platform_alert_mutes (address_key, kind, muted_by)
  VALUES (p_address_key, p_kind, p_by)
  ON CONFLICT (address_key, COALESCE(kind, '*'))
  DO UPDATE SET muted_at = now(),
                muted_by = COALESCE(EXCLUDED.muted_by, public.platform_alert_mutes.muted_by);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_alert_mark_coinvoice_approved(
  p_file_ids uuid[],
  p_note text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.files
  SET raw_form_data = COALESCE(raw_form_data, '{}'::jsonb) ||
    jsonb_build_object('co_invoice_approved', true, 'co_invoice_note', p_note)
  WHERE id = ANY(p_file_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_alert_is_muted(
  p_address_key text,
  p_kind text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_alert_mutes
    WHERE address_key = p_address_key
      AND (kind IS NULL OR kind = p_kind)
  );
$$;
