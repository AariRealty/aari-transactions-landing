-- ============================================================================
-- Aari Transactions · file_agent_actions · add DIRECTION (June 2026)
-- ============================================================================
-- Makes the table two-way so all three portals connect both directions:
--   direction = 'to_agent' · TC/broker asks the agent (the black "Action needed"
--                            hero) — the original use, stays the default.
--   direction = 'to_tc'    · the AGENT raises a structured request to the TC
--                            (extend a date, addendum, adjust a term, cancel,
--                            other). Lands as a to-do in the TC cockpit; broker
--                            sees it across every agent.
-- One table, one spine, both directions — no free-text; every row is structured.
-- ============================================================================

alter table public.file_agent_actions
  add column if not exists direction text not null default 'to_agent';

comment on column public.file_agent_actions.direction is
  'to_agent = TC/broker → agent ask (Action-needed hero) · to_tc = agent → TC request (cockpit to-do)';

create index if not exists idx_file_agent_actions_dir
  on public.file_agent_actions (file_id, direction, status);

-- Agents may RAISE requests to the TC on their own files (direction must be to_tc).
-- They still cannot create to_agent asks against themselves.
drop policy if exists faa_agent_insert on public.file_agent_actions;
create policy faa_agent_insert on public.file_agent_actions for insert to authenticated with check (
  direction = 'to_tc'
  and exists (select 1 from public.files f where f.id = file_agent_actions.file_id and f.agent_id = auth.uid())
);
