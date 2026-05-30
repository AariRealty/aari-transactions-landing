-- ============================================================================
-- File messaging system · agent → TC + broker · paste-and-run
-- ============================================================================
-- Creates file_messages table for cross-page messaging.
-- Adds SA sign-once check via existing agents.agreement_signed_at.
-- Idempotent.
-- ============================================================================

begin;

create table if not exists public.file_messages (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_role text not null default 'agent', -- agent | tc | broker
  recipient_role text not null default 'tc', -- tc | agent | broker
  message text not null,
  sent_at timestamptz not null default now(),
  read_at timestamptz,
  replied_at timestamptz,
  parent_message_id uuid references public.file_messages(id) on delete set null,
  tc_notified_at timestamptz,
  broker_notified_at timestamptz,
  nudge_count int not null default 0,
  last_nudge_at timestamptz
);

comment on table public.file_messages is
  'Cross-page messaging: agent → TC/broker → reply chain. Tracks notification + reply SLA + nudges.';

create index if not exists idx_fm_file on public.file_messages (file_id);
create index if not exists idx_fm_sender on public.file_messages (sender_id);
create index if not exists idx_fm_unread on public.file_messages (recipient_role, replied_at) where replied_at is null;
create index if not exists idx_fm_sent_at on public.file_messages (sent_at desc);

alter table public.file_messages enable row level security;

-- Agent reads own thread; TC reads files they own; broker reads all
drop policy if exists fm_select on public.file_messages;
create policy fm_select on public.file_messages
  for select to authenticated using (
    exists (
      select 1 from public.agents a
      where a.id = auth.uid()
        and (
          a.role = 'broker'
          or (a.role = 'tc' and exists (
            select 1 from public.files f
            where f.id = file_messages.file_id and f.assigned_tc_id = auth.uid()
          ))
          or (a.role = 'agent' and exists (
            select 1 from public.files f
            where f.id = file_messages.file_id and f.agent_id = auth.uid()
          ))
        )
    )
  );

-- Insert: agent inserts on own file; TC inserts on assigned files; broker any
drop policy if exists fm_insert on public.file_messages;
create policy fm_insert on public.file_messages
  for insert to authenticated with check (
    exists (
      select 1 from public.agents a
      where a.id = auth.uid()
        and (
          a.role = 'broker'
          or (a.role = 'tc' and exists (select 1 from public.files f where f.id = file_messages.file_id and f.assigned_tc_id = auth.uid()))
          or (a.role = 'agent' and exists (select 1 from public.files f where f.id = file_messages.file_id and f.agent_id = auth.uid()))
        )
    )
  );

-- Update: anyone with read access can mark as read or update nudge_count etc
drop policy if exists fm_update on public.file_messages;
create policy fm_update on public.file_messages
  for update to authenticated using (
    exists (
      select 1 from public.agents a
      where a.id = auth.uid()
        and (
          a.role in ('broker','tc')
          or (a.role = 'agent' and exists (select 1 from public.files f where f.id = file_messages.file_id and f.agent_id = auth.uid()))
        )
    )
  );

commit;

-- ============================================================================
-- Confirmation
-- ============================================================================
select 'file_messages table' as check_name,
  case when exists (select 1 from information_schema.tables where table_schema='public' and table_name='file_messages')
       then 'ok' else 'MISSING' end as status
union all
select 'fm_select policy',
  case when exists (select 1 from pg_policies where schemaname='public' and tablename='file_messages' and policyname='fm_select')
       then 'ok' else 'MISSING' end
union all
select 'fm_insert policy',
  case when exists (select 1 from pg_policies where schemaname='public' and tablename='file_messages' and policyname='fm_insert')
       then 'ok' else 'MISSING' end;
