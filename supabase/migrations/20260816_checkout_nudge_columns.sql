-- ============================================================================
-- Aari Transactions · Checkout-nudge tracking columns (2026-08-16)
-- ============================================================================
-- New send-checkout-nudge edge function drops two Alex-toned emails to a
-- client who submitted an upfront-paid file but hasn't completed checkout:
--   Email 1: 30 min - 4 h after submit, "Almost there... just one step! ✨"
--   Email 2: 72 h later if still unpaid, "Still holding your spot 💫"
--   After that: silence.
-- Broker is CC'd on every send so Marlenyi sees who's dragging.
-- These columns track which reminders have gone out per file.
-- ============================================================================

alter table public.files
  add column if not exists checkout_reminder_1_sent_at timestamptz,
  add column if not exists checkout_reminder_2_sent_at timestamptz;

comment on column public.files.checkout_reminder_1_sent_at is
  'send-checkout-nudge · email 1 sent to client (with broker CC) when file remained unpaid 30 min - 4 h after submit.';
comment on column public.files.checkout_reminder_2_sent_at is
  'send-checkout-nudge · email 2 sent to client (with broker CC) 72 h after email 1 if still unpaid. After this, silence.';
