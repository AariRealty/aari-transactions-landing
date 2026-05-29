-- ============================================================================
-- Aari Transactions · files.file_type column (May 2026)
-- ============================================================================
-- Adds a file_type column so /files.html can handle listings, leases,
-- buyer-rep agreements as distinct workflows alongside sales (the default).
--
-- Values:
--   sale       · Sale-side (Buyer or Seller) · default · 7-lane kanban
--   listing    · Listing agreement (Seller side) · listing kanban
--   lease      · Residential lease (rental) · lease kanban
--   buyer_rep  · Buyer Broker Agreement only · short checklist
--
-- Idempotent.
-- ============================================================================

alter table public.files
  add column if not exists file_type text default 'sale';

comment on column public.files.file_type is
  'Drives the kanban stages + verification checklist used on /files.html. Values: sale | listing | lease | buyer_rep.';

create index if not exists idx_files_file_type
  on public.files (file_type);

-- Backfill any existing rows that are NULL to 'sale' (the default until now).
update public.files set file_type = 'sale' where file_type is null;
