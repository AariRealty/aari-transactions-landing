-- ============================================================================
-- Aari Transactions · auto_assign_tc respects "No preference" (2026-08-16)
-- ============================================================================
-- Marlenyi: the TC assignment email should NEVER fire until the client picks
-- a coordinator or opts to auto-assign. The intake now has a coordinator
-- picker on both the service flow and the contract review with three options:
-- 'eileen' | 'mile' | 'none'.
--
-- Prior behavior: pref='auto' (or unknown) round-robined. Any 'none'/'unknown'
-- value fell into that same branch, so a file always ended up with an
-- assigned_tc_id, and tg_tc_files_insert always fired send-tc-new-file.
--
-- New behavior:
--   pref='eileen'  → pick Eileen
--   pref='mile'    → pick Milennys
--   pref='auto'    → round-robin (backward-compat; deprecated intake path)
--   anything else  → leave assigned_tc_id NULL (Marlenyi assigns manually
--                    from the broker cockpit; no TC email fires until then)
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

  pref := lower(coalesce(new.raw_form_data->>'preferred_tc_id', 'none'));

  -- Slug → TC account · matched by email (stable even if display names change).
  select id into eileen_id from public.agents where lower(email) = 'eileen@aaritransactions.com' limit 1;
  select id into mile_id   from public.agents where lower(email) = 'mile@aaritransactions.com'   limit 1;

  if pref = 'eileen' and eileen_id is not null then
    pick := eileen_id;
  elsif pref = 'mile' and mile_id is not null then
    pick := mile_id;
  elsif pref = 'auto' then
    -- Round-robin by open workload (backward-compat for the legacy default).
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
  else
    -- 'none' or unknown · leave NULL. Broker assigns manually from cockpit.
    -- tg_tc_files_insert's `IF NEW.tc_assigned_id IS NOT NULL` guard then
    -- skips send-tc-new-file, so no coordinator gets pinged until then.
    pick := null;
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
