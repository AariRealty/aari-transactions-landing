-- ============================================================================
-- Aari Transactions · allow files.status = 'cancelled'
-- ============================================================================
-- Oct 7 · the UI (files.html) and the "Transaction fell through" button
-- (PR #347) both write files.status = 'cancelled', but the existing check
-- constraint only allowed the lifecycle states + 'archived'. The fell-through
-- button would have silently errored on first use. Add 'cancelled' to the set
-- so the button works and so downstream filters that already treat 'cancelled'
-- as a dead-file signal (fileIsBillable, Coming-in · client fees, invoice-card
-- renderer) actually match real rows.
-- ============================================================================

alter table files drop constraint if exists files_status_check;

alter table files add constraint files_status_check
  check (status = any (array[
    'intake_received'::text,
    'awaiting_tc_acceptance'::text,
    'tc_engaged'::text,
    'awaiting_broker_review'::text,
    'intake_paid'::text,
    'awaiting_docs'::text,
    'in_coordination'::text,
    'awaiting_signatures'::text,
    'pending_closing'::text,
    'cleared_to_close'::text,
    'closed'::text,
    'archived'::text,
    'cancelled'::text,
    'triage_needed'::text
  ]));
