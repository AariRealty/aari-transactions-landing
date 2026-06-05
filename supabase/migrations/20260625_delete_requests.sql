-- ============================================================================
-- Aari Transactions · TC → broker delete requests (June 2026)
-- ============================================================================
-- TCs cannot delete files (broker-only, enforced in broker_delete_file).
-- This adds the polite path: a TC flags a file for deletion with a reason;
-- the broker sees the request in her drawer + morning briefing and decides.
-- One jsonb: { requested_by, requested_by_name, reason, at }. Idempotent.
-- ============================================================================

alter table public.files
  add column if not exists delete_request jsonb;
