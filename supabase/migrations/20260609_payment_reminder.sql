-- ============================================================================
-- Aari Transactions · 24h payment reminder (June 2026 · Phase 2 Step 7)
-- ============================================================================
-- Adds the one-reminder-per-file stamp and schedules the payment-reminder
-- edge function hourly via pg_cron (reuses public.call_edge_function from
-- 20260512_email_automation.sql). Idempotent.
-- ============================================================================

alter table public.files
  add column if not exists payment_reminder_sent_at timestamptz;

-- Hourly sweep at :20 · the function itself enforces the 24h cutoff and
-- one-reminder-per-file, so the schedule frequency is just responsiveness.
do $$
begin
  perform cron.unschedule('payment_reminder_hourly');
exception when others then null;
end $$;

select cron.schedule(
  'payment_reminder_hourly',
  '20 * * * *',
  $$select public.call_edge_function('payment-reminder', '{}'::jsonb)$$
);
