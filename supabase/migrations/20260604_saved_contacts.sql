-- ============================================================================
-- Aari Transactions · Saved title + lender contacts (May 2026)
-- ============================================================================
-- Each agent gets a list of title companies and lenders they've previously
-- used. Path A's combobox on Steps 6 + 7 surfaces these so the agent can
-- pick from their list instead of re-typing 4 fields every file.
--
-- JSONB array shape per entry:
--   { "company_name":  "...",
--     "contact_name":  "...",
--     "contact_email": "...",
--     "contact_phone": "...",
--     "last_used_at":  "2026-05-20T16:30:00Z" }
--
-- Updated on every file submit via persistSavedContacts() in index.html:
--   · Dedupe by company_name (case-insensitive)
--   · Sort by last_used_at DESC
--   · Cap at 20 entries per list
--
-- Idempotent (add column if not exists) · safe to re-run.
-- ============================================================================

alter table public.agents
  add column if not exists saved_title_contacts  jsonb not null default '[]'::jsonb,
  add column if not exists saved_lender_contacts jsonb not null default '[]'::jsonb;

comment on column public.agents.saved_title_contacts is
  'Array of {company_name, contact_name, contact_email, contact_phone, last_used_at}. Updated on every file submit with dedupe by company_name (case-insensitive).';

comment on column public.agents.saved_lender_contacts is
  'Same shape as saved_title_contacts but for lenders.';
