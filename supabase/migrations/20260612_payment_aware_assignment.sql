-- ============================================================================
-- Aari Transactions · Payment-aware TC assignment (June 2026)
-- ============================================================================
-- Rule: no payment, no TC clock. Upfront files that arrive payment_pending are
-- NOT assigned at insert — the TC would get an accept-within-30-min text for a
-- file they can't legally start. The moment the Stripe webhook (or a
-- membership credit) flips payment_confirmed, assignment resolves and the
-- existing assignment-SMS chain fires. TC-lane files (billed at closing) and
-- credit-covered files assign instantly at insert, exactly as before.
-- Replaces auto_assign_tc from 20260610 with a shared resolver. Idempotent.
-- ============================================================================

-- Shared resolver · preference slug → TC account, else workload round-robin.
create or replace function public.resolve_tc_assignment(raw jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  pref text;
  pick uuid;
  eileen_id uuid;
  mile_id uuid;
  eileen_open int;
  mile_open int;
begin
  pref := lower(coalesce(raw->>'preferred_tc_id', 'auto'));

  select id into eileen_id from public.agents where lower(email) = 'eileen@aaritransactions.com' limit 1;
  select id into mile_id   from public.agents where lower(email) = 'mile@aaritransactions.com'   limit 1;

  if pref = 'eileen' and eileen_id is not null then
    pick := eileen_id;
  elsif pref = 'mile' and mile_id is not null then
    pick := mile_id;
  else
    select count(*) into eileen_open from public.files
     where assigned_tc_id = eileen_id
       and coalesce(status, '') not in ('closed', 'cancelled', 'archived');
    select count(*) into mile_open from public.files
     where assigned_tc_id = mile_id
       and coalesce(status, '') not in ('closed', 'cancelled', 'archived');

    if eileen_id is null then pick := mile_id;
    elsif mile_id is null then pick := eileen_id;
    elsif mile_open < eileen_open then pick := mile_id;
    else pick := eileen_id; -- tie goes to Eileen (senior TC)
    end if;
  end if;

  return pick;
end;
$$;

-- INSERT · assign immediately ONLY when the file is already payable work.
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

  -- Unpaid upfront file · hold assignment until payment confirms.
  if coalesce(new.payment_pending, false) = true then
    return new;
  end if;

  new.assigned_tc_id := public.resolve_tc_assignment(new.raw_form_data);
  return new;
exception when others then
  return new; -- assignment must never block a submission
end;
$$;

-- (trigger from 20260610 already points at auto_assign_tc · recreate for safety)
drop trigger if exists trg_auto_assign_tc on public.files;
create trigger trg_auto_assign_tc
  before insert on public.files
  for each row
  execute function public.auto_assign_tc();

-- UPDATE · payment just confirmed → assign now · SMS chain fires automatically
-- (20260524 trigger watches UPDATE OF assigned_tc_id).
create or replace function public.assign_tc_on_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(old.payment_confirmed, false) = false
     and coalesce(new.payment_confirmed, false) = true
     and new.assigned_tc_id is null then
    new.assigned_tc_id := public.resolve_tc_assignment(new.raw_form_data);
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_assign_tc_on_payment on public.files;
create trigger trg_assign_tc_on_payment
  before update on public.files
  for each row
  execute function public.assign_tc_on_payment();
