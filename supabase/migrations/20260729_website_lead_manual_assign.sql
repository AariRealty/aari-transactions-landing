-- ============================================================================
-- Aari Transactions · Website-lead manual-assign flow (beta)
-- ============================================================================
-- Problem: when a client submits through aaritransactions.com, the file lands
-- with assigned_tc_id=null and payment_pending=true, which today fires the pool
-- broadcast trigger and SMSes every TC. During beta Marlenyi wants to pick the
-- TC herself, so the pool blast has to be suppressed for website leads.
--
-- This migration:
--   1. Adds `broker_website_lead_needs_tc` to the notifications type check
--      so the in-portal bell/toast row is allowed for this new signal.
--   2. Rewrites the pool-broadcast trigger function so it short-circuits when
--      the file was submitted through the public website (raw_form_data
--      submitted_via = 'public'). Agent-portal files still hit the pool the
--      old way.
--   3. Adds a new AFTER-INSERT trigger that fires the new
--      `send-broker-website-lead` edge function whenever a website submission
--      lands with no TC assigned. That edge function emails Marlenyi and
--      writes the in-portal notification row (Realtime picks it up).
-- ============================================================================

-- ---- 1. Widen notifications.type check constraint ----------------------------
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'tc_file_assigned',
    'tc_file_reassigned',
    'agent_message',
    'broker_website_lead_needs_tc',
    'system'
  ));

-- ---- 2. Skip the pool broadcast for website leads ---------------------------
-- The function already existed in the live DB (created out-of-band). Redefine
-- it here so it's version-controlled going forward and gate it on the
-- submitted_via signal that the public-submit edge function stamps into
-- raw_form_data.
create or replace function public.notify_tc_pool_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owned boolean;
  v_submitted_via text;
begin
  -- Existing behavior: owned clients get handled by the owning TC directly.
  select (owner_tc_id is not null) into v_owned
    from public.agents where id = new.agent_id;
  if coalesce(v_owned, false) then
    return new;
  end if;

  -- NEW: website leads (public-submit) skip the pool. Marlenyi assigns them
  -- manually from broker-cockpit while we're still in beta on that flow.
  v_submitted_via := new.raw_form_data->>'submitted_via';
  if v_submitted_via = 'public' then
    return new;
  end if;

  -- Fall through: agent-portal submissions still broadcast to the pool.
  perform net.http_post(
    url := 'https://fnlrgmuvtgwzjsihqxcn.supabase.co/functions/v1/send-tc-pool-broadcast',
    body := jsonb_build_object('file_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  return new;
end;
$$;

-- The trigger itself already exists on public.files (trg_notify_tc_pool_on_insert).
-- Redefining the function above is enough — no need to touch the trigger row.

-- ---- 3. New trigger · notify Marlenyi on every website lead -----------------
create or replace function public.notify_broker_of_website_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submitted_via text;
begin
  v_submitted_via := new.raw_form_data->>'submitted_via';
  if v_submitted_via <> 'public' then
    return new;
  end if;

  -- Only fire when the file lands unassigned. If public-submit ever grows the
  -- ability to pre-select a TC on the website form we won't double-nag.
  if new.assigned_tc_id is not null then
    return new;
  end if;

  perform public.invoke_edge_function(
    'send-broker-website-lead',
    jsonb_build_object('file_id', new.id)
  );
  return new;
exception when others then
  -- Never let a notification hiccup block the intake insert.
  raise notice 'notify_broker_of_website_lead failed for %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_notify_broker_of_website_lead on public.files;
create trigger trg_notify_broker_of_website_lead
  after insert on public.files
  for each row
  execute function public.notify_broker_of_website_lead();

comment on function public.notify_broker_of_website_lead is
  'Fires send-broker-website-lead when a public-submit lands unassigned. Marlenyi picks the TC manually during beta.';
