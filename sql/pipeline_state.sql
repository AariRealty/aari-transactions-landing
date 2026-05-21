-- Aari Transactions · TC Pipeline state · cross-device persistence
-- Stores: checklist state, notes, and stage moves per card per TC.
-- Run this ONCE in your Supabase SQL editor (Database → SQL Editor → New query).
-- After it runs, eileen.html + milennys.html stop using localStorage
-- and store everything in Supabase so state syncs across devices.
--
-- Created: May 2026

-- ============================================================================
-- 1. TABLE
-- ============================================================================
create table if not exists public.pipeline_state (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.agents(id) on delete cascade,
  card_id text not null,
  kind text not null check (kind in ('check', 'notes', 'stage')),
  payload jsonb,
  updated_at timestamptz not null default now(),
  unique (owner_id, card_id, kind)
);

create index if not exists pipeline_state_owner_idx on public.pipeline_state(owner_id);
create index if not exists pipeline_state_card_idx  on public.pipeline_state(card_id);

-- Auto-update updated_at on row change
create or replace function public.pipeline_state_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists pipeline_state_touch on public.pipeline_state;
create trigger pipeline_state_touch
  before update on public.pipeline_state
  for each row execute function public.pipeline_state_touch_updated_at();

-- ============================================================================
-- 2. ROW LEVEL SECURITY
-- ============================================================================
alter table public.pipeline_state enable row level security;

-- TC can read + write their own pipeline state (where owner_id = their own agent.id)
drop policy if exists "TC reads own pipeline state" on public.pipeline_state;
create policy "TC reads own pipeline state" on public.pipeline_state
  for select using (
    exists (select 1 from public.agents where agents.id = auth.uid() and agents.id = pipeline_state.owner_id)
  );

drop policy if exists "TC inserts own pipeline state" on public.pipeline_state;
create policy "TC inserts own pipeline state" on public.pipeline_state
  for insert with check (
    exists (select 1 from public.agents where agents.id = auth.uid() and agents.id = pipeline_state.owner_id)
  );

drop policy if exists "TC updates own pipeline state" on public.pipeline_state;
create policy "TC updates own pipeline state" on public.pipeline_state
  for update using (
    exists (select 1 from public.agents where agents.id = auth.uid() and agents.id = pipeline_state.owner_id)
  );

-- Broker can read + write ANY TC's pipeline state (so Marlenyi can preview + edit any TC's page)
drop policy if exists "Broker reads all pipeline state" on public.pipeline_state;
create policy "Broker reads all pipeline state" on public.pipeline_state
  for select using (
    exists (select 1 from public.agents where agents.id = auth.uid() and agents.role = 'broker')
  );

drop policy if exists "Broker inserts all pipeline state" on public.pipeline_state;
create policy "Broker inserts all pipeline state" on public.pipeline_state
  for insert with check (
    exists (select 1 from public.agents where agents.id = auth.uid() and agents.role = 'broker')
  );

drop policy if exists "Broker updates all pipeline state" on public.pipeline_state;
create policy "Broker updates all pipeline state" on public.pipeline_state
  for update using (
    exists (select 1 from public.agents where agents.id = auth.uid() and agents.role = 'broker')
  );

-- ============================================================================
-- 3. SANITY CHECK
-- ============================================================================
-- After running, this should return the table definition.
-- Run this select to verify:
--   select * from public.pipeline_state limit 1;
-- (returns no rows on first run, but confirms the table exists)
