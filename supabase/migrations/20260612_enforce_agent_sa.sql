-- ============================================================================
-- Aari Transactions · Enforce executed Service Agreement before submission
-- ============================================================================
-- "No agent operates without executing the SA." The dashboard banner is a
-- prompt; THIS is the binding control. A BEFORE INSERT trigger on public.files
-- blocks any file whose submitting agent is role='agent' AND has no
-- agreement_signed_at. It runs on EVERY insert path — direct client inserts and
-- service-key edge-function inserts alike (RLS would miss the latter), so it
-- can't be bypassed.
--
-- Does NOT block: staff (tc/broker), already-signed agents, or rows with no
-- agent_id (system/anonymous). Unknown agent_id is not blocked (fail-open on
-- lookup, so a data glitch never halts the whole pipeline).
--
-- Rollback:  drop trigger trg_enforce_agent_sa_signed on public.files;
-- Idempotent · safe to re-run.
-- ============================================================================

create or replace function public.enforce_agent_sa_signed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
begin
  if new.agent_id is null then
    return new;  -- no submitting agent to gate
  end if;

  select role, agreement_signed_at
    into a
  from public.agents
  where id = new.agent_id;

  -- a.role is null when the agent row isn't found · that case is intentionally
  -- not blocked (fail-open) so a missing/odd record never stops all submissions.
  if a.role = 'agent' and a.agreement_signed_at is null then
    raise exception 'You must sign your Service Agreement before submitting files.'
      using errcode = 'P0001', hint = 'SA_NOT_SIGNED';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_agent_sa_signed on public.files;
create trigger trg_enforce_agent_sa_signed
  before insert on public.files
  for each row
  execute function public.enforce_agent_sa_signed();
