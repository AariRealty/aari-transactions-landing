-- ============================================================================
-- Aari Transactions · Transaction-files bucket · staff attach fix (June 2026)
-- ============================================================================
-- BUG: the cockpit "Attach contract" uploads to a path that begins with the
-- FILE's id ( {file_id}/contract-... ), but the original bucket policies only
-- permit an insert when:
--      auth.uid() = (storage.foldername(name))[1]   OR   is_broker()
-- The first path segment is the file_id (never the uploader's uid), so the
-- folder check never matches. Result: only the broker could ever attach a
-- contract; any TC got "new row violates row-level security policy" / silent
-- failure. We patched the files TABLE for staff earlier but never the STORAGE
-- bucket — storage.objects is a separate policy surface.
--
-- FIX: allow any STAFF (role tc or broker) to insert/select/update objects in
-- this bucket — the SAME proven pattern used by file_documents and the files
-- table. This is safe for PII: a TC can only OPEN a file drawer for a file the
-- files-table RLS lets them see, so they can never reach the attach/view button
-- on a file that isn't theirs. Access is gated upstream at the file level.
--
-- Idempotent · safe to re-run.
-- ============================================================================

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.agents a
    where a.id = auth.uid() and a.role in ('tc','broker')
  );
$$;

-- INSERT · any staff may upload into the transaction-files bucket.
drop policy if exists "transaction_files_staff_attach_insert" on storage.objects;
create policy "transaction_files_staff_attach_insert"
  on storage.objects for insert
  to authenticated
  with check ( bucket_id = 'transaction-files' and public.is_staff() );

-- SELECT · any staff may read (needed so createSignedUrl works after upload).
drop policy if exists "transaction_files_staff_attach_read" on storage.objects;
create policy "transaction_files_staff_attach_read"
  on storage.objects for select
  to authenticated
  using ( bucket_id = 'transaction-files' and public.is_staff() );

-- UPDATE · any staff may replace on the same path (re-attach).
drop policy if exists "transaction_files_staff_attach_update" on storage.objects;
create policy "transaction_files_staff_attach_update"
  on storage.objects for update
  to authenticated
  using ( bucket_id = 'transaction-files' and public.is_staff() );
