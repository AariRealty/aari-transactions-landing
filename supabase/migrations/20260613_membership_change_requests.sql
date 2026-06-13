-- ============================================================================
-- Aari Transactions · membership_change_requests (June 2026)
-- ============================================================================
-- The retention / save-flow spine. When an agent wants to pause, downgrade,
-- upgrade, or cancel, the portal does NOT mutate Stripe directly — it records a
-- request here and notifies the broker, who actions it in Stripe. This keeps a
-- human save touchpoint (the whole point) and avoids the UI ever falsely
-- claiming billing changed.
--
-- request_type:
--   pause_1 | pause_2 | pause_3 · pause for N months
--   downgrade | upgrade        · change tier
--   cancel                     · cancel at period end
-- status: pending | done | declined
-- ============================================================================

create table if not exists public.membership_change_requests (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references auth.users(id) on delete cascade,
  request_type text not null,
  reason text,
  note text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

comment on table public.membership_change_requests is
  'Agent-raised membership changes (pause/downgrade/upgrade/cancel) from the portal save flow. Broker actions them in Stripe. request_type: pause_1|pause_2|pause_3|downgrade|upgrade|cancel. status: pending|done|declined.';

create index if not exists idx_mcr_agent on public.membership_change_requests (agent_id, status);

alter table public.membership_change_requests enable row level security;

-- Agent: create + see their own requests.
drop policy if exists mcr_agent_insert on public.membership_change_requests;
create policy mcr_agent_insert on public.membership_change_requests for insert to authenticated with check (
  agent_id = auth.uid()
);
drop policy if exists mcr_agent_select on public.membership_change_requests;
create policy mcr_agent_select on public.membership_change_requests for select to authenticated using (
  agent_id = auth.uid()
);

-- Staff (TC / broker): read + update (mark done / declined).
drop policy if exists mcr_staff_select on public.membership_change_requests;
create policy mcr_staff_select on public.membership_change_requests for select to authenticated using (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
);
drop policy if exists mcr_staff_update on public.membership_change_requests;
create policy mcr_staff_update on public.membership_change_requests for update to authenticated using (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
);
