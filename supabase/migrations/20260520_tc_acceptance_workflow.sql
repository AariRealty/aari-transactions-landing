-- ============================================================================
-- Aari Transactions · TC Acceptance Workflow
-- ============================================================================
-- Implements the post-submit acceptance window:
--   1. Files gain two columns: tc_accepted_at, tc_expected_start_at
--   2. New status values: awaiting_tc_acceptance, tc_engaged, awaiting_broker_review
--   3. file_tc_history table logs every assignment, decline, timeout,
--      agent-reassign, acceptance, and broker-escalation. Chain of custody.
--   4. RLS so agents see their own file's history; TCs see history for their
--      assigned files; brokers see everything.
--
-- Policy specs locked in MEMORY.md → project_tc_acceptance_sla.md
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) New columns on files
-- ----------------------------------------------------------------------------
alter table public.files
  add column if not exists tc_accepted_at        timestamptz,
  add column if not exists tc_expected_start_at  timestamptz,
  add column if not exists tc_reassign_count     integer not null default 0;

comment on column public.files.tc_accepted_at is
  'Timestamp the TC clicked Accept · null until acceptance.';
comment on column public.files.tc_expected_start_at is
  'Start time the TC committed to when accepting. Drives the agent UI "starts at" copy.';
comment on column public.files.tc_reassign_count is
  'Number of times the agent has clicked Request Another TC. Capped at 3.';

-- ----------------------------------------------------------------------------
-- 2) file_tc_history · chain-of-custody audit table
-- ----------------------------------------------------------------------------
create table if not exists public.file_tc_history (
  id              uuid primary key default gen_random_uuid(),
  file_id         uuid not null references public.files(id) on delete cascade,
  tc_id           uuid references public.agents(id),
  event_type      text not null check (event_type in (
                    'assigned',
                    'accepted',
                    'declined',
                    'timeout',
                    'agent_reassigned',
                    'broker_escalated'
                  )),
  event_at        timestamptz not null default now(),
  expected_start_at timestamptz,   -- only set on 'accepted'
  decline_reason  text,            -- only set on 'declined'
  metadata        jsonb default '{}'::jsonb,
  created_by      uuid references auth.users(id)
);

create index if not exists idx_file_tc_history_file
  on public.file_tc_history(file_id, event_at desc);
create index if not exists idx_file_tc_history_tc
  on public.file_tc_history(tc_id, event_at desc);

comment on table public.file_tc_history is
  'Audit log of every TC assignment event. Used by the cockpit timeline + broker compliance reporting.';

-- ----------------------------------------------------------------------------
-- 3) RLS on file_tc_history
-- ----------------------------------------------------------------------------
alter table public.file_tc_history enable row level security;

drop policy if exists "fth_agent_select" on public.file_tc_history;
create policy "fth_agent_select"
  on public.file_tc_history for select
  to authenticated
  using (
    exists (
      select 1 from public.files f
      where f.id = file_tc_history.file_id
        and (f.agent_id = auth.uid() or f.assigned_tc_id = auth.uid() or public.is_broker())
    )
  );

drop policy if exists "fth_system_insert" on public.file_tc_history;
create policy "fth_system_insert"
  on public.file_tc_history for insert
  to authenticated
  with check (
    -- Insert allowed if the caller is the file's agent, the assigned TC, or
    -- the broker. Edge functions running with service_role bypass RLS entirely.
    exists (
      select 1 from public.files f
      where f.id = file_tc_history.file_id
        and (f.agent_id = auth.uid() or f.assigned_tc_id = auth.uid() or public.is_broker())
    )
  );

-- ----------------------------------------------------------------------------
-- 4) Trigger · auto-log file status + assignment changes to file_tc_history
-- ----------------------------------------------------------------------------
create or replace function public.log_file_tc_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Log on assignment change (initial or reassignment)
  if (tg_op = 'INSERT' and new.assigned_tc_id is not null) then
    insert into public.file_tc_history (file_id, tc_id, event_type, metadata)
    values (new.id, new.assigned_tc_id, 'assigned',
            jsonb_build_object('source', 'intake_submit'));
  elsif (tg_op = 'UPDATE' and new.assigned_tc_id is distinct from old.assigned_tc_id and new.assigned_tc_id is not null) then
    insert into public.file_tc_history (file_id, tc_id, event_type, metadata)
    values (new.id, new.assigned_tc_id, 'assigned',
            jsonb_build_object('source', 'reassignment',
                               'previous_tc_id', old.assigned_tc_id));
  end if;
  -- Log on acceptance
  if (tg_op = 'UPDATE' and new.tc_accepted_at is not null and old.tc_accepted_at is null) then
    insert into public.file_tc_history (file_id, tc_id, event_type, expected_start_at)
    values (new.id, new.assigned_tc_id, 'accepted', new.tc_expected_start_at);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_file_tc_change on public.files;
create trigger trg_log_file_tc_change
  after insert or update on public.files
  for each row
  execute function public.log_file_tc_change();
