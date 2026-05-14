-- Aari Transactions · messages table
-- Threaded agent ↔ TC messages, scoped per file.
-- Phase 1: agents send messages from the portal. TCs receive an email
-- notification and reply via email (handled in a future ship) or via
-- the admin portal once that exists.

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  -- 'agent' for messages sent FROM the agent TO the TC team.
  -- 'tc' reserved for future use when TCs reply through the system.
  sender_type text not null check (sender_type in ('agent', 'tc')),
  body text not null check (length(body) between 2 and 5000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  email_sent_at timestamptz
);

create index if not exists messages_file_id_idx on public.messages (file_id);
create index if not exists messages_agent_id_idx on public.messages (agent_id);
create index if not exists messages_created_at_idx on public.messages (created_at desc);

-- RLS: agents can SELECT their own messages and INSERT new ones for files
-- they own. Service role bypass for the edge function.
alter table public.messages enable row level security;

drop policy if exists "Agents can read their own messages" on public.messages;
create policy "Agents can read their own messages"
  on public.messages for select
  to authenticated
  using (agent_id = auth.uid());

drop policy if exists "Agents can insert messages for their own files" on public.messages;
create policy "Agents can insert messages for their own files"
  on public.messages for insert
  to authenticated
  with check (
    agent_id = auth.uid()
    and exists (
      select 1 from public.files f
      where f.id = file_id and f.agent_id = auth.uid()
    )
  );
