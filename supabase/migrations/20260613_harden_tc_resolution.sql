-- ============================================================================
-- Aari Transactions · Harden TC assignment resolution (June 2026)
-- ============================================================================
-- BUG (live · Milennys' file): a file submitted with an EXPLICIT TC pick
-- (raw_form_data->>'preferred_tc_id' = 'mile') was assigned to the OTHER TC,
-- so the acceptance SMS went to the wrong person and the file never appeared
-- under the chosen TC's profile.
--
-- ROOT CAUSE: resolve_tc_assignment (20260612) mapped the slug -> account ONLY
-- by a hardcoded email literal ('mile@aaritransactions.com'). When the TC's
-- agents.email did not match that exact string, mile_id came back NULL, the
-- explicit branch was SKIPPED, and the function fell through to the workload
-- round-robin -- which silently handed the file to the other TC.
--
-- FIX (two parts, both idempotent):
--   1. Add a stable agents.tc_slug ('eileen' | 'mile') so resolution no longer
--      depends on an exact email string. Best-effort backfill for the two known
--      TCs (email match first, first_name fallback, guarded by role = 'tc').
--   2. Rewrite resolve_tc_assignment so an EXPLICIT pick resolves to THAT TC or
--      returns NULL (file left unassigned for the broker to place) -- it NEVER
--      falls through to the other TC. Round-robin applies ONLY to 'auto'.
--
-- Only the resolver function changes. The existing trg_auto_assign_tc /
-- auto_assign_tc wrapper (20260610/20260612) and the 20260524 assignment-SMS
-- trigger are unaffected -- they call resolve_tc_assignment, so replacing it is
-- sufficient.
--
-- NOTE: if a TC's agents row has neither the matching email nor a backfilled
-- slug, their explicit files will now sit UNASSIGNED (visible to the broker)
-- instead of going to the wrong TC. To make them auto-assign, set the slug:
--   update public.agents set tc_slug = 'mile' where id = '<that TC''s id>';
-- ============================================================================

alter table public.agents add column if not exists tc_slug text;

create unique index if not exists agents_tc_slug_key
  on public.agents(tc_slug) where tc_slug is not null;

-- Best-effort backfill for the two known TCs (email first, name fallback).
update public.agents set tc_slug = 'eileen'
  where role = 'tc' and tc_slug is null
    and (lower(email) = 'eileen@aaritransactions.com' or first_name ilike 'eileen%');
update public.agents set tc_slug = 'mile'
  where role = 'tc' and tc_slug is null
    and (lower(email) = 'mile@aaritransactions.com'
         or first_name ilike 'mile%' or first_name ilike 'milenny%');

create or replace function public.resolve_tc_assignment(raw jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  pref       text;
  eileen_id  uuid;
  mile_id    uuid;
  eileen_open int;
  mile_open   int;
begin
  pref := lower(coalesce(raw->>'preferred_tc_id', 'auto'));

  -- Slug is the stable key; email remains a fallback for un-backfilled rows.
  select id into eileen_id from public.agents
    where tc_slug = 'eileen' or lower(email) = 'eileen@aaritransactions.com'
    order by (tc_slug = 'eileen') desc nulls last
    limit 1;
  select id into mile_id from public.agents
    where tc_slug = 'mile' or lower(email) = 'mile@aaritransactions.com'
    order by (tc_slug = 'mile') desc nulls last
    limit 1;

  -- EXPLICIT pick · resolve to THAT TC or NULL. Never the other one.
  if pref = 'eileen' then return eileen_id; end if;
  if pref = 'mile'   then return mile_id;   end if;

  -- AUTO (or unknown slug) · round-robin by current open workload.
  select count(*) into eileen_open from public.files
    where assigned_tc_id = eileen_id
      and coalesce(status, '') not in ('closed', 'cancelled', 'archived');
  select count(*) into mile_open from public.files
    where assigned_tc_id = mile_id
      and coalesce(status, '') not in ('closed', 'cancelled', 'archived');

  if eileen_id is null then return mile_id;   end if;
  if mile_id   is null then return eileen_id; end if;
  if mile_open < eileen_open then return mile_id; end if;
  return eileen_id; -- tie goes to Eileen (senior TC)
end;
$$;
