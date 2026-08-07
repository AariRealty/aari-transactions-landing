-- Weekly nudge for the broker listing every coordinator invoice that has been
-- sitting unpaid for more than 7 days. Fires every Friday at 13:00 UTC (9am EDT).
--
-- Marlenyi 2026-08-07 · added after she nearly paid a new $400 invoice from Eileen
-- while $100 A-1044 from July 24-30 was still pending unpaid and unremembered.
-- Companion edge function: supabase/functions/tc-invoice-unpaid-reminder/index.ts.

-- Unschedule any prior version of this job so re-running the migration is safe.
do $$
declare _jid int;
begin
  select jobid into _jid from cron.job where jobname = 'tc-invoice-unpaid-reminder-weekly';
  if _jid is not null then perform cron.unschedule(_jid); end if;
end $$;

select cron.schedule(
  'tc-invoice-unpaid-reminder-weekly',
  '0 13 * * 5',
  $$
    select net.http_post(
      url := 'https://fnlrgmuvtgwzjsihqxcn.supabase.co/functions/v1/tc-invoice-unpaid-reminder',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    );
  $$
);
