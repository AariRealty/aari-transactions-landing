-- Aari Transactions · agents.role for staff access gating
-- Adds a role column to differentiate agents, TCs, and the broker-owner.
-- Used by aari-crm.html (TC/Broker portal) and tc-cockpit.html to gate access.

alter table public.agents
  add column if not exists role text not null default 'agent'
    check (role in ('agent', 'tc', 'broker'));

create index if not exists agents_role_idx on public.agents (role);

-- Backfill: Marlenyi is the broker-owner. Adjust the email if needed.
update public.agents
  set role = 'broker'
  where lower(email) = 'marlenyi@aarirealty.com';

-- ============================================================================
-- Staff access policies for the messages table.
-- Agents already have policies (select/insert their own). Staff (TC/broker)
-- need to read every message + mark them read.
-- ============================================================================

drop policy if exists "Staff can read all messages" on public.messages;
create policy "Staff can read all messages"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.agents a
      where a.id = auth.uid() and a.role in ('tc', 'broker')
    )
  );

drop policy if exists "Staff can update messages" on public.messages;
create policy "Staff can update messages"
  on public.messages for update
  to authenticated
  using (
    exists (
      select 1 from public.agents a
      where a.id = auth.uid() and a.role in ('tc', 'broker')
    )
  );

-- Staff also need to read every agent + file referenced by a message
-- so the inbox can show agent name + property address. Add SELECT policies
-- gated on staff role.

drop policy if exists "Staff can read all agents" on public.agents;
create policy "Staff can read all agents"
  on public.agents for select
  to authenticated
  using (
    -- Agents always see their own row; staff see every agent
    id = auth.uid()
    or exists (
      select 1 from public.agents a2
      where a2.id = auth.uid() and a2.role in ('tc', 'broker')
    )
  );

drop policy if exists "Staff can read all files" on public.files;
create policy "Staff can read all files"
  on public.files for select
  to authenticated
  using (
    agent_id = auth.uid()
    or exists (
      select 1 from public.agents a
      where a.id = auth.uid() and a.role in ('tc', 'broker')
    )
  );
