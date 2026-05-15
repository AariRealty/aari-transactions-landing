-- Aari Transactions · file_documents table + RLS (May 2026)
-- AP-9 follow-up · Real file uploads via Supabase Storage.
-- Bucket "file-documents" must be created manually in Supabase Storage UI.
-- Storage path pattern: {agent_id}/{file_id}/{timestamp}-{filename}

create table if not exists public.file_documents (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  uploaded_by uuid not null references public.agents(id) on delete restrict,
  filename text not null,
  storage_path text not null,
  content_type text,
  size_bytes integer check (size_bytes >= 0),
  uploaded_at timestamptz not null default now()
);

create index if not exists file_documents_file_idx on public.file_documents (file_id);
create index if not exists file_documents_uploaded_by_idx on public.file_documents (uploaded_by);
create index if not exists file_documents_uploaded_at_idx on public.file_documents (uploaded_at desc);

alter table public.file_documents enable row level security;

-- Agents can read documents on files they own.
drop policy if exists "Agents read own file documents" on public.file_documents;
create policy "Agents read own file documents"
  on public.file_documents for select
  to authenticated
  using (
    exists (
      select 1 from public.files f
      where f.id = file_documents.file_id
        and f.agent_id = auth.uid()
    )
  );

-- Agents can insert documents on files they own.
drop policy if exists "Agents insert own file documents" on public.file_documents;
create policy "Agents insert own file documents"
  on public.file_documents for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.files f
      where f.id = file_documents.file_id
        and f.agent_id = auth.uid()
    )
  );

-- Agents can delete documents they uploaded on files they own.
drop policy if exists "Agents delete own file documents" on public.file_documents;
create policy "Agents delete own file documents"
  on public.file_documents for delete
  to authenticated
  using (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.files f
      where f.id = file_documents.file_id
        and f.agent_id = auth.uid()
    )
  );

-- Staff (tc, broker) can read all file documents.
drop policy if exists "Staff read all file documents" on public.file_documents;
create policy "Staff read all file documents"
  on public.file_documents for select
  to authenticated
  using (
    exists (
      select 1 from public.agents a
      where a.id = auth.uid()
        and a.role in ('tc', 'broker')
    )
  );

-- Staff can write file documents (e.g., uploading on behalf of agent).
drop policy if exists "Staff write file documents" on public.file_documents;
create policy "Staff write file documents"
  on public.file_documents for insert
  to authenticated
  with check (
    exists (
      select 1 from public.agents a
      where a.id = auth.uid()
        and a.role in ('tc', 'broker')
    )
  );

-- ============================================================================
-- STORAGE BUCKET POLICIES (must be created in Supabase Storage UI first)
-- Bucket name: file-documents
-- Public: NO. Files served via signed URLs only.
--
-- After creating the bucket, run the policies below in SQL Editor.
-- ============================================================================

-- Agents can upload to their own folder ({agent_id}/...).
drop policy if exists "Agents upload own folder" on storage.objects;
create policy "Agents upload own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'file-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Agents can read from their own folder.
drop policy if exists "Agents read own folder" on storage.objects;
create policy "Agents read own folder"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'file-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Agents can delete from their own folder.
drop policy if exists "Agents delete own folder" on storage.objects;
create policy "Agents delete own folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'file-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Staff (tc, broker) can read every object in the bucket.
drop policy if exists "Staff read all file-documents bucket" on storage.objects;
create policy "Staff read all file-documents bucket"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'file-documents'
    and exists (
      select 1 from public.agents a
      where a.id = auth.uid()
        and a.role in ('tc', 'broker')
    )
  );
