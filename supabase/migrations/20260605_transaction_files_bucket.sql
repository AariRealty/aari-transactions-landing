-- ============================================================================
-- Aari Transactions · Transaction-files storage bucket (May 2026)
-- ============================================================================
-- Every file submitted via Path A (executed contract + up to 5 additional docs)
-- goes to this bucket. Netlify Forms only ever receives the METADATA + a signed
-- URL — never the actual file. Honors the Aari SA Section 6 commitment to
-- delete Client Data within 30 days of closing.
--
-- Path pattern: transaction-files/{agent_auth_uid}/{submission_uuid}/{filename}
--
-- The bucket is PRIVATE · no public access. Files are accessed only via
-- short-lived signed URLs generated server-side at submit time (7-day TTL).
--
-- Idempotent · safe to re-run.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('transaction-files', 'transaction-files', false)
on conflict (id) do nothing;

-- Insert · agent can upload to their own auth.uid folder. Broker overrides.
drop policy if exists "transaction_files_agent_insert" on storage.objects;
create policy "transaction_files_agent_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'transaction-files'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or public.is_broker()
    )
  );

-- Update · same access pattern as insert.
drop policy if exists "transaction_files_agent_update" on storage.objects;
create policy "transaction_files_agent_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'transaction-files'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or public.is_broker()
    )
  );

-- Delete · agent can delete their own files, broker can delete anything.
-- This is what powers manual cleanup until the scheduled function ships.
drop policy if exists "transaction_files_agent_delete" on storage.objects;
create policy "transaction_files_agent_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'transaction-files'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or public.is_broker()
    )
  );

-- Read · authenticated only. Public access blocked. TC downloads happen via
-- signed URL (which bypasses RLS by design · signed URLs are pre-authenticated).
drop policy if exists "transaction_files_agent_read" on storage.objects;
create policy "transaction_files_agent_read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'transaction-files'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or public.is_broker()
    )
  );

-- ============================================================================
-- TODO · 30-day auto-cleanup (next session)
-- ============================================================================
-- Per Aari SA Section 6, all files in this bucket must be deleted within 30
-- days of closing (or 30 days of submission for files where engagement ended).
--
-- Recommended implementation when ready:
--   1. Add submission_id + closed_at columns to a transaction_submissions table
--   2. Schedule a daily Edge Function that:
--      - Lists storage.objects in this bucket older than 30 days
--      - Calls supabase.storage.from('transaction-files').remove([paths])
--      - Logs deletions to a transaction_files_audit table for DBPR records
--
-- Until automation ships: monthly manual cleanup via Supabase Dashboard →
-- Storage → transaction-files → sort by Created (oldest first) → delete
-- anything older than 30 days that's also past closing.
-- ============================================================================
