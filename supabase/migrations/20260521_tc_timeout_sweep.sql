-- ============================================================================
-- Aari Transactions · TC Acceptance Timeout Sweep (Slice 2)
-- ============================================================================
-- Cron-scheduled function that auto-reassigns unaccepted files.
--
-- Runs every 5 minutes via pg_cron. Picks up files that meet ALL of:
--   - status in ('intake_received', 'awaiting_tc_acceptance')
--   - tc_accepted_at IS NULL
--   - created_at older than 30 minutes
--   - created_at within the last 7 days (don't resurrect abandoned files)
--
-- For each, logs a 'timeout' event for the current TC, then assigns the next
-- eligible TC. Eligibility = active TC not already in this file's history.
-- When all TCs have been tried, file is escalated to broker (status:
-- awaiting_broker_review, assigned_tc_id: null).
--
-- Routing v1: random pick among eligible. Future: service-match preference
-- (TC services → buyer specialist; listing services → listing specialist).
-- ============================================================================

-- Make sure pg_cron is enabled · Supabase ships it but it must be opted-in.
create extension if not exists pg_cron;

-- ----------------------------------------------------------------------------
-- The sweep function
-- ----------------------------------------------------------------------------
create or replace function public.sweep_unaccepted_files()
returns table (
  swept_file_id   uuid,
  outcome         text,
  next_tc_id      uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  picked_tc_id uuid;
begin
  for rec in
    select id, assigned_tc_id, service_type, created_at
    from public.files
    where status in ('intake_received', 'awaiting_tc_acceptance')
      and tc_accepted_at is null
      and created_at < now() - interval '30 minutes'
      and created_at > now() - interval '7 days'
    order by created_at asc
    limit 100
  loop
    -- 1) Log timeout for the currently-assigned TC (if any)
    if rec.assigned_tc_id is not null then
      insert into public.file_tc_history (file_id, tc_id, event_type, metadata)
      values (
        rec.id,
        rec.assigned_tc_id,
        'timeout',
        jsonb_build_object(
          'minutes_since_assigned', 30,
          'reason', 'no_response_within_window'
        )
      );
    end if;

    -- 2) Find next eligible TC · active TC not yet in this file's history
    select a.id into picked_tc_id
    from public.agents a
    where a.role = 'tc'
      and coalesce(a.is_active, true) = true
      and a.id not in (
        select tc_id
        from public.file_tc_history
        where file_id = rec.id and tc_id is not null
      )
    order by random()
    limit 1;

    if picked_tc_id is null then
      -- All TCs exhausted · escalate to broker
      update public.files
      set status = 'awaiting_broker_review',
          assigned_tc_id = null
      where id = rec.id;
      insert into public.file_tc_history (file_id, tc_id, event_type, metadata)
      values (
        rec.id, null, 'broker_escalated',
        jsonb_build_object('reason', 'all_tcs_exhausted')
      );
      swept_file_id := rec.id;
      outcome := 'escalated_to_broker';
      next_tc_id := null;
      return next;
    else
      -- Reassign · trigger on files logs the 'assigned' event automatically
      update public.files
      set assigned_tc_id = picked_tc_id,
          status = 'awaiting_tc_acceptance'
      where id = rec.id;
      swept_file_id := rec.id;
      outcome := 'reassigned';
      next_tc_id := picked_tc_id;
      return next;
    end if;
  end loop;
  return;
end;
$$;

comment on function public.sweep_unaccepted_files() is
  'TC Acceptance Workflow · Slice 2 · auto-reassigns unaccepted files after 30 minutes. Returns one row per file processed for observability.';

-- ----------------------------------------------------------------------------
-- Schedule the sweep via pg_cron (every 5 minutes)
-- ----------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule('tc-timeout-sweep');
exception when others then
  -- Job doesn't exist yet · safe to ignore
  null;
end$$;

select cron.schedule(
  'tc-timeout-sweep',
  '*/5 * * * *',
  $$select public.sweep_unaccepted_files();$$
);
