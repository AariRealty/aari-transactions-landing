-- Marlenyi 2026-08-11 · new status 'triage_needed' for email-import files
-- that landed with no extractable address and no thread/subject match.
-- Kept out of the sweep queue (sweep only touches intake_received /
-- awaiting_tc_acceptance) and out of the standard pipeline · a human
-- decides attach / delete / fill address before it re-enters the flow.
alter table public.files drop constraint if exists files_status_check;
alter table public.files add constraint files_status_check
  check (status = any (array[
    'intake_received', 'awaiting_tc_acceptance', 'tc_engaged',
    'awaiting_broker_review', 'intake_paid', 'awaiting_docs',
    'in_coordination', 'awaiting_signatures', 'pending_closing',
    'cleared_to_close', 'closed', 'archived',
    'triage_needed'
  ]));
