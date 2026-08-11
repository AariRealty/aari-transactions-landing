-- ============================================================================
-- Aari Transactions · Actual Stripe charge amount per file (Aug 2026)
-- ============================================================================
-- Re-applies the intent of the never-shipped 20260612_file_amount_paid.sql
-- migration. That file existed but was never applied to production, so
-- amount_paid_cents was referenced by webhook + UI code but silently missing
-- from the schema — every write was dropped and every read came back null.
-- Adding it now so the broker "Recent payments" strip can show the real
-- Stripe charge (not the catalog price) and so files.html's payment badges
-- can display the correct amount.
--
-- Additive + idempotent · safe to re-run.
-- ============================================================================

alter table public.files
  add column if not exists amount_paid_cents bigint;

comment on column public.files.amount_paid_cents is
  'Actual amount charged for this file via Stripe checkout (session.amount_total, in cents). Null = not captured (pre-feature file or non-checkout/credit payment).';
