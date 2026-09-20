-- ============================================================================
-- Aari Transactions · schedule tc-bill-ready-nudge (daily, ex-Thursday)
-- ============================================================================
-- Nudges every TC who has a closed but uninvoiced file waiting on her Invoice
-- tab. Fires at 13:00 UTC (9am ET) every day EXCEPT Thursday, because the
-- Thursday weekly pipeline digest (tc-invoice-reminder) already carries the
-- same submit prompt.
--
-- Marlenyi 2026-09-20 · added after Milennys's 1219 Hibiscus (closed 9/1) sat
-- three weeks uninvoiced because nothing pinged her the day after it closed
-- and the Invoice-tab badge was stale until she tapped the tab herself.
--
-- Companion edge function: supabase/functions/tc-bill-ready-nudge/index.ts.
-- ============================================================================

-- Unschedule any prior version of this job so re-running the migration is safe.
do $$
declare _jid int;
begin
  select jobid into _jid from cron.job where jobname = 'tc-bill-ready-nudge-daily';
  if _jid is not null then perform cron.unschedule(_jid); end if;
end $$;

select cron.schedule(
  'tc-bill-ready-nudge-daily',
  '0 13 * * 0-3,5-6',
  $$
    select net.http_post(
      url := 'https://fnlrgmuvtgwzjsihqxcn.supabase.co/functions/v1/tc-bill-ready-nudge',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    );
  $$
);
