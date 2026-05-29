-- ============================================================================
-- Aari Transactions · files.logistics jsonb · paste-and-run
-- ============================================================================
-- Adds a single jsonb column to public.files that stores per-file logistics:
-- inspection date/time, inspector contact, closing time/location, walk-through
-- date, CD received date. These fill the remaining {{placeholders}} in copied
-- emails so the TC isn't manually editing bracket strings every time.
--
-- Idempotent.
-- ============================================================================

alter table public.files
  add column if not exists logistics jsonb default '{}'::jsonb;

comment on column public.files.logistics is
  'Per-file operational logistics for email playbook interpolation. Keys: inspection_date, inspection_time, inspector_name, inspector_company, inspector_phone, closing_time, closing_location, walkthrough_date, cd_received_date.';
