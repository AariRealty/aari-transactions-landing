-- ============================================================================
-- Aari Transactions · Broker file delete + reassignment timer reset (June 2026)
-- ============================================================================
-- PART 1 · broker_delete_file(uuid)
--   Broker-only RPC (no DELETE policy on files exists, and dependent FK rows
--   vary in cascade behavior — one definer function handles all of it in
--   order). Each dependent delete tolerates the table not existing.
--
-- PART 2 · Post-Stage-8 Fix 1 — last_assigned_at
--   The 30-minute acceptance window must restart whenever assigned_tc_id
--   changes (auto-assign OR manual broker reassignment). Trigger is named
--   zz_* so it fires AFTER the auto/payment-aware assignment triggers and
--   sees their final assigned_tc_id. The timeout sweep is repointed from
--   created_at to last_assigned_at.
-- Idempotent.
-- ============================================================================

-- ---- PART 1 · broker-only hard delete ----
create or replace function public.broker_delete_file(p_file_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from public.agents where id = auth.uid();
  if v_role is distinct from 'broker' then
    raise exception 'not_authorized';
  end if;
  begin delete from public.agreement_signatures where file_id = p_file_id; exception when undefined_table then null; end;
  begin delete from public.file_verifications  where file_id = p_file_id; exception when undefined_table then null; end;
  begin delete from public.file_deadlines      where file_id = p_file_id; exception when undefined_table then null; end;
  begin delete from public.file_email_sends    where file_id = p_file_id; exception when undefined_table then null; end;
  begin delete from public.file_messages       where file_id = p_file_id; exception when undefined_table then null; end;
  begin delete from public.file_documents      where file_id = p_file_id; exception when undefined_table then null; end;
  begin delete from public.file_audit_log      where file_id = p_file_id; exception when undefined_table then null; end;
  delete from public.files where id = p_file_id;
  return true;
end;
$$;

revoke all on function public.broker_delete_file(uuid) from public, anon;
grant execute on function public.broker_delete_file(uuid) to authenticated;

-- ---- PART 2 · last_assigned_at · 30-min window anchor ----
alter table public.files
  add column if not exists last_assigned_at timestamptz;

update public.files
  set last_assigned_at = created_at
  where assigned_tc_id is not null and last_assigned_at is null;

create or replace function public.tg_files_touch_last_assigned()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.assigned_tc_id is not null then
      new.last_assigned_at := now();
    end if;
  elsif new.assigned_tc_id is distinct from old.assigned_tc_id and new.assigned_tc_id is not null then
    new.last_assigned_at := now();
  end if;
  return new;
end;
$$;

-- zz_ prefix · runs after the auto-assign / payment-aware triggers (Postgres
-- fires same-event triggers in name order) so it sees their assignment.
drop trigger if exists zz_trg_files_touch_last_assigned on public.files;
create trigger zz_trg_files_touch_last_assigned
  before insert or update on public.files
  for each row execute function public.tg_files_touch_last_assigned();

-- ---- Timeout sweep repoint · created_at → last_assigned_at ----
-- Recreates sweep_unaccepted_files (originally 20260521) with the 30-minute
-- window measured from the LAST assignment. Reassignments inside the sweep
-- bump last_assigned_at via the zz trigger, so each new TC gets a fresh 30.
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
      and coalesce(last_assigned_at, created_at) < now() - interval '30 minutes'
      and created_at > now() - interval '7 days'
    order by coalesce(last_assigned_at, created_at) asc
    limit 100
  loop
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
