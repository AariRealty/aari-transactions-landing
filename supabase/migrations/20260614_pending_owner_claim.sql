-- ============================================================================
-- Pending owner · auto-claim on signup
-- ----------------------------------------------------------------------------
-- A file can be imported for an agent who has not created an account yet. We
-- record the intended owner's email in pending_agent_email (agent_id stays
-- null). When that agent signs up (an agents row is inserted with a matching
-- email), a trigger claims every pending file for them and adds them to the
-- Aari Realty team so their production shows immediately.
-- ============================================================================

alter table public.files
  add column if not exists pending_agent_email text;

comment on column public.files.pending_agent_email is
  'Intended owner email for a file whose agent has no account yet. Cleared and converted to agent_id by trg_claim_pending_files when that agent signs up.';

create index if not exists idx_files_pending_email on public.files(lower(pending_agent_email));

create or replace function public.tg_claim_pending_files()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update public.files
  set agent_id = NEW.id, pending_agent_email = null
  where agent_id is null
    and pending_agent_email is not null
    and lower(pending_agent_email) = lower(NEW.email);
  get diagnostics n = row_count;
  -- If they just claimed Aari Realty files, put them on the Aari Realty team.
  if n > 0 then
    insert into public.team_members (team_id, agent_id)
    select t.id, NEW.id from public.teams t where t.name = 'Aari Realty'
    on conflict (team_id, agent_id) do nothing;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_claim_pending_files on public.agents;
create trigger trg_claim_pending_files
  after insert on public.agents
  for each row execute function public.tg_claim_pending_files();
