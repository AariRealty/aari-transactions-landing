-- ============================================================================
-- Aari Transactions · agent_contacts — the permanent address book (June 2026)
-- ============================================================================
-- Evolves the opt-in `contacts` table (created earlier the same week) into the
-- full address-book spec — SAME data, new shape. If the old table exists it is
-- renamed and adapted so already-saved contacts survive. Fresh installs create
-- the table outright. Idempotent · safe to re-run.
--
-- Shape:  id · agent_id · contact_type (buyer/seller/title/lender/agent)
--         · full_name · email · phone · created_at · updated_at
-- RLS:    agents have full CRUD on their OWN rows (agent_id = auth.uid());
--         the Aari team (role tc or broker on the agents row: Marlenyi,
--         Eileen, Milennys) can READ all rows. Nobody else sees anything.
-- ============================================================================

-- 1 · Rename + adapt the earlier table if present.
do $$
begin
  if exists (select from information_schema.tables
             where table_schema = 'public' and table_name = 'contacts')
     and not exists (select from information_schema.tables
             where table_schema = 'public' and table_name = 'agent_contacts') then
    alter table public.contacts rename to agent_contacts;
    alter table public.agent_contacts rename column owner_id to agent_id;
    alter table public.agent_contacts rename column role to contact_type;
  end if;
end $$;

-- 2 · Fresh-install shape (no-op when the rename above already ran).
create table if not exists public.agent_contacts (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null references auth.users (id) on delete cascade,
  contact_type  text not null default 'buyer',   -- buyer / seller / title / lender / agent
  full_name     text not null default '',
  email         text not null,                   -- stored lowercase · dedupe key
  phone         text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 3 · Dedupe key for upserts (onConflict: 'agent_id,email').
drop index if exists contacts_owner_email_uq;
create unique index if not exists agent_contacts_agent_email_uq
  on public.agent_contacts (agent_id, email);

-- 4 · Team-read helper · security definer so RLS on agents doesn't recurse.
create or replace function public.is_aari_team()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.agents
    where id = auth.uid() and role in ('tc', 'broker')
  );
$$;

-- 5 · RLS · own-rows CRUD + team read.
alter table public.agent_contacts enable row level security;

drop policy if exists contacts_owner_all on public.agent_contacts;
drop policy if exists agent_contacts_own_crud on public.agent_contacts;
create policy agent_contacts_own_crud
  on public.agent_contacts for all
  to authenticated
  using (agent_id = auth.uid())
  with check (agent_id = auth.uid());

drop policy if exists agent_contacts_team_read on public.agent_contacts;
create policy agent_contacts_team_read
  on public.agent_contacts for select
  to authenticated
  using (public.is_aari_team());
