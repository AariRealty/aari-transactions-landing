-- ============================================================================
-- Aari Transactions · Broker impersonation · "View as agent / TC"
-- ============================================================================
-- The broker keeps her own auth session. RLS gets a parallel SELECT policy
-- that lets her read any agent's portal/cockpit data so the frontend can
-- render that user's view without a re-login.
-- ============================================================================

-- ---- Helper: is the current auth user a broker? ----
create or replace function public.is_broker()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.agents
    where id = auth.uid() and role = 'broker'
  );
$$;

grant execute on function public.is_broker() to authenticated;

-- ---- RLS · agents · brokers can SELECT every row ----
-- (Existing self-read policy stays untouched. This ADDS broker-wide read.)
drop policy if exists agents_broker_read_all on public.agents;
create policy agents_broker_read_all on public.agents
  for select using (public.is_broker());

-- ---- RLS · notifications · brokers can SELECT every row ----
drop policy if exists notifications_broker_read_all on public.notifications;
create policy notifications_broker_read_all on public.notifications
  for select using (public.is_broker());

-- ---- RLS · drafts · brokers can SELECT every row (for impersonating an agent) ----
do $$
begin
  if exists (select 1 from pg_class where relname = 'drafts' and relnamespace = 'public'::regnamespace) then
    drop policy if exists drafts_broker_read_all on public.drafts;
    create policy drafts_broker_read_all on public.drafts
      for select using (public.is_broker());
  end if;
end $$;

-- ---- RLS · agreement_signatures · brokers can SELECT every row ----
do $$
begin
  if exists (select 1 from pg_class where relname = 'agreement_signatures' and relnamespace = 'public'::regnamespace) then
    drop policy if exists agreement_signatures_broker_read_all on public.agreement_signatures;
    create policy agreement_signatures_broker_read_all on public.agreement_signatures
      for select using (public.is_broker());
  end if;
end $$;

-- ---- RLS · audit_log · brokers can SELECT every row ----
do $$
begin
  if exists (select 1 from pg_class where relname = 'audit_log' and relnamespace = 'public'::regnamespace) then
    drop policy if exists audit_log_broker_read_all on public.audit_log;
    create policy audit_log_broker_read_all on public.audit_log
      for select using (public.is_broker());
  end if;
end $$;

comment on function public.is_broker() is
  'Returns TRUE when the current auth user has role=''broker'' on the agents table. Used by broker-impersonation read policies so Marlenyi can View As any agent/TC without re-login.';
