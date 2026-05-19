-- ============================================================================
-- Disable broken Cloze sync cron
-- ============================================================================
-- The cloze-sync-contacts cron (scheduled in 20260529_cloze_followups.sql)
-- has been firing every 15 minutes against a Cloze API endpoint that returns
-- 404. We pivoted to manual follow-up entry (see 20260530_followups_source_
-- column.sql) and may reintroduce sync later via Zapier, not direct API.
--
-- This migration unschedules the cron. The Edge Function itself remains
-- deployed but inert · safe to leave in place or delete from the dashboard.
-- ============================================================================

do $$
begin
  perform cron.unschedule('cloze-sync-contacts');
exception when others then null;
end$$;
