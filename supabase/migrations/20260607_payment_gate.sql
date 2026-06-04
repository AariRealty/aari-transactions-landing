-- ============================================================================
-- Aari Transactions · Payment gate for upfront services (June 2026)
-- ============================================================================
-- Upfront services (Listing Docs, Listing Coordinator, MLS Setup, Offer Prep
-- Basic/Complete, File Organization) now create files as payment_pending until
-- the stripe-webhook edge function confirms checkout.session.completed.
-- TC services (billed at closing via CDA) are confirmed from the start.
-- Defaults match the TC lane so legacy inserts stay valid; the intake sets
-- both flags explicitly per service. Idempotent.
-- ============================================================================

alter table public.files
  add column if not exists payment_pending boolean not null default false;

alter table public.files
  add column if not exists payment_confirmed boolean not null default true;

-- Backfill: everything that exists today predates the gate · treat as settled.
update public.files
   set payment_pending = false,
       payment_confirmed = true
 where payment_pending is distinct from false
    or payment_confirmed is distinct from true;
