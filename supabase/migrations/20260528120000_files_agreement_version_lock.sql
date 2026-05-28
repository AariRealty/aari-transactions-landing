-- ============================================================================
-- Aari Transactions · File-level Service Agreement version lock (May 2026)
-- ============================================================================
-- IMPORTANT FOR MARLENYI
-- Run this file via Supabase Web SQL Editor
-- (Dashboard -> SQL Editor -> New Query -> paste contents -> Run).
-- This migration is idempotent (uses IF NOT EXISTS), so re-running is safe.
-- ============================================================================
-- WHAT THIS DOES
-- 1. Ensures public.files has a `signed_agreement_version` column that stores
--    the Service Agreement version (e.g., v4.7) that was in effect when the
--    agent submitted the file. This value is frozen for the life of the file
--    even if the agent later signs a newer SA version.
-- 2. Backfills existing files where the column is NULL using a sensible
--    default ('v4.6' or earlier) so reporting queries don't break.
-- ============================================================================

-- ----- 1. Add column if it doesn't already exist -----
ALTER TABLE public.files
  ADD COLUMN IF NOT EXISTS signed_agreement_version TEXT;

COMMENT ON COLUMN public.files.signed_agreement_version IS 'The Service Agreement version (e.g., v4.7) in effect at the moment the agent submitted this file. Frozen for the life of the file.';

-- ----- 2. Backfill: any existing files with NULL get marked as legacy (v4.6) -----
-- Safe assumption: anything submitted prior to this migration was governed by
-- the SA version that was active before v4.7 (i.e., v4.6).
UPDATE public.files
   SET signed_agreement_version = 'v4.6'
 WHERE signed_agreement_version IS NULL;

-- ----- 3. Helpful index for filtering by SA version (optional, low cost) -----
CREATE INDEX IF NOT EXISTS idx_files_signed_agreement_version
  ON public.files (signed_agreement_version);
