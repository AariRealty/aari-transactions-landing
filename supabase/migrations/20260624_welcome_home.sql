-- ============================================================================
-- Aari Transactions · Day-14 buyer welcome-home (Email System v2 · Step 15)
-- ============================================================================
-- 1 · files.welcome_home_sent_at — one-send-per-file stamp. A send that fails
--     never stamps, so a later run resends only the failures.
-- 2 · Cron · daily at 13:30 + 14:30 UTC (~9:30am ET year round). The function
--     scans files closed 14 to 21 days ago and the stamp makes every extra
--     scan a no-op, so the second daily run only picks up the morning's
--     failures. The wide 14-to-21-day window is the catch-up safety net.
-- Reuses public.call_edge_function (20260512). Idempotent.
-- ============================================================================

alter table public.files
  add column if not exists welcome_home_sent_at timestamptz;

do $$
begin
  perform cron.unschedule('welcome_home_main');
exception when others then null;
end $$;
do $$
begin
  perform cron.unschedule('welcome_home_retry');
exception when others then null;
end $$;

-- Main daily run.
select cron.schedule(
  'welcome_home_main',
  '30 13 * * *',
  $$select public.call_edge_function('send-welcome-home', '{}'::jsonb)$$
);

-- Retry sweep one hour later · stamped files are skipped, only failed sends
-- go out again.
select cron.schedule(
  'welcome_home_retry',
  '30 14 * * *',
  $$select public.call_edge_function('send-welcome-home', '{}'::jsonb)$$
);
