-- ============================================================================
-- Aari Transactions · memberships · Stripe IDs (June 2026)
-- ============================================================================
-- Self-serve pause/downgrade/cancel needs to know WHICH Stripe subscription to
-- act on. These columns hold that link. They are populated by the Stripe
-- webhook on subscription create/update; existing members must be backfilled
-- once (map Stripe customer → agent and paste the IDs in).
-- ============================================================================

alter table public.memberships
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

create index if not exists idx_memberships_stripe_sub
  on public.memberships (stripe_subscription_id);

comment on column public.memberships.stripe_subscription_id is
  'Stripe subscription id · required for self-serve pause/downgrade/cancel via manage-subscription.';
