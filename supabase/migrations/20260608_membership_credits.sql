-- ============================================================================
-- Aari Transactions · Membership credit ledger (June 2026 · Phase 2 Part 3)
-- ============================================================================
-- One row per credit used. The intake counts rows per agent per calendar month
-- against the allowance (Starter 2 · Producer 4) before showing the payment
-- gate. Members are never double-charged for covered services
-- (op_basic, listing_docs, file_org). Idempotent.
-- ============================================================================

create table if not exists public.membership_credit_uses (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references auth.users(id) on delete cascade,
  file_id uuid,
  service_id text not null default '',
  used_at timestamptz not null default now()
);

create index if not exists membership_credit_uses_agent_month
  on public.membership_credit_uses (agent_id, used_at desc);

alter table public.membership_credit_uses enable row level security;

-- Agents see + record their own credit uses; the Aari team sees and can record all
-- (TC submitting on behalf records against the agent's id).
drop policy if exists credit_uses_own_select on public.membership_credit_uses;
create policy credit_uses_own_select on public.membership_credit_uses
  for select to authenticated
  using ( agent_id = auth.uid() or public.is_aari_team() );

drop policy if exists credit_uses_insert on public.membership_credit_uses;
create policy credit_uses_insert on public.membership_credit_uses
  for insert to authenticated
  with check ( agent_id = auth.uid() or public.is_aari_team() );

-- Members must be able to READ their own membership row for the credit check
-- (skip if an equivalent policy already exists).
drop policy if exists memberships_own_select on public.memberships;
create policy memberships_own_select on public.memberships
  for select to authenticated
  using ( user_id = auth.uid() or public.is_aari_team() );
