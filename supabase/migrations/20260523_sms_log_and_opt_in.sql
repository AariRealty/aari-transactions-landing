-- ============================================================================
-- Aari Transactions · SMS audit log + agent opt-in column
-- ============================================================================
-- Adds:
--   1. agents.sms_opt_in · boolean default true · agent can disable in profile
--   2. agents.phone     · already exists in most projects; add if not
--   3. sms_log table    · every outbound SMS (success + failure) is logged
--                         for compliance and debugging
-- ============================================================================

-- 1) Agent SMS opt-in flag · transactional SMS is opt-out by default per TCPA
--    "established business relationship" exemption, but we still log consent.
alter table public.agents
  add column if not exists sms_opt_in boolean not null default true,
  add column if not exists phone      text;

comment on column public.agents.sms_opt_in is
  'Agent opt-in flag for transactional SMS (TC acceptance pings, etc.). Default true · agent disables in profile to opt out.';
comment on column public.agents.phone is
  'Agent mobile number · used as the SMS recipient. E.164 preferred but the Quo helper normalizes 10-digit US.';

-- 2) SMS audit log
create table if not exists public.sms_log (
  id                    uuid primary key default gen_random_uuid(),
  provider              text not null default 'quo',
  to_phone              text not null,
  body                  text not null,
  status                text not null check (status in ('sent', 'failed', 'skipped')),
  provider_message_id   text,
  error                 text,
  metadata              jsonb default '{}'::jsonb,
  created_at            timestamptz not null default now()
);

create index if not exists idx_sms_log_created_at on public.sms_log(created_at desc);
create index if not exists idx_sms_log_to_phone on public.sms_log(to_phone);

comment on table public.sms_log is
  'Outbound SMS audit log · every send attempt (success or failure) recorded for compliance + debugging.';

-- 3) RLS on sms_log · only the broker can read it, only the service role writes
alter table public.sms_log enable row level security;

drop policy if exists "sms_log_broker_select" on public.sms_log;
create policy "sms_log_broker_select"
  on public.sms_log for select
  to authenticated
  using (public.is_broker());
