-- ============================================================================
-- Aari Transactions · file_email_sends tracking table (May 2026)
-- ============================================================================
-- Tracks every transaction email sent for a given file by stage. Powers the
-- TC playbook UI: ✓ Sent badges, no-double-send guards, audit trail.
--
-- Idempotent.
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
  'TC playbook · every transaction email sent for a file. One row per send. UI uses this to mark templates as already-sent.';

create index if not exists idx_file_email_sends_file
  on public.file_email_sends (file_id);
create index if not exists idx_file_email_sends_template
  on public.file_email_sends (file_id, template_id);

-- RLS · TCs and brokers can read/insert their own sends.
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
