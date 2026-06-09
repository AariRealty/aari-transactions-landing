-- ============================================================================
-- Aari Transactions · 30-day auto-archive (Email System v2 · Step 16)
-- ============================================================================
-- COMPLIANCE-SAFE "purge" = archive, never delete. Moves files closed 30+ days
-- ago from status 'closed' to 'archived' (a value the status check already
-- allows, per 20260522_files_status_check_expand.sql) and stamps archived_at.
-- Records are retained intact per FREC/DBPR. Active cockpit views already
-- exclude 'archived', so this just keeps the working board clean.
--
-- 1 · files.archived_at — when the auto-archive happened (audit trail).
-- 2 · Cron · daily at 09:00 UTC. The function only touches status='closed'
--     past the cutoff, so every extra run is a no-op.
-- Reuses public.call_edge_function (20260512). Idempotent.
-- ============================================================================

alter table public.files
  add column if not exists archived_at timestamptz;

do $$
begin
  perform cron.unschedule('archive_closed_daily');
exception when others then null;
end $$;

select cron.schedule(
  'archive_closed_daily',
  '0 9 * * *',
  $$select public.call_edge_function('archive-closed-files', '{}'::jsonb)$$
);
