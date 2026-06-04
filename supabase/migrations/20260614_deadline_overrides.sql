-- ============================================================================
-- Aari Transactions · Per-deadline manual overrides (June 2026)
-- ============================================================================
-- Auto-calculated deadlines use FAR/BAR AS-IS defaults (3/5/10/15/30 days);
-- real contracts negotiate different periods. TCs tap a deadline to enter the
-- contract's actual date · stored here per deadline key · auto-calc resumes
-- when the override is cleared. Idempotent.
-- ============================================================================

alter table public.files
  add column if not exists deadline_overrides jsonb not null default '{}'::jsonb;
