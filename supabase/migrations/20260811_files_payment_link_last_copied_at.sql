-- ============================================================================
-- Aari Transactions · When did we last copy the payment link for this file?
-- ============================================================================
-- Marlenyi asked: "make the 'Send payment link' button on the file drawer
-- always generate a tagged URL, and store the last-sent tagged URL on the
-- file so I can see (and re-copy) it later." (Aug 11, 2026)
--
-- The URL itself is deterministic (STRIPE_LINKS[service_type] +
-- ?client_reference_id=<file.id>) so we don't need to store it — recomputing
-- from service_type + id always yields the same string. What we DO need is a
-- timestamp so the drawer can render "Last copied 3 hr ago" next to the Copy
-- button and Marlenyi can chase the client without hunting through email.
--
-- Populated by the [data-copy-paylink] click handler in files.html; drawer
-- reads it in the ctc_payment_link task's customCtl block.
--
-- Additive + idempotent · safe to re-run.
-- ============================================================================

alter table public.files
  add column if not exists payment_link_last_copied_at timestamptz;

comment on column public.files.payment_link_last_copied_at is
  'When the broker/TC last copied this file''s tagged Stripe payment link via the "Copy payment link" button on the drawer. Null = never copied. Used only for the "Last copied X ago" chip; the URL itself is recomputed from service_type + id every time.';
