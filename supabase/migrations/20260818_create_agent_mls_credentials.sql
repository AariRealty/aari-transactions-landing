-- ============================================================
-- agent_mls_credentials · per-agent, per-MLS access record
-- ------------------------------------------------------------
-- Purpose: stop asking agents to hand us MLS credentials every
-- time they submit a file. Instead, we store what they've given
-- us (once) and read it on subsequent files. New agents (or
-- existing agents with a new MLS) still get the prompt.
--
-- Design:
--   - One row per (agent, MLS name). MLS name matches the
--     canonical labels in LW_MLS_LIST on the wizard.
--   - Credentials stored as-is for now (same surface as signed
--     contracts on this project). Migrate to pgcrypto/vault in
--     place if we tighten later.
--   - verified_at is set when broker or assigned TC confirms
--     the creds actually work. NULL = usable but unverified.
--   - revoked_at marks a row stale without deleting history.
--   - RLS relies on agents.id === auth.users.id (verified
--     against auth.uid() directly, no join column needed).
-- ============================================================

create table if not exists public.agent_mls_credentials (
  id           uuid        primary key default gen_random_uuid(),
  agent_id     uuid        not null references public.agents(id) on delete cascade,
  mls_name     text        not null,
  username     text,
  password     text,
  notes        text,
  verified_at  timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (agent_id, mls_name)
);

create index if not exists agent_mls_credentials_agent_id_idx
  on public.agent_mls_credentials (agent_id)
  where revoked_at is null;

create or replace function public.tg_agent_mls_credentials_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_agent_mls_credentials_touch on public.agent_mls_credentials;
create trigger trg_agent_mls_credentials_touch
  before update on public.agent_mls_credentials
  for each row execute function public.tg_agent_mls_credentials_touch();

alter table public.agent_mls_credentials enable row level security;

drop policy if exists agent_mls_credentials_self_read on public.agent_mls_credentials;
create policy agent_mls_credentials_self_read on public.agent_mls_credentials
  for select using (agent_id = auth.uid());

drop policy if exists agent_mls_credentials_self_insert on public.agent_mls_credentials;
create policy agent_mls_credentials_self_insert on public.agent_mls_credentials
  for insert with check (agent_id = auth.uid());

drop policy if exists agent_mls_credentials_self_update on public.agent_mls_credentials;
create policy agent_mls_credentials_self_update on public.agent_mls_credentials
  for update
  using (agent_id = auth.uid())
  with check (agent_id = auth.uid());

drop policy if exists agent_mls_credentials_self_delete on public.agent_mls_credentials;
create policy agent_mls_credentials_self_delete on public.agent_mls_credentials
  for delete using (agent_id = auth.uid());

comment on table public.agent_mls_credentials is
  'Per-agent MLS login credentials so the wizard and post-payment email flow can stop re-asking. Set by the agent on their profile; verified by broker or assigned TC.';
