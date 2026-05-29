-- ============================================================================
-- Aari Transactions · audit_log table + files.logistics column · paste-and-run
-- ============================================================================
-- Closes two P0 gaps flagged in the final audit:
--   1. audit_log table referenced by files.html (stage drag + override) and
--      files-compliance.html (override stats) but never created via migration.
--   2. files.logistics jsonb column written by the Closing Logistics block
--      but only defined in another paste-and-run file.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

begin;

-- ============================================================================
-- 1 · audit_log · append-only event log for FREC-defensible reconstruction
-- ============================================================================
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_type text not null default 'staff',
  action text not null,
  target_table text,
  target_id uuid,
  details jsonb default '{}'::jsonb
);

comment on table public.audit_log is
  'Append-only event log. Stage drags, deadline overrides, intake failures, audit package generations, etc. FREC-defensible reconstruction across the file lifecycle.';

create index if not exists idx_audit_log_target on public.audit_log (target_table, target_id);
create index if not exists idx_audit_log_action on public.audit_log (action);
create index if not exists idx_audit_log_created on public.audit_log (created_at desc);
create index if not exists idx_audit_log_actor   on public.audit_log (actor_id);

alter table public.audit_log enable row level security;

-- Staff can insert their own actions (the action attributes them via actor_id).
drop policy if exists audit_staff_insert on public.audit_log;
create policy audit_staff_insert on public.audit_log
  for insert to authenticated with check (
    exists (select 1 from public.agents a
            where a.id = auth.uid()
              and a.role in ('tc','broker','agent'))
  );

-- Brokers read everything. TCs read their own action history.
drop policy if exists audit_broker_select on public.audit_log;
create policy audit_broker_select on public.audit_log
  for select to authenticated using (
    exists (select 1 from public.agents a
            where a.id = auth.uid() and a.role = 'broker')
  );

drop policy if exists audit_tc_select on public.audit_log;
create policy audit_tc_select on public.audit_log
  for select to authenticated using (
    actor_id = auth.uid()
  );

-- No update / no delete · append-only.
drop policy if exists audit_no_update on public.audit_log;
create policy audit_no_update on public.audit_log
  for update to authenticated using (false);

drop policy if exists audit_no_delete on public.audit_log;
create policy audit_no_delete on public.audit_log
  for delete to authenticated using (false);

-- ============================================================================
-- 2 · files.logistics jsonb · per-file operational logistics
-- ============================================================================
alter table public.files
  add column if not exists logistics jsonb default '{}'::jsonb;

comment on column public.files.logistics is
  'Per-file operational logistics for email playbook interpolation. Keys: inspection_date, inspection_time, inspector_name, inspector_company, inspector_phone, closing_time, closing_location, walkthrough_date, cd_received_date, hoa_manager_name, hoa_manager_email, hoa_manager_phone, hoa_company.';

commit;

-- ============================================================================
-- CONFIRMATION
-- ============================================================================
select 'audit_log table' as check_name,
  case when exists (select 1 from information_schema.tables
                    where table_schema='public' and table_name='audit_log')
       then 'ok' else 'MISSING' end as status
union all
select 'audit_log RLS · audit_staff_insert',
  case when exists (select 1 from pg_policies
                    where schemaname='public' and tablename='audit_log'
                      and policyname='audit_staff_insert')
       then 'ok' else 'MISSING' end
union all
select 'audit_log RLS · audit_broker_select',
  case when exists (select 1 from pg_policies
                    where schemaname='public' and tablename='audit_log'
                      and policyname='audit_broker_select')
       then 'ok' else 'MISSING' end
union all
select 'files.logistics column',
  case when exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='files'
                      and column_name='logistics')
       then 'ok' else 'MISSING' end
order by check_name;
