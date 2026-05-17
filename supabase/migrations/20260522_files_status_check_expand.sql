-- ============================================================================
-- Aari Transactions · Expand files.status check constraint
-- ============================================================================
-- The TC acceptance workflow (20260520) introduced three new status values
-- (`awaiting_tc_acceptance`, `tc_engaged`, `awaiting_broker_review`) but
-- forgot to update the existing check constraint on files.status. Without
-- this fix, any attempt to flip a file into one of the new statuses fails
-- with sqlstate 23514 ("new row violates check constraint").
--
-- Idempotent · drops the old constraint (if any) and re-adds with the full
-- enumerated value set.
-- ============================================================================

alter table public.files drop constraint if exists files_status_check;

alter table public.files
  add constraint files_status_check check (status in (
    'intake_received',
    'awaiting_tc_acceptance',
    'tc_engaged',
    'awaiting_broker_review',
    'intake_paid',
    'awaiting_docs',
    'in_coordination',
    'awaiting_signatures',
    'pending_closing',
    'cleared_to_close',
    'closed',
    'archived'
  ));

comment on constraint files_status_check on public.files is
  'Enumerated status values for the file lifecycle. Updated 2026-05-22 to add the TC acceptance workflow statuses.';
