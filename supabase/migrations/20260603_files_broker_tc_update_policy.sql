-- ============================================================================
-- Aari Transactions · files UPDATE policy (broker + assigned TC + agent)
-- ============================================================================
-- The broker's "Assign TC" control writes files.assigned_tc_id, but the files
-- table had no UPDATE policy granting brokers write access — so RLS silently
-- rejected the update (0 rows changed, no error) and the assignment never
-- persisted. This adds the missing policy.
--
-- Brokers can update any file. The assigned TC can update their own files.
-- The submitting agent can update their own file. Idempotent · safe to re-run.
-- ============================================================================

alter table public.files enable row level security;

drop policy if exists "files_broker_tc_update" on public.files;
create policy "files_broker_tc_update"
  on public.files for update
  to authenticated
  using (
    public.is_broker()
    or assigned_tc_id = auth.uid()
    or agent_id = auth.uid()
  )
  with check (
    public.is_broker()
    or assigned_tc_id = auth.uid()
    or agent_id = auth.uid()
  );
