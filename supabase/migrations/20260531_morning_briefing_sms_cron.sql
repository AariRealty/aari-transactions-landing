-- ============================================================================
-- Aari Transactions · Morning Briefing SMS · pg_cron schedule
-- ============================================================================
-- Fires the send-morning-briefing-sms edge function at 8 AM ET, 7 days a week.
--
-- Strategy: pg_cron runs in UTC, so we fire at BOTH 12 UTC (EDT 8 AM) and
-- 13 UTC (EST 8 AM). The edge function gates internally on the actual ET hour
-- (only proceeds if hour === 8) and on an "already sent today" idempotency
-- check in sms_log. So DST transitions never cause a miss or a double-send.
--
-- Manual test (bypass time gate + idempotency):
--   curl -X POST "https://fnlrgmuvtgwzjsihqxcn.supabase.co/functions/v1/send-morning-briefing-sms?force=1" \
--        -H "Content-Type: application/json"
-- ============================================================================

do $$
begin
  perform cron.unschedule('morning-briefing-sms');
exception when others then null;
end$$;

select cron.schedule(
  'morning-briefing-sms',
  '0 12,13 * * *',   -- 8 AM ET year-round (covers EDT + EST)
  $$
    select net.http_post(
      url := 'https://fnlrgmuvtgwzjsihqxcn.supabase.co/functions/v1/send-morning-briefing-sms',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(current_setting('app.settings.supabase_service_role_key', true), '')
      ),
      body := '{}'::jsonb
    );
  $$
);
