-- ============================================================================
-- Aari Transactions · contract_type + file_deadlines (May 2026)
-- ============================================================================
-- Adds:
-- 1. public.files.contract_type · enum-like text identifying which Florida
--    contract governs deadlines. Values: frbar_asis | frbar_standard |
--    frbar_crsp | nabor | custom. Drives the deadline calculator in
--    /files.html.
-- 2. public.files.deadline_overrides · jsonb · optional per-file overrides
--    for default day counts (e.g., {"inspection_days": 12} when the contract
--    deviates from the standard).
-- 3. public.file_deadlines · tracks which deadlines have been MET (or
--    snoozed / waived) on each file. Computed dates live in JS; this table
--    only records the human-side completion state.
-- Idempotent.
-- ============================================================================

alter table public.files
  add column if not exists contract_type text,
  add column if not exists deadline_overrides jsonb default '{}'::jsonb;

comment on column public.files.contract_type is
  'Florida contract identifier · drives the deadline calculator in /files.html. Values: frbar_asis | frbar_standard | frbar_crsp | nabor | custom.';

comment on column public.files.deadline_overrides is
  'Optional per-file overrides for default day counts (e.g., {"inspection_days":12,"loan_application_days":7}). Keys match the calc engine.';

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
  'Per-file deadline completion tracking. One row per (file, deadline_key). Due dates are computed client-side from contract_type + effective_date + closing_date; this table records only the human side: completed_at, completed_by, notes.';

create index if not exists idx_file_deadlines_file
  on public.file_deadlines (file_id);
create index if not exists idx_file_deadlines_due
  on public.file_deadlines (due_date);

-- RLS · staff (tc, broker) read/write
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
