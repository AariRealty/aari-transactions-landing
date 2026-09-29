-- ============================================================================
-- Aari Transactions · unschedule broker-board-health daily digest
-- ============================================================================
-- Marlenyi Sep 29 · stopping the 7am daily digest. Reasons:
--   1. It sent "nothing needs you today" emails when there was truly nothing
--      to do — those are noise, not signal, and they train her to ignore
--      the inbox item.
--   2. When there WAS stuff wrong (self-tx on broker Billing view, Frederick
--      already-paid showing in Coming-in, 7 covered-listing MLS Setups
--      inflating AR, no Zelle memo on invoice cards), the digest never
--      caught any of it — she caught them herself by looking. A digest
--      that misses the important things is worse than no digest.
--
-- The edge function `broker-board-health` stays deployed, so it can still
-- be invoked ad-hoc via curl / a dry_run for debugging. Only the daily
-- cron is off.
-- ============================================================================

do $$
declare _jid int;
begin
  select jobid into _jid from cron.job where jobname = 'broker-board-health-daily';
  if _jid is not null then perform cron.unschedule(_jid); end if;
end $$;
