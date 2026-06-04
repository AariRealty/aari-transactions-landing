-- ============================================================================
-- Aari Transactions · Stage checklist storage (June 2026 · TC checklists build)
-- ============================================================================
-- One jsonb per file: { "<task_id>": { "done": true, "at": "<ISO>", "by": "<name>" } }
-- Task ids are globally unique across stages, so prior-stage history survives
-- stage moves and renders as the collapsed archive. Idempotent.
-- ============================================================================

alter table public.files
  add column if not exists stage_tasks jsonb not null default '{}'::jsonb;
