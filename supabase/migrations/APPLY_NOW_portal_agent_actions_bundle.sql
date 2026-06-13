-- ============================================================================
-- APPLY NOW · Portal agent-actions bundle (June 13, 2026)
-- ============================================================================
-- Paste this whole file into the Supabase SQL editor and Run it ONCE.
-- It is idempotent — safe to run again; nothing is dropped or lost.
--
-- It sets up everything the portal redesign needs:
--   PART 1 · file_agent_actions table  (TC → agent "Action needed" hero)
--   PART 2 · direction column          (agent → TC "Request a change")
--   PART 3 · file-documents bucket + table + policies (agent "upload" flow)
--   PART 4 · verification (confirms the bucket + table exist)
-- ============================================================================


-- ============================================================================
-- PART 1 · file_agent_actions  (the two-way request spine)
-- ============================================================================
create table if not exists public.file_agent_actions (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  action_type text not null default 'review',
  label text not null,
  detail text,
  due_date date,
  status text not null default 'open',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

comment on table public.file_agent_actions is
  'Agent-facing action requests + agent→TC requests per file. action_type: sign | upload | confirm | review | extend_date | addendum | adjust_term | cancel | other. status: open | done | cancelled.';

create index if not exists idx_file_agent_actions_file on public.file_agent_actions (file_id);
create index if not exists idx_file_agent_actions_open on public.file_agent_actions (file_id, status);

alter table public.file_agent_actions enable row level security;

-- Staff (TC / broker): full read + write
drop policy if exists faa_staff_select on public.file_agent_actions;
create policy faa_staff_select on public.file_agent_actions for select to authenticated using (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
);
drop policy if exists faa_staff_insert on public.file_agent_actions;
create policy faa_staff_insert on public.file_agent_actions for insert to authenticated with check (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
);
drop policy if exists faa_staff_update on public.file_agent_actions;
create policy faa_staff_update on public.file_agent_actions for update to authenticated using (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
);

-- Agent: read + resolve actions on their OWN files
drop policy if exists faa_agent_select on public.file_agent_actions;
create policy faa_agent_select on public.file_agent_actions for select to authenticated using (
  exists (select 1 from public.files f where f.id = file_agent_actions.file_id and f.agent_id = auth.uid())
);
drop policy if exists faa_agent_update on public.file_agent_actions;
create policy faa_agent_update on public.file_agent_actions for update to authenticated using (
  exists (select 1 from public.files f where f.id = file_agent_actions.file_id and f.agent_id = auth.uid())
) with check (
  exists (select 1 from public.files f where f.id = file_agent_actions.file_id and f.agent_id = auth.uid())
);


-- ============================================================================
-- PART 2 · direction column  (makes the table two-way)
--   to_agent = TC/broker → agent ask (default) · to_tc = agent → TC request
-- ============================================================================
alter table public.file_agent_actions
  add column if not exists direction text not null default 'to_agent';

comment on column public.file_agent_actions.direction is
  'to_agent = TC/broker → agent ask (Action-needed hero) · to_tc = agent → TC request (cockpit to-do)';

create index if not exists idx_file_agent_actions_dir
  on public.file_agent_actions (file_id, direction, status);

-- Agents may RAISE requests to the TC on their own files (direction must be to_tc)
drop policy if exists faa_agent_insert on public.file_agent_actions;
create policy faa_agent_insert on public.file_agent_actions for insert to authenticated with check (
  direction = 'to_tc'
  and exists (select 1 from public.files f where f.id = file_agent_actions.file_id and f.agent_id = auth.uid())
);


-- ============================================================================
-- PART 3 · file-documents bucket + table + policies  (agent "upload" flow)
-- ============================================================================
-- 3a · Create the bucket if it doesn't exist (private — signed URLs only).
insert into storage.buckets (id, name, public)
values ('file-documents', 'file-documents', false)
on conflict (id) do nothing;

-- 3b · Table that records each uploaded document.
create table if not exists public.file_documents (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  uploaded_by uuid not null references public.agents(id) on delete restrict,
  filename text not null,
  storage_path text not null,
  content_type text,
  uploaded_at timestamptz not null default now()
);
create index if not exists file_documents_file_idx on public.file_documents (file_id);
create index if not exists file_documents_uploaded_by_idx on public.file_documents (uploaded_by);

alter table public.file_documents enable row level security;

drop policy if exists "Agents read own file documents" on public.file_documents;
create policy "Agents read own file documents" on public.file_documents for select to authenticated using (
  exists (select 1 from public.files f where f.id = file_documents.file_id and f.agent_id = auth.uid())
);
drop policy if exists "Agents insert own file documents" on public.file_documents;
create policy "Agents insert own file documents" on public.file_documents for insert to authenticated with check (
  uploaded_by = auth.uid()
  and exists (select 1 from public.files f where f.id = file_documents.file_id and f.agent_id = auth.uid())
);
drop policy if exists "Agents delete own file documents" on public.file_documents;
create policy "Agents delete own file documents" on public.file_documents for delete to authenticated using (
  uploaded_by = auth.uid()
  and exists (select 1 from public.files f where f.id = file_documents.file_id and f.agent_id = auth.uid())
);
drop policy if exists "Staff read all file documents" on public.file_documents;
create policy "Staff read all file documents" on public.file_documents for select to authenticated using (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
);
drop policy if exists "Staff write file documents" on public.file_documents;
create policy "Staff write file documents" on public.file_documents for insert to authenticated with check (
  exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
);

-- 3c · Storage object policies for the file-documents bucket.
drop policy if exists "Agents upload own folder" on storage.objects;
create policy "Agents upload own folder" on storage.objects for insert to authenticated with check (
  bucket_id = 'file-documents' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "Agents read own folder" on storage.objects;
create policy "Agents read own folder" on storage.objects for select to authenticated using (
  bucket_id = 'file-documents' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "Agents delete own folder" on storage.objects;
create policy "Agents delete own folder" on storage.objects for delete to authenticated using (
  bucket_id = 'file-documents' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "Staff read all file-documents bucket" on storage.objects;
create policy "Staff read all file-documents bucket" on storage.objects for select to authenticated using (
  bucket_id = 'file-documents'
  and exists (select 1 from public.agents a where a.id = auth.uid() and a.role in ('tc','broker'))
);


-- ============================================================================
-- PART 4 · VERIFY · run these SELECTs after the above to confirm
-- ============================================================================
-- Should return one row showing the column exists:
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'file_agent_actions' and column_name = 'direction';

-- Should return one row · the bucket exists:
select id, name, public from storage.buckets where id = 'file-documents';
