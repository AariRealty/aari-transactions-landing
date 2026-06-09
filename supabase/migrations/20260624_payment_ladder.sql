-- ============================================================================
-- Aari Transactions · payment reminder D1/7/14 ladder (Email System v2 · Step 12)
-- ============================================================================
-- Extends the one-shot 24h reminder into an escalating ladder. Adds the rung
-- counter the edge function uses to fire each reminder exactly once:
--   0/null = none · 1 = D1 sent · 2 = D7 sent · 3 = D14 sent + broker escalated
--
-- Back-fills existing reminded files to rung 1 so they do not suddenly receive
-- a "Day 1" reminder again on the next run (they already got their first one
-- via the old payment_reminder_sent_at stamp).
--
-- The hourly cron from 20260609_payment_reminder.sql (payment_reminder_hourly)
-- already calls payment-reminder, so NO new schedule is needed here.
-- ============================================================================

alter table public.files
  add column if not exists payment_reminder_count smallint not null default 0;

-- Files that already got the old single reminder start the ladder at rung 1.
update public.files
   set payment_reminder_count = 1
 where payment_reminder_sent_at is not null
   and payment_reminder_count = 0;
