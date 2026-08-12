-- ============================================================================
-- Aari Transactions · Kill-switch for the post-close payment reminder cadence
-- ============================================================================
-- Marlenyi wants to arm the reminder ladder herself when she's ready to start
-- emailing agents about their outstanding TC fees. The bugs in
-- closed-payment-reminder are fixed (PR #264) but the deployed edge function
-- must gate on this flag so the daily cron only sends after she flips it on
-- from the /files.html More menu > Payment reminders panel.
--
-- Default FALSE so redeploying the edge function is safe: nothing sends until
-- someone (broker) flips the switch.
--
-- Additive + idempotent · safe to re-run. Column was applied to prod once
-- previously via a superseded branch (Aug 11) and this file re-records the
-- schema change in the tracked migrations folder.
-- ============================================================================

alter table public.org_settings
  add column if not exists payment_reminders_enabled boolean not null default false;

comment on column public.org_settings.payment_reminders_enabled is
  'Kill-switch for the closed-payment-reminder edge function. When false (default), the daily cron returns early without sending any post-close TC-fee reminders. When true, the Day 1 / Day 7 ladder runs. Broker flips it from /files.html More menu > Payment reminders.';
