-- ============================================================================
-- Aari Transactions · files.transaction_stage column (May 2026)
-- ============================================================================
-- Adds a transaction_stage column to public.files so the TC Transaction
-- Pipeline kanban (tc-cockpit.html) can persist stage drag-drops.
--
-- Stages (mirror the kanban lanes):
--   new            · awaiting TC assignment
--   under_contract · signed, set up
--   inspection     · scheduled or done
--   remedy         · repair requests / credits
--   appraisal      · ordered or in
--   ctc            · clear to close · CD sent / walkthrough
--   closed         · funded, paid
--
-- Idempotent.
-- ============================================================================

alter table public.files
  add column if not exists transaction_stage text;

comment on column public.files.transaction_stage is
  'TC kanban stage: new | under_contract | inspection | remedy | appraisal | ctc | closed';

-- Backfill: derive stage for existing rows that have no transaction_stage yet.
update public.files
   set transaction_stage = case
     when status in ('closed','archived') then 'closed'
     when status = 'intake_received' and tc_accepted_at is null then 'new'
     when status = 'awaiting_tc_acceptance' then 'new'
     when closing_date is not null and closing_date < current_date then 'ctc'
     when closing_date is not null and closing_date - current_date <= 5 then 'ctc'
     when closing_date is not null and closing_date - current_date <= 14 then 'appraisal'
     when closing_date is not null and closing_date - current_date <= 21 then 'inspection'
     else 'under_contract'
   end
 where transaction_stage is null;

-- Index for fast lane grouping in the TC dashboard.
create index if not exists idx_files_transaction_stage
  on public.files (transaction_stage);
