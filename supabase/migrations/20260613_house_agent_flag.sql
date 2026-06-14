-- ============================================================================
-- is_house_agent · broker-controlled flag marking an agent as one of YOUR
-- brokerage's agents (Aari Realty), vs an outside TC client from another
-- brokerage. The broker toggles it in the cockpit; a trigger keeps the
-- "Aari Realty" team membership in sync. No fragile free-text inference.
-- ============================================================================

alter table public.agents add column if not exists is_house_agent boolean default false;

create or replace function public.sync_house_agent_team()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare tid uuid;
begin
  select id into tid from public.teams where name = 'Aari Realty' limit 1;
  if tid is null then return new; end if;
  if coalesce(new.is_house_agent, false) then
    insert into public.team_members (team_id, agent_id) values (tid, new.id) on conflict do nothing;
  else
    delete from public.team_members where team_id = tid and agent_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_house_agent_sync on public.agents;
create trigger on_house_agent_sync
  after insert or update of is_house_agent on public.agents
  for each row execute function public.sync_house_agent_team();

-- One-time reset · clear the over-broad bulk add so membership is driven only
-- by the flag going forward. (Run once, after the trigger exists.)
delete from public.team_members tm using public.teams t
where tm.team_id = t.id and t.name = 'Aari Realty';
