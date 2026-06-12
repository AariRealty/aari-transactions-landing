-- ============================================================================
-- Aari Transactions · Show payment-pending listings to the TC (June 2026)
-- ============================================================================
-- CHANGE OF RULE (per Marlenyi): an unpaid upfront file should STILL appear in
-- the TC's NEW column, tagged "Waiting for payment" and locked — so the TC can
-- see the request landed, WITHOUT starting the clock or getting an accept text.
--
-- Previously (20260612) unpaid upfront files were left assigned_tc_id = NULL,
-- so they were invisible to the TC. Now we assign them at insert (so they show)
-- but gate the accept-SMS and the timeout sweep on payment_confirmed. The clock
-- + text still fire only when payment lands.
--
-- Idempotent · safe to re-run.
-- ============================================================================

-- 1) INSERT · assign the TC even when the file is still payment_pending, so it
--    shows in the portal. (resolve_tc_assignment is unchanged from 20260612.)
create or replace function public.auto_assign_tc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_tc_id is not null then
    return new; -- explicit assignment wins
  end if;
  -- Assign regardless of payment so the file is visible to the TC. Payment
  -- gating now lives in the SMS trigger + the timeout sweep, not here.
  new.assigned_tc_id := public.resolve_tc_assignment(new.raw_form_data);
  return new;
exception when others then
  return new; -- assignment must never block a submission
end;
$$;

-- 2) Accept-SMS · fire ONLY for paid files. Now also watches payment_confirmed
--    so a paid-pending file texts the TC the moment payment lands — not before.
create or replace function public.fire_tc_assignment_sms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    new.assigned_tc_id is not null
    and new.tc_accepted_at is null
    and (new.status = 'awaiting_tc_acceptance' or new.status = 'intake_received')
    and coalesce(new.payment_confirmed, false) = true               -- PAID only
    and (
      tg_op = 'INSERT'                                              -- paid file at submit (TC lane / credit)
      or new.assigned_tc_id is distinct from old.assigned_tc_id     -- reassignment
      or (coalesce(old.payment_confirmed, false) = false
          and coalesce(new.payment_confirmed, false) = true)        -- payment just landed
    )
  ) then
    perform public.invoke_edge_function(
      'send-tc-assignment-sms',
      jsonb_build_object('file_id', new.id)
    );
  end if;
  return new;
exception when others then
  return new; -- SMS hiccups never block a file write
end;
$$;

-- Re-create the trigger to ALSO watch payment_confirmed (was assigned_tc_id only).
drop trigger if exists trg_fire_tc_assignment_sms on public.files;
create trigger trg_fire_tc_assignment_sms
  after insert or update of assigned_tc_id, payment_confirmed on public.files
  for each row
  execute function public.fire_tc_assignment_sms();

-- 3) Timeout sweep · never sweep / escalate an UNPAID file. The TC can't accept
--    work they haven't been paid for, so the 30-min clock only runs once paid.
--    This is the exact 20260521 function with ONE added WHERE filter.
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
      and coalesce(payment_confirmed, false) = true   -- ADDED · no clock on unpaid files
      and created_at < now() - interval '30 minutes'
      and created_at > now() - interval '7 days'
    order by created_at asc
    limit 100
  loop
    if rec.assigned_tc_id is not null then
      insert into public.file_tc_history (file_id, tc_id, event_type, metadata)
      values (
        rec.id,
        rec.assigned_tc_id,
        'timeout',
        jsonb_build_object('minutes_since_assigned', 30, 'reason', 'no_response_within_window')
      );
    end if;

    select a.id into picked_tc_id
    from public.agents a
    where a.role = 'tc'
      and coalesce(a.is_active, true) = true
      and a.id not in (
        select tc_id from public.file_tc_history
        where file_id = rec.id and tc_id is not null
      )
    order by random()
    limit 1;

    if picked_tc_id is null then
      update public.files
      set status = 'awaiting_broker_review', assigned_tc_id = null
      where id = rec.id;
      insert into public.file_tc_history (file_id, tc_id, event_type, metadata)
      values (rec.id, null, 'broker_escalated', jsonb_build_object('reason', 'all_tcs_exhausted'));
      swept_file_id := rec.id; outcome := 'escalated_to_broker'; next_tc_id := null;
      return next;
    else
      update public.files
      set assigned_tc_id = picked_tc_id, status = 'awaiting_tc_acceptance'
      where id = rec.id;
      swept_file_id := rec.id; outcome := 'reassigned'; next_tc_id := picked_tc_id;
      return next;
    end if;
  end loop;
  return;
end;
$$;
