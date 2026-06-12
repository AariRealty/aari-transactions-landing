-- ============================================================================
-- Aari Transactions · Agent rental defaults (June 2026)
-- ============================================================================
-- Standing rental terms that are the SAME on every one of an agent's listings,
-- so they should be set once on the agent profile and auto-filled into each
-- rental file / ELLA — not re-asked per deal. Mirrors the existing
-- default_confidential_remarks pattern (20260517).
--
-- All nullable · null = the agent hasn't set a default, so the file falls back
-- to a blank field for the TC to fill.
-- ============================================================================

alter table public.agents
  -- Transaction-wide standing terms (same on every file)
  add column if not exists company_transaction_fee   text,   -- brokerage admin/transaction fee · e.g. "$395"
  add column if not exists retained_deposit_pct       text,   -- % of EMD retained on cancellation · blank = 50%
  add column if not exists conditional_termination    text,   -- standing conditional-termination language
  add column if not exists default_compensation       text,   -- standard compensation terms · e.g. "3%" or "per MLS"
  -- Rental-specific standing terms
  add column if not exists rental_cancellation_fee    text,   -- ELLA early-termination fee · e.g. "$250" or "one month"
  add column if not exists rental_fee_basis           text,   -- month | pct | flat
  add column if not exists rental_fee_amount          text,   -- the % or $ when basis is pct/flat
  add column if not exists default_signing_platform   text,   -- DocuSign | Dotloop | Authentisign | Other
  -- Audit stamp when a standing term is promoted FROM a file by a TC/broker:
  -- { <profile_col>: { value, set_by, set_at, from_file } }
  add column if not exists standing_terms_meta        jsonb;

comment on column public.agents.standing_terms_meta      is 'Audit trail for standing terms set from a file by a TC/broker: who, when, which file, per profile column.';
comment on column public.agents.rental_cancellation_fee  is 'Agent standing ELLA cancellation / early-termination fee. Auto-filled into rental files. Null = ask per file.';
comment on column public.agents.rental_fee_basis         is 'Agent standard rental fee basis: month | pct | flat.';
comment on column public.agents.rental_fee_amount        is 'Agent standard rental fee amount (% or $) when basis is pct/flat.';
comment on column public.agents.default_signing_platform is 'Agent default e-sign platform (DocuSign / Dotloop / Authentisign / Other).';
