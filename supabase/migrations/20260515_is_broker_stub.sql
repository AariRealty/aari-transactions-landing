-- ============================================================================
-- Aari Transactions · is_broker() stub
-- ============================================================================
-- Several 20260517 migrations (headshots_bucket, tc_email_templates) reference
-- public.is_broker() inside their RLS policies. That function isn't defined
-- until 20260518_broker_impersonation.sql, so the earlier migrations failed
-- to install their policies — leaving the headshots bucket without write
-- policies and the TC email templates without broker-override access.
--
-- This stub creates is_broker() early so all subsequent migrations install
-- cleanly. 20260518_broker_impersonation.sql will `create or replace` it
-- later with the real implementation — both work because the signature
-- doesn't change.
--
-- Stub returns false safely. Real implementation in 20260518 checks the
-- agents table for role = 'broker'. Once the broker_impersonation migration
-- runs, this stub is silently replaced.
-- ============================================================================

create or replace function public.is_broker()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Stub · always returns false until 20260518_broker_impersonation.sql
  -- replaces this with the real check (agents.role = 'broker').
  select false;
$$;

comment on function public.is_broker() is
  'Returns true if the current auth user is a broker. Stubbed in 20260515 to satisfy forward references; real implementation lives in 20260518_broker_impersonation.sql.';
