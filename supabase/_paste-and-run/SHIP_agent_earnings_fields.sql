-- ============================================================================
-- agent earnings fields · default commission rate + monthly goal
-- ============================================================================
-- Powers the earnings dashboard on /portal.html. Both fields are optional.
-- Until an agent fills them, the dashboard shows real volumes + a calm
-- "set a default rate to see commission estimates" prompt.
--
-- Cristen-clean: these are forecasting inputs, not commitments. Aari does not
-- pay commissions. Disclaimers live in the UI.
-- Idempotent.
-- ============================================================================

begin;

alter table public.agents
  add column if not exists default_commission_pct numeric(5,3),
  add column if not exists monthly_volume_goal_cents bigint;

-- Range sanity · 0% to 25% commission rate (most agents 2.5-3.5%)
alter table public.agents
  drop constraint if exists agents_default_commission_pct_range;
alter table public.agents
  add constraint agents_default_commission_pct_range
  check (default_commission_pct is null or (default_commission_pct >= 0 and default_commission_pct <= 25));

-- Range sanity · monthly volume goal non-negative
alter table public.agents
  drop constraint if exists agents_monthly_volume_goal_nonneg;
alter table public.agents
  add constraint agents_monthly_volume_goal_nonneg
  check (monthly_volume_goal_cents is null or monthly_volume_goal_cents >= 0);

comment on column public.agents.default_commission_pct is
  'Agent-set default commission rate as a percentage (e.g. 3.0 = 3%). Used by the portal to estimate commissions on closed files. Not authoritative · actual commissions depend on closing and brokerage payout.';

comment on column public.agents.monthly_volume_goal_cents is
  'Agent-set monthly sales volume goal in cents. Powers the goal progress bar on the portal. Personal motivation only · no compliance significance.';

commit;

-- ============================================================================
-- CONFIRMATION
-- ============================================================================
select 'default_commission_pct column' as check_name,
  case when exists (select 1 from information_schema.columns where table_schema='public' and table_name='agents' and column_name='default_commission_pct')
       then 'ok' else 'MISSING' end as status
union all
select 'monthly_volume_goal_cents column',
  case when exists (select 1 from information_schema.columns where table_schema='public' and table_name='agents' and column_name='monthly_volume_goal_cents')
       then 'ok' else 'MISSING' end;
