-- ============================================================================
-- Aari Transactions · TC Notifications · Wire send-tc-new-file into triggers
-- ============================================================================
-- Replaces tg_tc_files_insert + tg_tc_files_update from 20260512_email_automation.sql
-- to ALSO call send-tc-new-file when a TC is assigned (whether at submission
-- time or on update from null → tc_assigned_id).
--
-- send-tc-new-file inserts the in-portal notification row AND sends the
-- TC's email — both halves of Option C in one trigger call.
-- ============================================================================

-- ---- INSERT: fired the moment a file row is created ----
CREATE OR REPLACE FUNCTION public.tg_tc_files_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- Always send the agent's intake confirmation
  PERFORM public.call_edge_function(
    'send-intake-confirmation',
    jsonb_build_object('file_id', NEW.id, 'agent_id', NEW.agent_id)
  );

  -- If the agent already picked a TC at submission, notify the TC immediately
  -- (email + in-portal). If "No Preference," skip — the UPDATE trigger fires
  -- when the broker assigns later.
  IF NEW.tc_assigned_id IS NOT NULL THEN
    PERFORM public.call_edge_function(
      'send-tc-new-file',
      jsonb_build_object('file_id', NEW.id, 'tc_id', NEW.tc_assigned_id)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---- UPDATE: fired on any change to tc_files ----
CREATE OR REPLACE FUNCTION public.tg_tc_files_update()
RETURNS TRIGGER AS $$
BEGIN
  -- TC assignment ping to AGENT (existing — confirms "TC X is on your file")
  IF NEW.tc_assigned_id IS DISTINCT FROM OLD.tc_assigned_id AND NEW.tc_assigned_id IS NOT NULL THEN
    PERFORM public.call_edge_function(
      'send-tc-assignment',
      jsonb_build_object('file_id', NEW.id, 'tc_id', NEW.tc_assigned_id)
    );

    -- Notify the TC themselves — but only on the first assignment.
    -- (Reassignment from one TC to another is intentionally NOT notified by
    -- this function; if you want reassignment alerts, add a separate path
    -- using notification type 'tc_file_reassigned'.)
    IF OLD.tc_assigned_id IS NULL THEN
      PERFORM public.call_edge_function(
        'send-tc-new-file',
        jsonb_build_object('file_id', NEW.id, 'tc_id', NEW.tc_assigned_id)
      );
    END IF;
  END IF;

  -- Status milestone ping (any status change other than 'closed') — existing
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'closed' THEN
    PERFORM public.call_edge_function(
      'send-tc-status-ping',
      jsonb_build_object('file_id', NEW.id, 'new_status', NEW.status, 'previous_status', OLD.status)
    );
  END IF;

  -- Close event — review request scheduled 24h out (handled by cron, not webhook)
  IF NEW.status = 'closed' AND OLD.status <> 'closed' THEN
    NEW.closed_at := COALESCE(NEW.closed_at, now());
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
