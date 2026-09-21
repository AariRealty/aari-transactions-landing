-- ============================================================================
-- Aari Transactions · schedule broker-board-health (daily 7am ET)
-- ============================================================================
-- Daily anomaly digest to marlenyi@aarirealty.com listing everything the
-- system caught overnight that a human should look at: claim-pool orphans,
-- triage backlog, cross-TC duplicate addresses, closed uninvoiced > 3 days,
-- self-transactions still on a billable queue, signature-verified-with-no-
-- contract, and manual paid marks in the last 24h.
--
-- Fires at 11:00 UTC = 7am EDT / 6am EST. Companion function is
-- supabase/functions/broker-board-health/index.ts.
-- ============================================================================

do $$
declare _jid int;
begin
  select jobid into _jid from cron.job where jobname = 'broker-board-health-daily';
  if _jid is not null then perform cron.unschedule(_jid); end if;
end $$;

select cron.schedule(
  'broker-board-health-daily',
  '0 11 * * *',
  $$
    select net.http_post(
      url := 'https://fnlrgmuvtgwzjsihqxcn.supabase.co/functions/v1/broker-board-health',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    );
  $$
);
