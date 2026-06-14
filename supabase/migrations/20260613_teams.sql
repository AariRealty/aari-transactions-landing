-- ============================================================================
-- Teams · team-lead visibility into member files (read-only, full financials)
-- A team has a lead (an agent) and members (agents). The lead can VIEW every
-- member's files + tracker. Only the assigned agent, TC, and broker can WRITE.
-- Team membership is BROKER-controlled (agents can't self-claim access).
-- ============================================================================

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lead_agent_id uuid references public.agents(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists public.team_members (
  team_id uuid references public.teams(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (team_id, agent_id)
);

create index if not exists idx_team_members_agent on public.team_members(agent_id);
create index if not exists idx_teams_lead on public.teams(lead_agent_id);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

-- A lead or a member can read their team row.
drop policy if exists teams_read on public.teams;
create policy teams_read on public.teams for select using (
  lead_agent_id = auth.uid()
  or id in (select team_id from public.team_members where agent_id = auth.uid())
);

-- Members readable by the team lead and by the members themselves.
drop policy if exists team_members_read on public.team_members;
create policy team_members_read on public.team_members for select using (
  agent_id = auth.uid()
  or team_id in (select id from public.teams where lead_agent_id = auth.uid())
);

-- A team lead can READ every file belonging to an agent on a team they lead.
-- (Permissive · adds to the existing "agent reads own / TC reads assigned /
-- broker reads all" policies. No write grant here — view only.)
drop policy if exists files_team_lead_read on public.files;
create policy files_team_lead_read on public.files for select using (
  agent_id in (
    select tm.agent_id
    from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where t.lead_agent_id = auth.uid()
  )
);

-- Broker manages teams (create teams, assign leads + members).
drop policy if exists teams_broker_write on public.teams;
create policy teams_broker_write on public.teams for all using (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role = 'broker')
) with check (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role = 'broker')
);

drop policy if exists team_members_broker_write on public.team_members;
create policy team_members_broker_write on public.team_members for all using (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role = 'broker')
) with check (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role = 'broker')
);

-- ---------------------------------------------------------------------------
-- To set up a team (run as broker / in SQL editor), e.g.:
--   insert into public.teams (name, lead_agent_id) values ('Rivera Group', '<lead-agent-uuid>');
--   insert into public.team_members (team_id, agent_id)
--     select id, '<member-agent-uuid>' from public.teams where name = 'Rivera Group';
--   -- include the lead themselves as a member if they carry their own files.
-- ---------------------------------------------------------------------------
