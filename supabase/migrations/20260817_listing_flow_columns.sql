-- ============================================================================
-- Aari Transactions · Listing flow v2 columns (2026-08-17)
-- ============================================================================
-- Two new nullable columns on `files` to support the redesigned listing flow:
--   mls_names               · comma-separated list of MLSs the client picked
--                             at intake (Miami Realtors®, Beaches MLS, etc).
--                             Read by stripe-webhook to personalize Email B.
--   stripe_checkout_session_id · session id from the Stripe Checkout Session
--                             minted by create-listing-checkout, so we can
--                             correlate back to the intake row if needed
--                             (payments table also stores this).
-- Both are nullable and additive; no existing behavior changes.
-- ============================================================================

alter table public.files
  add column if not exists mls_names text,
  add column if not exists stripe_checkout_session_id text;

comment on column public.files.mls_names is
  'Comma-separated MLSs the client picked at intake for LC / MLS Setup services. Read by stripe-webhook + emails.';
comment on column public.files.stripe_checkout_session_id is
  'Stripe Checkout Session id from create-listing-checkout · lets us join back to intake if needed.';
