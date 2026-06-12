-- ============================================================================
-- Aari Transactions · Capture the amount charged per file (June 2026)
-- ============================================================================
-- So the agent's Billing view can show real dollars, the stripe-webhook edge
-- function writes the Stripe checkout amount (session.amount_total, in cents)
-- here when payment confirms. Null = not captured: a file paid before this
-- shipped, or paid by membership credit rather than a Stripe checkout.
--
-- Additive + idempotent · safe to re-run.
-- ============================================================================

alter table public.files
  add column if not exists amount_paid_cents bigint;

comment on column public.files.amount_paid_cents is
  'Actual amount charged for this file via Stripe checkout (session.amount_total, in cents). Null = not captured (pre-feature file or non-checkout/credit payment).';
