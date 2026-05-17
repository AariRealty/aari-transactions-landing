-- ============================================================================
-- Aari Transactions · Agent default confidential remarks template
-- ============================================================================
-- Stores the agent's preferred Realtor / Confidential Remarks block so the
-- listing intake can auto-load it on future listings. The intake offers
-- three modes:
--   1. Use Aari's standard (boilerplate · response window, contract type,
--      due-diligence disclaimer)
--   2. Write own + (optional) save to this column
--   3. Use saved default · auto-loaded from this column when present
--
-- Column is nullable. Empty / null = the agent hasn't saved one yet, so the
-- saved-default chip stays hidden in the picker.
-- ============================================================================

alter table public.agents
  add column if not exists default_confidential_remarks text;

comment on column public.agents.default_confidential_remarks is
  'Agent''s preferred MLS Confidential Remarks block. Loaded as a picker option in the listing intake. Plain text, max 1500 chars enforced client-side. Null = use Aari standard or write fresh per listing.';
