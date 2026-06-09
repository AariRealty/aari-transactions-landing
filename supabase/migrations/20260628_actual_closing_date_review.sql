-- ============================================================================
-- Aari Transactions · actual closing date + Day 3 review auto-sends (Section 12)
-- ============================================================================
-- 1 · files.actual_closing_date — the TC-logged confirmed closing date from
--     title. Source of truth for the Day 3 / Day 14 auto-send math; the
--     automatic move timestamp (closed_at) is the fallback only.
-- 2 · files.agent_review_sent_at / title_lender_review_sent_at — one-fire dedup
--     stamps so each Day 3 review send lands at most once per file.
-- 3 · Cron · daily at 14:00 UTC (≈9–10am ET). send-agent-review's own Day 3
--     window math + the stamps make every extra invocation a no-op.
-- Reuses public.call_edge_function (20260512). Idempotent.
-- ============================================================================

alter table public.files
  add column if not exists actual_closing_date date,
  add column if not exists agent_review_sent_at timestamptz,
  add column if not exists title_lender_review_sent_at timestamptz;

do $$
begin
  perform cron.unschedule('send_agent_review_daily');
exception when others then null;
end $$;

select cron.schedule(
  'send_agent_review_daily',
  '0 14 * * *',
  $$select public.call_edge_function('send-agent-review', '{}'::jsonb)$$
);
