-- ============================================================================
-- Tier 3 engagement · agent_nps + agent_weekly_digest_log + opt-out
-- ============================================================================
-- Captures NPS responses from agents after file close + logs Sunday digest
-- sends to prevent dupes. Adds opt-out toggle on the agents table.
-- Idempotent.
-- ============================================================================

begin;

-- 1. NPS responses
create table if not exists public.agent_nps (
  id uuid primary key default gen_random_uuid(),
  file_id uuid references public.files(id) on delete set null,
  agent_id uuid references public.agents(id) on delete set null,
  tc_id uuid references public.agents(id) on delete set null,
  score int check (score between 0 and 10),
  comment text,
  may_share_as_testimonial boolean not null default false,
  token text not null unique,
  sent_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.agent_nps is
  'Agent NPS responses after file close. Only use comments as testimonials when may_share_as_testimonial = true.';

create index if not exists idx_agent_nps_agent on public.agent_nps (agent_id);
create index if not exists idx_agent_nps_file on public.agent_nps (file_id);
create index if not exists idx_agent_nps_responded on public.agent_nps (responded_at desc) where responded_at is not null;
create index if not exists idx_agent_nps_token on public.agent_nps (token);

alter table public.agent_nps enable row level security;
-- Broker sees all, TC sees own, agent sees own
drop policy if exists nps_select on public.agent_nps;
create policy nps_select on public.agent_nps for select to authenticated using (
  exists (select 1 from public.agents a where a.id = auth.uid()
    and (a.role = 'broker'
      or (a.role = 'tc' and agent_nps.tc_id = auth.uid())
      or (a.role = 'agent' and agent_nps.agent_id = auth.uid())))
);

-- 2. Weekly digest log · prevents dupes if cron fires twice
create table if not exists public.agent_weekly_digest_log (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.agents(id) on delete cascade,
  digest_week_start date not null,
  email_sent boolean not null default false,
  sent_at timestamptz not null default now(),
  unique (agent_id, digest_week_start)
);

create index if not exists idx_digest_log_week on public.agent_weekly_digest_log (digest_week_start);

-- 3. Opt-out toggle on agents
alter table public.agents
  add column if not exists weekly_digest_opt_in boolean not null default true;

commit;

-- ============================================================================
-- Confirmation
-- ============================================================================
select 'agent_nps table' as check_name,
  case when exists (select 1 from information_schema.tables where table_schema='public' and table_name='agent_nps')
       then 'ok' else 'MISSING' end as status
union all
select 'agent_weekly_digest_log table',
  case when exists (select 1 from information_schema.tables where table_schema='public' and table_name='agent_weekly_digest_log')
       then 'ok' else 'MISSING' end
union all
select 'weekly_digest_opt_in column',
  case when exists (select 1 from information_schema.columns where table_schema='public' and table_name='agents' and column_name='weekly_digest_opt_in')
       then 'ok' else 'MISSING' end;
