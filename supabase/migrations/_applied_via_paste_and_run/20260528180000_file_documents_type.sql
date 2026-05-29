-- ============================================================================
-- Aari Transactions · file_documents.document_type column (May 2026)
-- ============================================================================
-- Adds a type column so uploads can be categorized (executed_contract,
-- inspection_report, appraisal_report, etc.). Powers the per-file documents
-- checklist in /files.html (✓ collected, ○ pending).
--
-- Idempotent.
-- ============================================================================

alter table public.file_documents
  add column if not exists document_type text;

comment on column public.file_documents.document_type is
  'Categorization key matching the per-stage checklist in /files.html. Examples: executed_contract, inspection_report, appraisal_report, closing_disclosure, hud_settlement, cda.';

create index if not exists idx_file_documents_type
  on public.file_documents (file_id, document_type);
