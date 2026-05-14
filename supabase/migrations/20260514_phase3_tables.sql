-- Aari Transactions · Phase 3 CRM tables
-- payouts        · per-file TC pay (submitted → approved → paid)
-- payroll_runs   · the Friday Disbursement batch records that mark payouts paid
-- email_templates · stage-tagged email starter copy with merge tag support
-- vendors        · title companies, lenders, inspectors, etc.

-- ============================================================================
-- PAYOUTS
-- ============================================================================
create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  tc_id uuid not null references public.agents(id) on delete restrict,
  file_id uuid references public.files(id) on delete set null,
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'rejected')),
  notes text,
  submitted_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references public.agents(id) on delete set null,
  paid_at timestamptz,
  paid_by uuid references public.agents(id) on delete set null,
  payroll_run_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists payouts_tc_id_idx on public.payouts (tc_id);
create index if not exists payouts_status_idx on public.payouts (status);
create index if not exists payouts_submitted_at_idx on public.payouts (submitted_at desc);

alter table public.payouts enable row level security;

drop policy if exists "TCs read their own payouts" on public.payouts;
create policy "TCs read their own payouts"
  on public.payouts for select
  to authenticated
  using (
    tc_id = auth.uid()
    or exists (select 1 from public.agents a where a.id = auth.uid() and a.role = 'broker')
  );

drop policy if exists "TCs insert their own payouts" on public.payouts;
create policy "TCs insert their own payouts"
  on public.payouts for insert
  to authenticated
  with check (
    tc_id = auth.uid()
    and exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc', 'broker'))
  );

drop policy if exists "Broker updates payouts" on public.payouts;
create policy "Broker updates payouts"
  on public.payouts for update
  to authenticated
  using (exists (select 1 from public.agents a where a.id = auth.uid() and a.role = 'broker'));

-- ============================================================================
-- PAYROLL RUNS
-- ============================================================================
create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null default current_date,
  total_cents integer not null default 0 check (total_cents >= 0),
  payout_count integer not null default 0,
  run_by uuid references public.agents(id) on delete set null,
  notes text,
  completed_at timestamptz not null default now()
);

create index if not exists payroll_runs_run_date_idx on public.payroll_runs (run_date desc);

alter table public.payroll_runs enable row level security;

drop policy if exists "Staff read payroll runs" on public.payroll_runs;
create policy "Staff read payroll runs"
  on public.payroll_runs for select
  to authenticated
  using (exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc', 'broker')));

drop policy if exists "Broker writes payroll runs" on public.payroll_runs;
create policy "Broker writes payroll runs"
  on public.payroll_runs for insert
  to authenticated
  with check (exists (select 1 from public.agents a where a.id = auth.uid() and a.role = 'broker'));

-- ============================================================================
-- EMAIL TEMPLATES
-- ============================================================================
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  stage text not null,
  name text not null,
  subject text not null,
  body text not null,
  merge_vars text[] default array[]::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_templates_stage_idx on public.email_templates (stage);

alter table public.email_templates enable row level security;

drop policy if exists "Staff read templates" on public.email_templates;
create policy "Staff read templates"
  on public.email_templates for select
  to authenticated
  using (exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc', 'broker')));

drop policy if exists "Staff write templates" on public.email_templates;
create policy "Staff write templates"
  on public.email_templates for all
  to authenticated
  using (exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc', 'broker')))
  with check (exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc', 'broker')));

-- Seed starter templates (idempotent · only inserts when name not present)
insert into public.email_templates (stage, name, subject, body, merge_vars)
select * from (values
  ('intake', 'Intake confirmation',
    'We have your file · {{file_address}}',
    'Hi {{agent_first_name}},\n\nConfirming we received your file for {{file_address}}. A coordinator will reach out within 24 hours.\n\n{{tc_name}}\nAari Transactions',
    array['agent_first_name','file_address','tc_name']),
  ('active', 'Weekly status update',
    'Status · {{file_address}}',
    'Hi {{agent_first_name}},\n\nQuick midweek update on {{file_address}}. We are tracking for {{closing_date}}. No action needed on your side right now.\n\n{{tc_name}}\nAari Transactions',
    array['agent_first_name','file_address','closing_date','tc_name']),
  ('clear_to_close', 'Clear to close',
    'CTC issued · {{file_address}}',
    'Hi {{agent_first_name}},\n\nGood news. Clear to close on {{file_address}}. Closing scheduled for {{closing_date}}. CD has been circulated.\n\n{{tc_name}}\nAari Transactions',
    array['agent_first_name','file_address','closing_date','tc_name']),
  ('post_close', 'Closing complete',
    'Closed · {{file_address}}',
    'Hi {{agent_first_name}},\n\n{{file_address}} closed today. Audit folder has been delivered to your brokerage drive. Review request goes out to your client shortly.\n\n{{tc_name}}\nAari Transactions',
    array['agent_first_name','file_address','tc_name'])
) as t(stage, name, subject, body, merge_vars)
where not exists (
  select 1 from public.email_templates et where et.name = t.name
);

-- ============================================================================
-- VENDORS
-- ============================================================================
create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('title', 'lender', 'inspector', 'hoa', 'insurance', 'other')),
  contact_name text,
  contact_email text,
  contact_phone text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists vendors_type_idx on public.vendors (type);
create index if not exists vendors_name_idx on public.vendors (lower(name));

alter table public.vendors enable row level security;

drop policy if exists "Staff read vendors" on public.vendors;
create policy "Staff read vendors"
  on public.vendors for select
  to authenticated
  using (exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc', 'broker')));

drop policy if exists "Staff write vendors" on public.vendors;
create policy "Staff write vendors"
  on public.vendors for all
  to authenticated
  using (exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc', 'broker')))
  with check (exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc', 'broker')));
