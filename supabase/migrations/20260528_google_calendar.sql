-- ============================================================================
-- Aari Transactions · Google Calendar OAuth + token storage
-- ============================================================================
-- Two tables:
--   1. agent_google_calendar · permanent token storage (one row per agent)
--   2. agent_google_oauth_state · transient state for OAuth callback (rows
--      auto-expire after 10 minutes via the cleanup function below)
-- ============================================================================

create table if not exists public.agent_google_calendar (
  agent_id       uuid primary key references public.agents(id) on delete cascade,
  google_email   text,
  access_token   text not null,
  refresh_token  text,
  expires_at     timestamptz not null,
  scope          text,
  connected_at   timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_agc_expires on public.agent_google_calendar(expires_at);

comment on table public.agent_google_calendar is
  'OAuth tokens for agents connected to Google Calendar. Access token auto-refreshed via refresh_token. RLS: agent reads/writes own row; service role full access for the callback function.';

alter table public.agent_google_calendar enable row level security;

drop policy if exists "agc_self_select" on public.agent_google_calendar;
create policy "agc_self_select" on public.agent_google_calendar
  for select to authenticated using (agent_id = auth.uid() or public.is_broker());

drop policy if exists "agc_self_delete" on public.agent_google_calendar;
create policy "agc_self_delete" on public.agent_google_calendar
  for delete to authenticated using (agent_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Transient OAuth state · cleaned up after 10 minutes
-- ----------------------------------------------------------------------------
create table if not exists public.agent_google_oauth_state (
  state_id    uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references public.agents(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index if not exists idx_agos_created on public.agent_google_oauth_state(created_at);

alter table public.agent_google_oauth_state enable row level security;
-- No SELECT/INSERT policies needed · only the service-role-backed edge fns
-- read or write to this table. RLS denies-all by default.

-- Auto-cleanup function · removes states older than 10 minutes
create or replace function public.cleanup_google_oauth_state()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.agent_google_oauth_state where created_at < now() - interval '10 minutes';
$$;

-- Schedule cleanup every 15 minutes via pg_cron (already enabled)
do $$
begin
  perform cron.unschedule('google-oauth-state-cleanup');
exception when others then null;
end$$;

select cron.schedule(
  'google-oauth-state-cleanup',
  '*/15 * * * *',
  $$select public.cleanup_google_oauth_state();$$
);
