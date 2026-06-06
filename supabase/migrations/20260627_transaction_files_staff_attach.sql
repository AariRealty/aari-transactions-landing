-- ============================================================================
-- Aari Transactions · Transaction-files bucket · staff attach fix (June 2026)
-- ============================================================================
-- BUG: the cockpit "Attach contract" uploads to a path that begins with the
-- FILE's id ( {file_id}/contract-... ), but the original bucket policies only
-- permit an insert when:
--      auth.uid() = (storage.foldername(name))[1]   OR   is_broker()
-- Since the first path segment is the file_id (never the uploader's uid), the
-- folder check never matches. Result: only the broker could ever attach a
-- contract — an assigned TC always got "new row violates row-level security
-- policy" (or a silent failure). The files TABLE got a staff policy earlier;
-- the STORAGE bucket never did. This migration closes that gap.
--
-- Scope is deliberately tight (compliance / PII): a TC may write/read an object
-- under a file's folder ONLY if that file is assigned to them. Broker keeps full
-- access. The agent intake path ( {agent_uid}/{file_id}/... ) is unchanged and
-- still covered by the existing own-folder policies.
--
-- Idempotent · safe to re-run.
-- ============================================================================

-- INSERT · broker, or the TC assigned to the file whose id is the first path
-- segment, may upload into the transaction-files bucket.
drop policy if exists "transaction_files_staff_attach_insert" on storage.objects;
create policy "transaction_files_staff_attach_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'transaction-files'
    and (
      public.is_broker()
      or exists (
        select 1 from public.files f
        where f.id::text = (storage.foldername(name))[1]
          and f.assigned_tc_id = auth.uid()
      )
    )
  );

-- SELECT · same scope (needed so createSignedUrl works for the assigned TC).
drop policy if exists "transaction_files_staff_attach_read" on storage.objects;
create policy "transaction_files_staff_attach_read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'transaction-files'
    and (
      public.is_broker()
      or exists (
        select 1 from public.files f
        where f.id::text = (storage.foldername(name))[1]
          and f.assigned_tc_id = auth.uid()
      )
    )
  );

-- UPDATE · same scope (re-attach / replace on the same path).
drop policy if exists "transaction_files_staff_attach_update" on storage.objects;
create policy "transaction_files_staff_attach_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'transaction-files'
    and (
      public.is_broker()
      or exists (
        select 1 from public.files f
        where f.id::text = (storage.foldername(name))[1]
          and f.assigned_tc_id = auth.uid()
      )
    )
  );
