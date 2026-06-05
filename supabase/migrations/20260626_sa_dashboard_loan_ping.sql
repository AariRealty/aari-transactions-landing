-- ============================================================================
-- Aari Transactions · SA dashboard freshness + loan-deadline ping (June 2026)
-- ============================================================================
-- 1 · agents.broker_last_seen_at — server-side last-visit stamp for the
--     broker (powers the "New" pill on signed agreements · cross-device,
--     unlike the old localStorage approach).
-- 2 · files.loan_ping_last_sent_at — once-per-day dedup for the loan ping.
-- 3 · files.loan_approval_confirmed — manual off-switch per spec. NOTE: the
--     cockpit's loan widget writes approval to logistics.loan_approval_status;
--     the ping function honors EITHER signal.
-- 4 · Cron · daily 12:00+13:00 UTC (+ :10 retry sweeps) — the function's
--     America/New_York 8am hour gate picks the right run, DST-proof, same
--     pattern as friday-summary. Failed SMS don't stamp, so the :10 sweep
--     retries them (≈10-minute retry per spec).
-- Idempotent.
-- ============================================================================

alter table public.agents add column if not exists broker_last_seen_at timestamptz;
alter table public.files  add column if not exists loan_ping_last_sent_at timestamptz;
alter table public.files  add column if not exists loan_approval_confirmed boolean not null default false;

-- ---- touch_broker_last_seen() · scoped stamp RPC ----
-- agents has NO self-UPDATE policy (deliberate — a blanket one would let an
-- agent edit their own role). This definer function updates exactly one
-- column, for brokers only.
create or replace function public.touch_broker_last_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.agents
     set broker_last_seen_at = now()
   where id = auth.uid() and role = 'broker';
end;
$$;
revoke all on function public.touch_broker_last_seen() from public, anon;
grant execute on function public.touch_broker_last_seen() to authenticated;

do $$ begin perform cron.unschedule('loan_deadline_ping_main');  exception when others then null; end $$;
do $$ begin perform cron.unschedule('loan_deadline_ping_retry'); exception when others then null; end $$;

select cron.schedule(
  'loan_deadline_ping_main',
  '0 12,13 * * *',
  $$select public.call_edge_function('loan-deadline-ping', '{}'::jsonb)$$
);

select cron.schedule(
  'loan_deadline_ping_retry',
  '10 12,13 * * *',
  $$select public.call_edge_function('loan-deadline-ping', '{}'::jsonb)$$
);
