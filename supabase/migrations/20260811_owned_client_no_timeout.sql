-- ============================================================================
-- Owned-client files · auto-accept, no timeout escalation
-- ============================================================================
-- Marlenyi 2026-08-11 · when an agent has an owner_tc_id (a designated
-- coordinator, "owned client"), files from that agent should just land with
-- the owner TC · no acceptance timer, no broker escalation. Broker still gets
-- the standard file-submitted email so she knows a file came in.
--
-- Previously: owned-client files ran the same 30-minute acceptance timer as
-- pool files; if the owner TC didn't tap "Accept" in time, sweep_unaccepted_files
-- flipped them to awaiting_broker_review and fired the broker escalation email
-- ("File needs you"). That double-tapped Marlenyi (who already got the standard
-- submission notification) and made her think the file was on her plate when
-- the owner TC was actually going to handle it.
--
-- Two changes:
--   1. stamp_self_created_accepted also auto-stamps tc_accepted_at for owned-
--      client files at INSERT (owner_tc_id === assigned_tc_id) · same treatment
--      as a TC-self-submitted file. No pending-acceptance state to time out.
--   2. sweep_unaccepted_files skips owned-client rows entirely · defense in
--      depth, so any pre-existing owned-client file that somehow lacks
--      tc_accepted_at never gets escalated retroactively.
-- ============================================================================

create or replace function public.stamp_self_created_accepted()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_owner uuid;
begin
  -- submitted_by_tc arrives as the STRING 'true' from the portal intake.
  if (new.raw_form_data->>'submitted_by_tc') = 'true' and new.tc_accepted_at is null then
    new.tc_accepted_at := coalesce(new.created_at, now());
    return new;
  end if;
  -- Marlenyi 2026-08-11 · owned-client auto-accept. If the assigned TC is the
  -- agent's designated owner, treat it like a self-created file · no timeout,
  -- no escalation. auto_assign_tc has already stamped raw_form_data.owned_by_tc
  -- when applicable, so we can also lean on that for a fast path.
  if new.assigned_tc_id is not null and new.agent_id is not null and new.tc_accepted_at is null then
    select owner_tc_id into v_owner from public.agents where id = new.agent_id;
    if v_owner is not null and v_owner = new.assigned_tc_id then
      new.tc_accepted_at := coalesce(new.created_at, now());
    end if;
  end if;
  return new;
exception when others then
  return new;   -- never block a file write over this
end;
$function$;

create or replace function public.sweep_unaccepted_files()
returns table(swept_file_id uuid, outcome text, next_tc_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  rec record;
  picked_tc_id uuid;
begin
  for rec in
    select f.id, f.assigned_tc_id, f.service_type, f.created_at, f.agent_id, ag.owner_tc_id as owner_tc
    from public.files f
    left join public.agents ag on ag.id = f.agent_id
    where f.status in ('intake_received', 'awaiting_tc_acceptance')
      and f.tc_accepted_at is null
      and coalesce(f.payment_confirmed, false) = true
      and f.created_at < now() - interval '30 minutes'
      and f.created_at > now() - interval '7 days'
    order by f.created_at asc
    limit 100
  loop
    -- Marlenyi 2026-08-11 · owned-client files never enter the pool timeout.
    -- Just leave them alone · they belong to their designated TC, and the
    -- INSERT trigger above already stamped tc_accepted_at when the assigned
    -- TC matched the owner. This branch catches legacy rows (owned but not
    -- pre-stamped, e.g. imports that predate the fix) so they never escalate.
    if rec.owner_tc is not null then
      swept_file_id := rec.id; outcome := 'skipped_owned_client'; next_tc_id := null;
      -- Stamp acceptance so the row exits the sweep queue and doesn't get
      -- re-processed every 30 minutes for the next 7 days.
      update public.files set tc_accepted_at = coalesce(created_at, now()) where id = rec.id;
      return next;
      continue;
    end if;

    if rec.assigned_tc_id is not null then
      insert into public.file_tc_history (file_id, tc_id, event_type, metadata)
      values (rec.id, rec.assigned_tc_id, 'timeout',
        jsonb_build_object('minutes_since_assigned', 30, 'reason', 'no_response_within_window'));
    end if;

    select a.id into picked_tc_id
    from public.agents a
    where a.role = 'tc'
      and coalesce(a.is_active, true) = true
      and a.id not in (select tc_id from public.file_tc_history where file_id = rec.id and tc_id is not null)
    order by random()
    limit 1;

    if picked_tc_id is null then
      update public.files set status = 'awaiting_broker_review', assigned_tc_id = null where id = rec.id;
      insert into public.file_tc_history (file_id, tc_id, event_type, metadata)
      values (rec.id, null, 'broker_escalated', jsonb_build_object('reason', 'all_tcs_exhausted'));
      swept_file_id := rec.id; outcome := 'escalated_to_broker'; next_tc_id := null;
      return next;
    else
      update public.files set assigned_tc_id = picked_tc_id, status = 'awaiting_tc_acceptance' where id = rec.id;
      swept_file_id := rec.id; outcome := 'reassigned'; next_tc_id := picked_tc_id;
      return next;
    end if;
  end loop;
  return;
end;
$function$;

-- Clean up the current phantom + any other pre-existing owned-client files
-- stuck at awaiting_broker_review because of the old escalation. Revert them
-- to intake_received with the owner TC still assigned and mark accepted.
update public.files f
set status = 'intake_received',
    tc_accepted_at = coalesce(f.tc_accepted_at, f.created_at, now())
from public.agents a
where f.agent_id = a.id
  and a.owner_tc_id is not null
  and f.status = 'awaiting_broker_review'
  and f.assigned_tc_id is not null;
