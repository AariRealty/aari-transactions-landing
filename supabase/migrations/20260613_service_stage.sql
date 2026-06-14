-- ============================================================================
-- service_stage · real stage progression for NON-TC services.
-- TC files use transaction_stage (attested pipeline). Non-TC services
-- (Listing Coordinator, Offer Prep, Listing Docs, MLS Setup, File Org,
-- Standalone Review, Rental) had no stage field — the agent saw only a coarse
-- Received/In-progress/Delivered guess. This column stores the current stage
-- NAME, matching the portal's per-service track (e.g. 'Received', 'Drafting',
-- 'Delivered'), set by the TC from the cockpit. Read-only to the agent.
-- ============================================================================

alter table public.files add column if not exists service_stage text;

comment on column public.files.service_stage is
  'Non-TC service progression · current stage NAME matching the portal service track. TC-set. TC files use transaction_stage instead.';
