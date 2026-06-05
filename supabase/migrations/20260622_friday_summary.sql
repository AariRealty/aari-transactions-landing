-- ============================================================================
-- Aari Transactions · Item 5 — fully automatic Friday summary (June 2026)
-- ============================================================================
-- 1 · files.friday_summary_sent_at — one-send-per-week stamp. A send that
--     fails never stamps, so the :15 retry sweep resends only failures.
-- 2 · Cron · Fridays 12:00 + 13:00 UTC with :15 sweeps. The function's own
--     America/New_York hour gate accepts exactly the run where it is 8am
--     Eastern (12:00 UTC in summer, 13:00 UTC in winter) — DST-proof. The
--     other run + sweeps no-op via the gate and the stamp.
-- Reuses public.call_edge_function (20260512). Idempotent.
-- ============================================================================

alter table public.files
  add column if not exists friday_summary_sent_at timestamptz;

do $$
begin
  perform cron.unschedule('friday_summary_main');
exception when others then null;
end $$;
do $$
begin
  perform cron.unschedule('friday_summary_retry');
exception when others then null;
end $$;

-- Main runs · Friday 12:00 and 13:00 UTC (covers EDT + EST).
select cron.schedule(
  'friday_summary_main',
  '0 12,13 * * 5',
  $$select public.call_edge_function('friday-summary', '{}'::jsonb)$$
);

-- Retry sweeps 15 minutes later · stamped files are skipped, only failed
-- sends go out again.
select cron.schedule(
  'friday_summary_retry',
  '15 12,13 * * 5',
  $$select public.call_edge_function('friday-summary', '{}'::jsonb)$$
);
