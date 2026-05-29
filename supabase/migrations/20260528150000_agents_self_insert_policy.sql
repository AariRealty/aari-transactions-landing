-- ============================================================================
-- Aari Transactions · agents self-insert RLS policy + stuck-user backfill
-- ============================================================================
-- WHY: A client tried to sign up and saw "Account exists, but no agent profile
-- found." The auth.users row was created but the agents row was missing —
-- handle_new_agent trigger fired but the insert was blocked by RLS (no
-- INSERT policy for self).
--
-- This migration:
-- 1. Adds an INSERT policy on public.agents so authenticated users can create
--    their own row (id must match auth.uid()). The trigger runs as security
--    definer so it bypasses RLS anyway — but the CLIENT-SIDE auto-recovery
--    fallback (js/auth.js · ensureAgentProfile) needs this policy to work.
-- 2. Backfills any stuck auth.users that have no corresponding agents row.
-- Idempotent.
-- ============================================================================

-- 1. INSERT policy: authenticated users can create their own agent profile.
alter table public.agents enable row level security;

drop policy if exists agents_self_insert on public.agents;
create policy agents_self_insert on public.agents
  for insert
  to authenticated
  with check (id = auth.uid());

-- 2. Backfill any stuck users (auth.users with no agents row).
insert into public.agents (
  id, email, first_name, last_name, phone, role,
  license_number, license_state, license_expires_at,
  brokerage_name, broker_name, broker_email
)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'first_name',
           split_part(u.email, '@', 1),
           'Agent') as first_name,
  coalesce(u.raw_user_meta_data->>'last_name', '-') as last_name,
  coalesce(u.raw_user_meta_data->>'phone', '') as phone,
  'agent' as role,
  'PENDING' as license_number,
  'FL' as license_state,
  '2099-12-31'::date as license_expires_at,
  'Pending' as brokerage_name,
  'Pending' as broker_name,
  u.email as broker_email
from auth.users u
left join public.agents a on a.id = u.id
where a.id is null;
