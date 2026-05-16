-- ============================================================================
-- Aari Transactions · TC Portal · Real-time Notifications (Option C)
-- ============================================================================
-- Backs Section 5 · Task 3: TC notification on file submission.
-- Stores in-portal notifications. Realtime publication enabled so the TC
-- Cockpit can subscribe and show a toast + badge the moment a new row appears.
--
-- Senders (edge functions, triggers running as service_role) INSERT.
-- Recipients READ + UPDATE (to mark read) via RLS on auth.uid().
-- ============================================================================

create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  recipient_id    uuid not null references auth.users(id) on delete cascade,
  type            text not null check (type in (
                    'tc_file_assigned',
                    'tc_file_reassigned',
                    'agent_message',
                    'system'
                  )),
  title           text not null,
  body            text,
  related_file_id uuid references public.tc_files(id) on delete cascade,
  payload         jsonb not null default '{}'::jsonb,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_id, created_at desc)
  where read_at is null;

create index if not exists notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc);

create index if not exists notifications_file_idx
  on public.notifications (related_file_id)
  where related_file_id is not null;

alter table public.notifications enable row level security;

-- Recipients read only their own
drop policy if exists notifications_recipient_select on public.notifications;
create policy notifications_recipient_select on public.notifications
  for select using (recipient_id = auth.uid());

-- Recipients can mark their own as read (no other column edits allowed)
drop policy if exists notifications_recipient_update on public.notifications;
create policy notifications_recipient_update on public.notifications
  for update using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- No anon INSERT or DELETE. Only service_role (edge functions / triggers).

-- Realtime publication
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

comment on table public.notifications is
  'In-portal notifications for TCs, brokers, and agents. Paired with email send via edge functions. Realtime subscription powers the TC Cockpit bell + toast.';
