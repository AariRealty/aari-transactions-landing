-- ============================================================================
-- File Organization conductor
-- ----------------------------------------------------------------------------
-- A file can carry a SERVICE (managed by the service TC = assigned_tc_id, e.g.
-- Marlenyi for C2C / Listing / Offer Prep) AND its FILE ORGANIZATION, which is
-- conducted by a different TC (Milennys / Eileen / Catherine). fg_tc_id records
-- the File-Org conductor so the SAME file can appear under the service TC's
-- cockpit (via assigned_tc_id) and under the FG conductor's cockpit (via
-- fg_tc_id). For a pure File-Organization file there is no separate service, so
-- assigned_tc_id is set to the FG conductor as well.
-- ============================================================================

alter table public.files
  add column if not exists fg_tc_id uuid references public.agents(id);

comment on column public.files.fg_tc_id is
  'TC who conducts File Organization on this file (Milennys/Eileen/Catherine). Separate from assigned_tc_id (the service TC). A file surfaces under both profiles.';

create index if not exists idx_files_fg_tc on public.files(fg_tc_id);

-- An FG conductor can READ the files they conduct. Permissive/additive to the
-- existing "agent reads own / TC reads assigned / broker reads all" policies.
-- References only files.fg_tc_id + auth.uid() — no cross-table join, so it
-- cannot create the RLS recursion the teams policies once did.
drop policy if exists files_fg_tc_read on public.files;
create policy files_fg_tc_read on public.files for select using (
  fg_tc_id = auth.uid()
);
