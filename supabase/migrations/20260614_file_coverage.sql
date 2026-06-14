-- ============================================================================
-- File coverage / billing lane
-- ----------------------------------------------------------------------------
-- "coverage" answers WHO is paying and under what arrangement. It is separate
-- from service_type (which still drives the checklist + the underlying work
-- type) and from file_type (the deal type: sale / listing / rental).
--
--   in_house   · Aari Realty's own roster. Aari Transactions services these as
--                FILE ORGANIZATION, covered internally. No payment gate.
--   team_plan  · An outside brokerage team whose LEAD pays a monthly membership
--                that covers the roster.
--   standalone · An individual outside agent paying UPFRONT, per service.
--
-- PRODUCT LABEL shown in the UI is DERIVED, not stored:
--   coverage = in_house        -> "File Organization"
--   coverage in (team_plan,
--                standalone)    -> the purchased service's display name
--                                  (Listing Coordinator, Contract to Close, ...)
-- File organization is NEVER a separate add-on on a paid file — a paid service
-- already includes organizing the file. File Organization as a product = the
-- in_house lane only.
-- ============================================================================

alter table public.files
  add column if not exists coverage text not null default 'standalone';

-- guard the allowed values (add separately so re-runs don't error)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'files_coverage_check'
  ) then
    alter table public.files
      add constraint files_coverage_check
      check (coverage in ('in_house', 'team_plan', 'standalone'));
  end if;
end $$;

comment on column public.files.coverage is
  'Billing/coverage lane: in_house (Aari Realty · File Organization · covered) | team_plan (outside team membership, billed to lead) | standalone (individual outside agent, upfront per service). Drives the product label + coverage badge; service_type still drives the checklist.';

-- ---------------------------------------------------------------------------
-- Backfill: the June 14 bulk import is your Aari Realty roster -> in_house.
-- ---------------------------------------------------------------------------
update public.files
set coverage = 'in_house'
where agent_notes = 'Bulk import 2026-06-14';
