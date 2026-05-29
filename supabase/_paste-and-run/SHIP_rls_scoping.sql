-- ============================================================================
-- Aari Transactions · RLS scoping by assigned_tc_id · paste-and-run
-- ============================================================================
-- Tightens RLS on file_email_sends, file_deadlines, file_verifications so a
-- TC can only see/modify rows on files THEY are assigned to. Brokers retain
-- full visibility across all files.
--
-- Why: previous policies only checked role in ('tc','broker'), which means
-- any TC could read/write any other TC's file data. Theoretical risk today
-- (single-TC operation) but critical before TC #2 ships.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

begin;

-- Helper expression used in every policy below:
-- (broker OR (assigned to this TC))
-- We inline this rather than create a function to avoid cross-schema deps.

-- ============================================================================
-- file_email_sends
-- ============================================================================
drop policy if exists fes_staff_select on public.file_email_sends;
create policy fes_staff_select on public.file_email_sends
  for select to authenticated using (
    exists (
      select 1 from public.agents a
      where a.id = auth.uid()
        and (
          a.role = 'broker'
          or (a.role = 'tc' and exists (
            select 1 from public.files f
            where f.id = file_email_sends.file_id
              and f.assigned_tc_id = auth.uid()
          ))
        )
    )
  );

drop policy if exists fes_staff_insert on public.file_email_sends;
create policy fes_staff_insert on public.file_email_sends
  for insert to authenticated with check (
    exists (
      select 1 from public.agents a
      where a.id = auth.uid()
        and (
          a.role = 'broker'
          or (a.role = 'tc' and exists (
            select 1 from public.files f
            where f.id = file_email_sends.file_id
              and f.assigned_tc_id = auth.uid()
          ))
        )
    )
  );

drop policy if exists fes_staff_delete on public.file_email_sends;
create policy fes_staff_delete on public.file_email_sends
  for delete to authenticated using (
    exists (
      select 1 from public.agents a
      where a.id = auth.uid()
        and (
          a.role = 'broker'
          or (a.role = 'tc' and exists (
            select 1 from public.files f
            where f.id = file_email_sends.file_id
              and f.assigned_tc_id = auth.uid()
          ))
        )
    )
  );

-- ============================================================================
-- file_deadlines
-- ============================================================================
drop policy if exists fd_staff_select on public.file_deadlines;
create policy fd_staff_select on public.file_deadlines
  for select to authenticated using (
    exists (
      select 1 from public.agents a
      where a.id = auth.uid()
        and (
          a.role = 'broker'
          or (a.role = 'tc' and exists (
            select 1 from public.files f
            where f.id = file_deadlines.file_id
              and f.assigned_tc_id = auth.uid()
          ))
        )
    )
  );

drop policy if exists fd_staff_upsert on public.file_deadlines;
create policy fd_staff_upsert on public.file_deadlines
  for insert to authenticated with check (
    exists (
      select 1 from public.agents a
      where a.id = auth.uid()
        and (
          a.role = 'broker'
          or (a.role = 'tc' and exists (
            select 1 from public.files f
            where f.id = file_deadlines.file_id
              and f.assigned_tc_id = auth.uid()
          ))
        )
    )
  );

drop policy if exists fd_staff_update on public.file_deadlines;
create policy fd_staff_update on public.file_deadlines
  for update to authenticated using (
    exists (
      select 1 from public.agents a
      where a.id = auth.uid()
        and (
          a.role = 'broker'
          or (a.role = 'tc' and exists (
            select 1 from public.files f
            where f.id = file_deadlines.file_id
              and f.assigned_tc_id = auth.uid()
          ))
        )
    )
  );

drop policy if exists fd_staff_delete on public.file_deadlines;
create policy fd_staff_delete on public.file_deadlines
  for delete to authenticated using (
    exists (
      select 1 from public.agents a
      where a.id = auth.uid()
        and (
          a.role = 'broker'
          or (a.role = 'tc' and exists (
            select 1 from public.files f
            where f.id = file_deadlines.file_id
              and f.assigned_tc_id = auth.uid()
          ))
        )
    )
  );

-- ============================================================================
-- file_verifications
-- ============================================================================
drop policy if exists fv_staff_select on public.file_verifications;
create policy fv_staff_select on public.file_verifications
  for select to authenticated using (
    exists (
      select 1 from public.agents a
      where a.id = auth.uid()
        and (
          a.role = 'broker'
          or (a.role = 'tc' and exists (
            select 1 from public.files f
            where f.id = file_verifications.file_id
              and f.assigned_tc_id = auth.uid()
          ))
        )
    )
  );

drop policy if exists fv_staff_upsert on public.file_verifications;
create policy fv_staff_upsert on public.file_verifications
  for insert to authenticated with check (
    exists (
      select 1 from public.agents a
      where a.id = auth.uid()
        and (
          a.role = 'broker'
          or (a.role = 'tc' and exists (
            select 1 from public.files f
            where f.id = file_verifications.file_id
              and f.assigned_tc_id = auth.uid()
          ))
        )
    )
  );

drop policy if exists fv_staff_update on public.file_verifications;
create policy fv_staff_update on public.file_verifications
  for update to authenticated using (
    exists (
      select 1 from public.agents a
      where a.id = auth.uid()
        and (
          a.role = 'broker'
          or (a.role = 'tc' and exists (
            select 1 from public.files f
            where f.id = file_verifications.file_id
              and f.assigned_tc_id = auth.uid()
          ))
        )
    )
  );

drop policy if exists fv_staff_delete on public.file_verifications;
create policy fv_staff_delete on public.file_verifications
  for delete to authenticated using (
    exists (
      select 1 from public.agents a
      where a.id = auth.uid()
        and (
          a.role = 'broker'
          or (a.role = 'tc' and exists (
            select 1 from public.files f
            where f.id = file_verifications.file_id
              and f.assigned_tc_id = auth.uid()
          ))
        )
    )
  );

commit;

-- ============================================================================
-- CONFIRMATION · expected 12 rows · all status = 'ok'
-- ============================================================================
select tablename || '.' || policyname as policy_check,
  case when qual is not null or with_check is not null then 'ok' else 'EMPTY' end as status
from pg_policies
where schemaname='public'
  and tablename in ('file_email_sends','file_deadlines','file_verifications')
  and policyname in (
    'fes_staff_select','fes_staff_insert','fes_staff_delete',
    'fd_staff_select','fd_staff_upsert','fd_staff_update','fd_staff_delete',
    'fv_staff_select','fv_staff_upsert','fv_staff_update','fv_staff_delete'
  )
order by tablename, policyname;
