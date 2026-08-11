-- ============================================================================
-- Aari Transactions · When did this file's Stripe payment land? (Aug 2026)
-- ============================================================================
-- amount_paid_cents (added in 20260612) tells us HOW MUCH the client paid,
-- but not WHEN. The broker "Recent payments" strip and the owner-facing
-- payment ping both need a timestamp to sort/filter by, so add paid_at and
-- have the stripe-webhook edge function stamp it on checkout.session.completed.
--
-- Null = no Stripe checkout has ever landed for this file: pre-feature file,
-- TC-lane file that bills at closing via CDA, or a still-unpaid upfront file.
--
-- Additive + idempotent · safe to re-run.
-- ============================================================================

alter table public.files
  add column if not exists paid_at timestamptz;

comment on column public.files.paid_at is
  'When Stripe reported checkout.session.completed for this file (stamped by the stripe-webhook edge function). Null = no Stripe checkout paid this file yet (pre-feature, TC-lane bills-at-closing, or unpaid).';

-- Partial index · we only ever query paid_at IS NOT NULL, ordered DESC.
-- Excludes the null-majority rows so the index stays small.
create index if not exists idx_files_paid_at
  on public.files(paid_at desc)
  where paid_at is not null;
