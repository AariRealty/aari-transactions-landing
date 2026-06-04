-- ============================================================================
-- Aari Transactions · Auto-assign TC at file insert (June 2026)
-- ============================================================================
-- The intake stores the agent's TC pick as a preference slug
-- (raw_form_data->>'preferred_tc_id' = 'eileen' | 'mile' | 'auto') but always
-- inserted assigned_tc_id = NULL — so the assignment SMS chain (20260524
-- trigger → send-tc-assignment-sms → reply-Y acceptance → 30-min timeout
-- sweep) never started. This BEFORE-INSERT trigger resolves the preference to
-- the TC's real account id, or round-robins by current open workload when the
-- agent picked Auto-assign. The existing AFTER INSERT OR UPDATE OF
-- assigned_tc_id trigger then fires the SMS automatically. Idempotent.
-- ============================================================================

create or replace function public.auto_assign_tc()
returns trigger
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
  -- Respect explicit assignments (broker drawer control, future flows).
  if new.assigned_tc_id is not null then
    return new;
  end if;

  pref := lower(coalesce(new.raw_form_data->>'preferred_tc_id', 'auto'));

  -- Slug → TC account · matched by email (stable even if display names change).
  select id into eileen_id from public.agents where lower(email) = 'eileen@aaritransactions.com' limit 1;
  select id into mile_id   from public.agents where lower(email) = 'mile@aaritransactions.com'   limit 1;

  if pref = 'eileen' and eileen_id is not null then
    pick := eileen_id;
  elsif pref = 'mile' and mile_id is not null then
    pick := mile_id;
  else
    -- Auto-assign (or unknown slug) · round-robin by open workload.
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

  if pick is not null then
    new.assigned_tc_id := pick;
  end if;
  return new;
exception when others then
  -- Assignment must NEVER block a submission · worst case the broker assigns manually.
  return new;
end;
$$;

drop trigger if exists trg_auto_assign_tc on public.files;
create trigger trg_auto_assign_tc
  before insert on public.files
  for each row
  execute function public.auto_assign_tc();
