-- ============================================================================
-- agent_referrals · captures agent-to-agent referrals from the portal
-- ============================================================================
-- Optional: if you skip this, the refer modal in portal.html falls back
-- to a mailto: link to hello@aaritransactions.com / hello@aarirealty.com.
-- Run this and the referrals get logged in Supabase so you can track conversion.
-- Idempotent.
-- ============================================================================

begin;

create table if not exists public.agent_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid references public.agents(id) on delete set null,
  referrer_email text,
  target_entity text not null check (target_entity in ('aari_realty','aari_transactions')),
  referred_name text not null,
  referred_email text,
  referred_phone text,
  note text,
  status text not null default 'new' check (status in ('new','contacted','converted','declined')),
  contacted_at timestamptz,
  converted_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.agent_referrals is
  'Agent-to-agent referrals captured from the portal. Track conversion from referral → signup. NEVER store client referrals here · RESPA territory.';

create index if not exists idx_agent_referrals_target on public.agent_referrals (target_entity, status);
create index if not exists idx_agent_referrals_referrer on public.agent_referrals (referrer_id);
create index if not exists idx_agent_referrals_created on public.agent_referrals (created_at desc);

alter table public.agent_referrals enable row level security;

-- Agents can insert their own referrals · cannot read anyone else's
drop policy if exists agent_referrals_insert on public.agent_referrals;
create policy agent_referrals_insert on public.agent_referrals
  for insert to authenticated with check (referrer_id = auth.uid());

drop policy if exists agent_referrals_select_own on public.agent_referrals;
create policy agent_referrals_select_own on public.agent_referrals
  for select to authenticated using (
    referrer_id = auth.uid()
    or exists (select 1 from public.agents a where a.id = auth.uid() and a.role = 'broker')
  );

-- Broker can update status (mark contacted, converted, declined)
drop policy if exists agent_referrals_update_broker on public.agent_referrals;
create policy agent_referrals_update_broker on public.agent_referrals
  for update to authenticated using (
    exists (select 1 from public.agents a where a.id = auth.uid() and a.role = 'broker')
  );

commit;

-- ============================================================================
-- Confirmation
-- ============================================================================
select 'agent_referrals table' as check_name,
  case when exists (select 1 from information_schema.tables where table_schema='public' and table_name='agent_referrals')
       then 'ok' else 'MISSING' end as status
union all
select 'insert policy',
  case when exists (select 1 from pg_policies where schemaname='public' and tablename='agent_referrals' and policyname='agent_referrals_insert')
       then 'ok' else 'MISSING' end
union all
select 'select policy',
  case when exists (select 1 from pg_policies where schemaname='public' and tablename='agent_referrals' and policyname='agent_referrals_select_own')
       then 'ok' else 'MISSING' end;
