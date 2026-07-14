-- ============================================================================
-- 20260714 · Scope file + file_contracts reads to the assigned TC (privacy fix)
-- ============================================================================
-- BEFORE: "Staff can read all files" let ANY user with role tc/broker read
-- EVERY row in public.files — the master PII table (parties, contacts, price,
-- addresses in the logistics jsonb). With multiple TCs live (Eileen, Milennys,
-- Catherine) every TC could read every other TC's clients' confidential files.
--
-- AFTER: broker still reads all; a TC reads only files ASSIGNED to them
-- (assigned_tc_id / fg_tc_id) PLUS the unassigned claim pool (assigned_tc_id
-- IS NULL) so the "grab a new file" workflow in files.html (the query at
-- ~line 6867: `.or(assigned_tc_id.eq.<me>,fg_tc_id.eq.<me>,assigned_tc_id.is.null)`)
-- keeps working; an agent reads only their own files. Team-lead read is a
-- separate policy and is intentionally left untouched (policies OR together).
--
-- Reversible: re-run the prior definition (role in ('tc','broker') with no
-- assignment predicate) to restore the old behavior.
-- ============================================================================

-- ---- files: scoped SELECT ---------------------------------------------------
drop policy if exists "Staff can read all files" on public.files;
create policy "Staff can read all files"
  on public.files for select
  to authenticated
  using (
    agent_id = auth.uid()
    or assigned_tc_id = auth.uid()
    or fg_tc_id = auth.uid()
    -- unassigned claim pool: any TC/broker may see files not yet assigned so
    -- they can accept one. Once assigned, only that TC (or broker) sees it.
    or (assigned_tc_id is null
        and exists (select 1 from public.agents a
                    where a.id = auth.uid() and a.role in ('tc','broker')))
    or exists (select 1 from public.agents a
               where a.id = auth.uid() and a.role = 'broker')
  );

-- ---- file_contracts: scope staff read/write to the file's TC or broker ------
-- These rows carry signer names + external_url links to the executed contracts.
-- (contracts_library is a shared TEMPLATE catalog, not per-client data, so it
-- is intentionally left as staff-wide.)
drop policy if exists "Staff read file contracts" on public.file_contracts;
create policy "Staff read file contracts"
  on public.file_contracts for select
  to authenticated
  using (
    exists (
      select 1 from public.files f
      where f.id = file_contracts.file_id
        and ( f.assigned_tc_id = auth.uid()
              or f.fg_tc_id = auth.uid()
              or exists (select 1 from public.agents a
                         where a.id = auth.uid() and a.role = 'broker') )
    )
  );

drop policy if exists "Staff write file contracts" on public.file_contracts;
create policy "Staff write file contracts"
  on public.file_contracts for all
  to authenticated
  using (
    exists (
      select 1 from public.files f
      where f.id = file_contracts.file_id
        and ( f.assigned_tc_id = auth.uid()
              or f.fg_tc_id = auth.uid()
              or exists (select 1 from public.agents a
                         where a.id = auth.uid() and a.role = 'broker') )
    )
  )
  with check (
    exists (
      select 1 from public.files f
      where f.id = file_contracts.file_id
        and ( f.assigned_tc_id = auth.uid()
              or f.fg_tc_id = auth.uid()
              or exists (select 1 from public.agents a
                         where a.id = auth.uid() and a.role = 'broker') )
    )
  );
