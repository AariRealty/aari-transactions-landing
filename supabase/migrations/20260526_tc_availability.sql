-- ============================================================================
-- Aari Transactions · TC self-service availability
-- ============================================================================
-- Moves the TC availability indicator from the static tcs.json to live
-- columns on the agents table. TCs flip their own status from the cockpit
-- → updates here → intake picker reads live state on every render.
--
-- Columns:
--   availability_status   text  · 'available' | 'busy_until' | 'off_today'
--   availability_until    timestamptz · for busy_until · when they're back
--   availability_message  text  · short human-friendly label shown to agents
-- ============================================================================

alter table public.agents
  add column if not exists availability_status   text default 'available'
    check (availability_status in ('available', 'busy_until', 'off_today')),
  add column if not exists availability_until    timestamptz,
  add column if not exists availability_message  text;

comment on column public.agents.availability_status is
  'TC self-set availability. Drives the green/amber/red indicator on the intake picker.';
comment on column public.agents.availability_until is
  'When busy_until, this is the time the TC will be free. Auto-clears to available after this passes.';
comment on column public.agents.availability_message is
  'Optional override label shown to agents (e.g. "Back at 3 PM"). Falls back to status-based default.';

-- Default all existing TCs to 'available' so the picker keeps working.
update public.agents
set availability_status = 'available'
where role = 'tc' and availability_status is null;
