-- ============================================================================
-- Aari Transactions · Emergency Lane (closings ≤ 7 days)
-- ============================================================================
-- Adds priority routing for files with a closing date within 7 days. These
-- files:
--   - Get an "Emergency" badge on the portal + cockpit
--   - Jump the queue (routed to senior TCs first)
--   - Show urgency in the assignment SMS body
--
-- Schema additions:
--   files.priority           text  · 'standard' | 'emergency'
--   files.priority_reason    text  · "Closing in 5 days" — human-friendly
--   agents.is_senior_tc      bool  · routing preference flag
-- ============================================================================

alter table public.files
  add column if not exists priority text not null default 'standard'
    check (priority in ('standard', 'emergency')),
  add column if not exists priority_reason text;

comment on column public.files.priority is
  'Routing tier. emergency = closings <= 7 days, routes to senior TCs first, gets badge in UI.';
comment on column public.files.priority_reason is
  'Human-friendly explanation of why this file is priority. Surfaces on the portal card.';

alter table public.agents
  add column if not exists is_senior_tc boolean not null default false;

comment on column public.agents.is_senior_tc is
  'When true, this TC is preferred for emergency files (closing <= 7 days). Manually flagged by broker.';

-- ----------------------------------------------------------------------------
-- Auto-detect emergency at insert / update of closing_date
-- ----------------------------------------------------------------------------
create or replace function public.set_priority_from_closing_date()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  days_to_close integer;
begin
  if new.closing_date is null then
    new.priority := coalesce(new.priority, 'standard');
    new.priority_reason := null;
    return new;
  end if;
  days_to_close := (new.closing_date - current_date);
  if days_to_close <= 7 and days_to_close >= 0 then
    new.priority := 'emergency';
    new.priority_reason := 'Closing in ' || days_to_close || ' day' ||
      case when days_to_close = 1 then '' else 's' end;
  else
    new.priority := 'standard';
    new.priority_reason := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_priority_from_closing_date on public.files;
create trigger trg_set_priority_from_closing_date
  before insert or update of closing_date on public.files
  for each row
  execute function public.set_priority_from_closing_date();

-- ----------------------------------------------------------------------------
-- Update sweep_unaccepted_files() to prefer senior TCs for emergency files
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
    select id, assigned_tc_id, service_type, created_at, priority
    from public.files
    where status in ('intake_received', 'awaiting_tc_acceptance')
      and tc_accepted_at is null
      and created_at < now() - interval '30 minutes'
      and created_at > now() - interval '7 days'
    order by
      case when priority = 'emergency' then 0 else 1 end,  -- emergency first
      created_at asc
    limit 100
  loop
    if rec.assigned_tc_id is not null then
      insert into public.file_tc_history (file_id, tc_id, event_type, metadata)
      values (rec.id, rec.assigned_tc_id, 'timeout',
              jsonb_build_object('minutes_since_assigned', 30,
                                 'priority', rec.priority,
                                 'reason', 'no_response_within_window'));
    end if;

    -- Pick next eligible TC · for emergency files, prefer senior TCs first
    select a.id into picked_tc_id
    from public.agents a
    where a.role = 'tc'
      and coalesce(a.is_active, true) = true
      and (a.availability_status is null or a.availability_status != 'off_today')
      and a.id not in (
        select tc_id from public.file_tc_history
        where file_id = rec.id and tc_id is not null
      )
    order by
      case when rec.priority = 'emergency' and a.is_senior_tc then 0 else 1 end,
      case when a.availability_status = 'available' then 0 else 1 end,
      random()
    limit 1;

    if picked_tc_id is null then
      update public.files
      set status = 'awaiting_broker_review',
          assigned_tc_id = null
      where id = rec.id;
      insert into public.file_tc_history (file_id, tc_id, event_type, metadata)
      values (rec.id, null, 'broker_escalated',
              jsonb_build_object('reason', 'all_tcs_exhausted',
                                 'priority', rec.priority));
      swept_file_id := rec.id;
      outcome := 'escalated_to_broker';
      next_tc_id := null;
      return next;
    else
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
