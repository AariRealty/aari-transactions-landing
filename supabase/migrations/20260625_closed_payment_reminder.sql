-- ============================================================================
-- Aari Transactions · post-closing TC-fee reminder (Email System v2 · Section 5)
-- ============================================================================
-- 1 · files.payment_reminder_last_sent_at — dedup stamp so each rung window
--     (Day 1, Day 7) fires at most once per file.
-- 2 · Cron · daily at 14:00 UTC (≈9–10am ET). The function's own window math +
--     the stamp make every extra invocation a no-op. Day 14 sends no email —
--     the morning briefing surfaces unpaid TC fees as DO FIRST.
-- Reuses public.call_edge_function (20260512). Idempotent.
-- ============================================================================

alter table public.files
  add column if not exists payment_reminder_last_sent_at timestamptz;

do $$
begin
  perform cron.unschedule('closed_payment_reminder_daily');
exception when others then null;
end $$;

select cron.schedule(
  'closed_payment_reminder_daily',
  '0 14 * * *',
  $$select public.call_edge_function('closed-payment-reminder', '{}'::jsonb)$$
);
