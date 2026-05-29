-- ============================================================================
-- Aari Transactions · /files.html SHIP migration · paste-and-run
-- ============================================================================
-- Single consolidated SQL block that wires up everything the new /files.html
-- page needs. Run this once in the Supabase SQL Editor.
--
-- What it does (in order):
--   1. agents · self-insert RLS policy + backfill stuck signups
--   2. files · transaction_stage column (TC kanban)
--   3. file_email_sends · email tracking table
--   4. files · contract_type + deadline_overrides columns
--      file_deadlines · per-file deadline completion tracking
--   5. file_verifications · per-file contract verification status
--   6. file_deadlines · override fields (extension audit trail)
--   7. files · file_type column (sale | listing | lease | buyer_rep)
--
-- Wrapped in a transaction. If any step fails, the whole thing rolls back.
-- 100% idempotent — safe to re-run.
-- ============================================================================

begin;

-- ============================================================================
-- STEP 1 · agents self-insert RLS + backfill stuck users
-- ============================================================================
alter table public.agents enable row level security;

drop policy if exists agents_self_insert on public.agents;
create policy agents_self_insert on public.agents
  for insert
  to authenticated
  with check (id = auth.uid());

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

-- ============================================================================
-- STEP 2 · files.transaction_stage
-- ============================================================================
alter table public.files
  add column if not exists transaction_stage text;

comment on column public.files.transaction_stage is
  'TC kanban stage: new | under_contract | inspection | remedy | appraisal | ctc | closed (sale) · new | active | pending | closed | cancelled (listing) · new | active | signed | occupied | expired (lease) · signed | active | representing | expired (buyer_rep)';

update public.files
   set transaction_stage = case
     when status in ('closed','archived') then 'closed'
     when status = 'intake_received' and tc_accepted_at is null then 'new'
     when status = 'awaiting_tc_acceptance' then 'new'
     when closing_date is not null and closing_date < current_date then 'ctc'
     when closing_date is not null and closing_date - current_date <= 5 then 'ctc'
     when closing_date is not null and closing_date - current_date <= 14 then 'appraisal'
     when closing_date is not null and closing_date - current_date <= 21 then 'inspection'
     else 'under_contract'
   end
 where transaction_stage is null;

create index if not exists idx_files_transaction_stage
  on public.files (transaction_stage);

-- ============================================================================
-- STEP 3 · file_email_sends table
-- ============================================================================
create table if not exists public.file_email_sends (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  template_id text not null,
  stage text,
  sent_at timestamptz not null default now(),
  sent_by uuid references auth.users(id) on delete set null,
  recipient_email text,
  recipient_role text,
  status text not null default 'succeeded',
  error_message text
);

comment on table public.file_email_sends is
  'TC playbook · every transaction email sent for a file. One row per send.';

create index if not exists idx_file_email_sends_file
  on public.file_email_sends (file_id);
create index if not exists idx_file_email_sends_template
  on public.file_email_sends (file_id, template_id);

alter table public.file_email_sends enable row level security;

drop policy if exists fes_staff_select on public.file_email_sends;
create policy fes_staff_select on public.file_email_sends
  for select to authenticated using (
    exists (select 1 from public.agents a
            where a.id = auth.uid() and a.role in ('tc','broker'))
  );

drop policy if exists fes_staff_insert on public.file_email_sends;
create policy fes_staff_insert on public.file_email_sends
  for insert to authenticated with check (
    exists (select 1 from public.agents a
            where a.id = auth.uid() and a.role in ('tc','broker'))
  );

-- ============================================================================
-- STEP 4 · contract_type + deadline_overrides + file_deadlines
-- ============================================================================
alter table public.files
  add column if not exists contract_type text,
  add column if not exists deadline_overrides jsonb default '{}'::jsonb;

comment on column public.files.contract_type is
  'Florida contract identifier · drives the deadline calculator. Values: frbar_asis | frbar_standard | frbar_crsp | nabor | nab089 | vac_15 | nab088 | cc_6 | ers_21tn | vlla_6 | cl_11 | rlhd_3x | bbe_1 | bbe_2 | custom.';

comment on column public.files.deadline_overrides is
  'Per-file overrides for default day counts (e.g., {"inspection_days":12,"loan_application_days":7}).';

create table if not exists public.file_deadlines (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  deadline_key text not null,
  category text,
  due_date date,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  notes text,
  unique (file_id, deadline_key)
);

comment on table public.file_deadlines is
  'Per-file deadline completion tracking. One row per (file, deadline_key).';

create index if not exists idx_file_deadlines_file
  on public.file_deadlines (file_id);
create index if not exists idx_file_deadlines_due
  on public.file_deadlines (due_date);

alter table public.file_deadlines enable row level security;

drop policy if exists fd_staff_select on public.file_deadlines;
create policy fd_staff_select on public.file_deadlines
  for select to authenticated using (
    exists (select 1 from public.agents a
            where a.id = auth.uid() and a.role in ('tc','broker'))
  );

drop policy if exists fd_staff_upsert on public.file_deadlines;
create policy fd_staff_upsert on public.file_deadlines
  for insert to authenticated with check (
    exists (select 1 from public.agents a
            where a.id = auth.uid() and a.role in ('tc','broker'))
  );

drop policy if exists fd_staff_update on public.file_deadlines;
create policy fd_staff_update on public.file_deadlines
  for update to authenticated using (
    exists (select 1 from public.agents a
            where a.id = auth.uid() and a.role in ('tc','broker'))
  );

drop policy if exists fd_staff_delete on public.file_deadlines;
create policy fd_staff_delete on public.file_deadlines
  for delete to authenticated using (
    exists (select 1 from public.agents a
            where a.id = auth.uid() and a.role in ('tc','broker'))
  );

-- ============================================================================
-- STEP 5 · file_verifications
-- ============================================================================
create table if not exists public.file_verifications (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  verification_key text not null,
  status text not null default 'pending',
  value text,
  notes text,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  unique (file_id, verification_key)
);

comment on table public.file_verifications is
  'TC contract verification status per file. One row per (file_id, verification_key). status: pending | needs_action | confirmed | na.';

create index if not exists idx_file_verifications_file
  on public.file_verifications (file_id);

alter table public.file_verifications enable row level security;

drop policy if exists fv_staff_select on public.file_verifications;
create policy fv_staff_select on public.file_verifications for select to authenticated using (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
);

drop policy if exists fv_staff_upsert on public.file_verifications;
create policy fv_staff_upsert on public.file_verifications for insert to authenticated with check (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
);

drop policy if exists fv_staff_update on public.file_verifications;
create policy fv_staff_update on public.file_verifications for update to authenticated using (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
);

-- ============================================================================
-- STEP 6 · file_deadlines override fields (extension audit trail)
-- ============================================================================
alter table public.file_deadlines
  add column if not exists original_due_date date,
  add column if not exists override_reason text,
  add column if not exists extended_at timestamptz,
  add column if not exists extended_by uuid references auth.users(id) on delete set null;

comment on column public.file_deadlines.original_due_date is
  'The contract auto-computed date. Immutable once set. Powers reset-to-default and audit display.';
comment on column public.file_deadlines.override_reason is
  'Why the date was overridden (addendum, mutual agreement, force majeure, lender delay, etc.).';
comment on column public.file_deadlines.extended_at is
  'Timestamp of the most recent override.';
comment on column public.file_deadlines.extended_by is
  'TC/broker who recorded the most recent override.';

-- ============================================================================
-- STEP 7 · files.file_type (sale | listing | lease | buyer_rep)
-- ============================================================================
alter table public.files
  add column if not exists file_type text default 'sale';

comment on column public.files.file_type is
  'Drives the kanban stages + verification checklist used on /files.html. Values: sale | listing | lease | buyer_rep.';

create index if not exists idx_files_file_type
  on public.files (file_type);

update public.files set file_type = 'sale' where file_type is null;

-- Backfill file_type from service_type for existing rows (so historical files
-- show up in the correct lane after this ships).
update public.files
   set file_type = case
     when service_type in ('lc','listing_docs','mls_setup') then 'listing'
     else 'sale'
   end
 where file_type = 'sale'
   and service_type in ('lc','listing_docs','mls_setup');

commit;

-- ============================================================================
-- CONFIRMATION · run this after the commit to verify everything is in place.
-- ============================================================================
-- Expected: 7 rows, all checks = 'ok'.

select 'agents.RLS' as check_name,
  case when exists (select 1 from pg_policies where schemaname='public' and tablename='agents' and policyname='agents_self_insert')
       then 'ok' else 'MISSING' end as status
union all
select 'files.transaction_stage',
  case when exists (select 1 from information_schema.columns where table_schema='public' and table_name='files' and column_name='transaction_stage')
       then 'ok' else 'MISSING' end
union all
select 'file_email_sends',
  case when exists (select 1 from information_schema.tables where table_schema='public' and table_name='file_email_sends')
       then 'ok' else 'MISSING' end
union all
select 'file_deadlines',
  case when exists (select 1 from information_schema.tables where table_schema='public' and table_name='file_deadlines')
       then 'ok' else 'MISSING' end
union all
select 'file_verifications',
  case when exists (select 1 from information_schema.tables where table_schema='public' and table_name='file_verifications')
       then 'ok' else 'MISSING' end
union all
select 'file_deadlines.override_reason',
  case when exists (select 1 from information_schema.columns where table_schema='public' and table_name='file_deadlines' and column_name='override_reason')
       then 'ok' else 'MISSING' end
union all
select 'files.file_type',
  case when exists (select 1 from information_schema.columns where table_schema='public' and table_name='files' and column_name='file_type')
       then 'ok' else 'MISSING' end
order by check_name;
