-- ============================================================================
-- Aari Transactions · Agent portal Item 3 — document read access (June 2026)
-- ============================================================================
-- AUDIT FINDING: storage policy "transaction_files_agent_read" only lets an
-- agent read objects under their OWN auth.uid folder. When a TC submits on
-- behalf of an agent, objects land under the TC's folder — the agent owns the
-- file row (files.agent_id) but cannot sign/read its documents.
--
-- FIX: agents may read any object in transaction-files whose second path
-- folder is the id of a file THEY own. Path pattern is
--   {submitter_auth_uid}/{file_id}/{filename}
--   {submitter_auth_uid}/{file_id}/additional/{filename}
-- so (storage.foldername(name))[2] is always the file id.
--
-- Read-only · no insert/update/delete granted by this policy. Idempotent.
-- ============================================================================

drop policy if exists "transaction_files_agent_read_own_files" on storage.objects;
create policy "transaction_files_agent_read_own_files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'transaction-files'
    and exists (
      select 1 from public.files f
      where f.id::text = (storage.foldername(name))[2]
        and f.agent_id = auth.uid()
    )
  );
