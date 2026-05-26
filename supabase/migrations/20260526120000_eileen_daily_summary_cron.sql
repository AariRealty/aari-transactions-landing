-- ============================================================================
-- Eileen daily summary · cron schedule
-- ============================================================================
-- Hits the eileen-daily-summary Edge Function on weekdays at 22:00 UTC
-- (= 6pm EDT / 5pm EST). See README for the year-round 6pm Eastern variant.
-- ============================================================================

-- Enable extensions if not already enabled
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Drop any prior schedule with the same name so this migration is idempotent
do $$
begin
  perform cron.unschedule('eileen-daily-summary');
exception when others then null;
end$$;

-- Schedule: weekdays at 22:00 UTC
select cron.schedule(
  'eileen-daily-summary',
  '0 22 * * 1-5',
  $$
  select net.http_post(
    url := 'https://fnlrgmuvtgwzjsihqxcn.supabase.co/functions/v1/eileen-daily-summary',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', concat('Bearer ', coalesce(current_setting('app.settings.supabase_service_role_key', true), ''))
    ),
    body := jsonb_build_object('source', 'pg_cron')
  );
  $$
);

-- To unschedule later:
--   select cron.unschedule('eileen-daily-summary');
--
-- If `app.settings.supabase_service_role_key` is not configured at the database
-- level, the Authorization header will be `Bearer ` (empty). The Edge Function
-- itself uses SUPABASE_SERVICE_ROLE_KEY internally, so the inbound call only
-- needs to authenticate to the function gateway. If your project rejects
-- unauthenticated function calls, replace the `Authorization` header with a
-- hard-coded `Bearer <anon-key>`. See README for the trade-off.
