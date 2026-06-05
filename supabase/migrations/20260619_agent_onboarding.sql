-- ============================================================================
-- Aari Transactions · Agent portal Item 4 — onboarding flow (June 2026)
-- ============================================================================
-- New preference columns on agents + the one-time onboarding flag.
-- BACKFILL: every agent that exists BEFORE this migration is marked
-- onboarding_complete = true so the new flow only greets agents who register
-- after it ships. Idempotent.
-- ============================================================================

alter table public.agents add column if not exists avg_transactions_per_month text;
alter table public.agents add column if not exists signing_platform text;
alter table public.agents add column if not exists preferred_tc_id uuid references public.agents(id);
alter table public.agents add column if not exists update_method text;
alter table public.agents add column if not exists onboarding_complete boolean not null default false;
alter table public.agents add column if not exists welcome_sent_at timestamptz;

-- Existing agents never see the flow.
update public.agents set onboarding_complete = true where onboarding_complete = false;
