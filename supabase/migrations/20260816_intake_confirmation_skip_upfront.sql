-- ============================================================================
-- Aari Transactions · Intake trigger skips upfront-paid services (2026-08-16)
-- ============================================================================
-- Marlenyi: upfront-paid services (MLS Setup, Listing Coordinator, Offer Prep,
-- etc.) now flow through send-checkout-nudge, which handles a two-email
-- cadence (30 min - 4 h nudge + 72 h follow-up) and CCs the broker on each.
-- Sending the generic "We have your file" from send-intake-confirmation on
-- top of that is duplicate noise to the client.
--
-- New behavior: tg_tc_files_insert still fires send-intake-confirmation for
-- pay-at-close services (tc_one_side, tc_both_sides, anything not upfront)
-- but skips it for the upfront list. The send-tc-new-file call remains
-- unchanged and still gated on assigned_tc_id (from the "no preference"
-- fix earlier today).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tg_tc_files_insert()
RETURNS TRIGGER AS $$
DECLARE
  _svc text := lower(coalesce(NEW.service_type::text, ''));
  _upfront boolean := _svc IN (
    'offer_prep_basic', 'offer_prep_complete',
    'listing_docs', 'listing_coordinator', 'mls_setup',
    'file_organization', 'standalone_review'
  );
BEGIN
  -- Send generic intake confirmation ONLY for pay-at-close services.
  IF NOT _upfront THEN
    PERFORM public.call_edge_function(
      'send-intake-confirmation',
      jsonb_build_object('file_id', NEW.id, 'agent_id', NEW.agent_id)
    );
  END IF;

  -- TC notification (email + in-portal) · unchanged; still requires a chosen TC
  -- (see 20260816_auto_assign_tc_respects_none.sql for the "no preference" gate).
  IF NEW.tc_assigned_id IS NOT NULL THEN
    PERFORM public.call_edge_function(
      'send-tc-new-file',
      jsonb_build_object('file_id', NEW.id, 'tc_id', NEW.tc_assigned_id)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
