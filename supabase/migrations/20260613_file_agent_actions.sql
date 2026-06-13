-- ============================================================================
-- Aari Transactions · file_agent_actions (June 2026)
-- ============================================================================
-- The spine for the agent-portal "Action needed" hero (V1 · inverted black).
-- A TC raises a row when something genuinely lands in the AGENT's court mid-
-- transaction (sign an addendum, upload a doc, confirm a detail). The agent
-- portal reads OPEN rows for the agent's own files and flips the calm hero to
-- the black "Action needed" state. Marking it done flips the hero back to calm.
--
-- One row per ask (NOT one per file) so multiple/overlapping asks are tracked
-- and the history is auditable for compliance.
--
-- action_type values:
--   sign     · agent must sign a document the TC drafted
--   upload   · agent must send / upload a document
--   confirm  · agent must confirm a detail (number, date, name)
--   review   · agent must review + approve before the TC sends something
-- status values:
--   open       · live · drives the black hero
--   done       · satisfied · hero returns to calm
--   cancelled  · TC withdrew the ask
-- ============================================================================

create table if not exists public.file_agent_actions (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  action_type text not null default 'review',
  label text not null,
  detail text,
  due_date date,
  status text not null default 'open',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

comment on table public.file_agent_actions is
  'Agent-facing action requests raised by a TC/broker per file. Drives the agent portal "Action needed" hero. action_type: sign | upload | confirm | review. status: open | done | cancelled.';

create index if not exists idx_file_agent_actions_file
  on public.file_agent_actions (file_id);
create index if not exists idx_file_agent_actions_open
  on public.file_agent_actions (file_id, status);

alter table public.file_agent_actions enable row level security;

-- ---- Staff (TC / broker): full read + write ----
drop policy if exists faa_staff_select on public.file_agent_actions;
create policy faa_staff_select on public.file_agent_actions for select to authenticated using (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
);

drop policy if exists faa_staff_insert on public.file_agent_actions;
create policy faa_staff_insert on public.file_agent_actions for insert to authenticated with check (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
);

drop policy if exists faa_staff_update on public.file_agent_actions;
create policy faa_staff_update on public.file_agent_actions for update to authenticated using (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
);

-- ---- Agent: read + resolve actions on their OWN files ----
drop policy if exists faa_agent_select on public.file_agent_actions;
create policy faa_agent_select on public.file_agent_actions for select to authenticated using (
  exists (select 1 from public.files f where f.id = file_agent_actions.file_id and f.agent_id = auth.uid())
);

-- Agent may mark their own file's action done (e.g. a "confirm"), but cannot
-- create new asks. The WITH CHECK keeps the row tied to their own file.
drop policy if exists faa_agent_update on public.file_agent_actions;
create policy faa_agent_update on public.file_agent_actions for update to authenticated using (
  exists (select 1 from public.files f where f.id = file_agent_actions.file_id and f.agent_id = auth.uid())
) with check (
  exists (select 1 from public.files f where f.id = file_agent_actions.file_id and f.agent_id = auth.uid())
);
